use axum::{
    body::Body,
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json,
    Router,
};
use law_eye_db::CreateAuditLog;
use serde_json::json;
use std::net::SocketAddr;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new().route("/{id}", get(get_object))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ByteRange {
    start: u64,
    end: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RangeParseError {
    Invalid,
    Unsatisfiable,
}

fn parse_single_byte_range(value: &str, size: u64) -> Result<ByteRange, RangeParseError> {
    if size == 0 {
        return Err(RangeParseError::Unsatisfiable);
    }

    let value = value.trim();
    let spec = value
        .strip_prefix("bytes=")
        .ok_or(RangeParseError::Invalid)?
        .trim();

    if spec.contains(',') {
        return Err(RangeParseError::Invalid);
    }

    let (raw_start, raw_end) = spec.split_once('-').ok_or(RangeParseError::Invalid)?;
    let raw_start = raw_start.trim();
    let raw_end = raw_end.trim();

    if raw_start.is_empty() {
        // Suffix-byte-range-spec: "-<suffix-length>"
        let suffix_len: u64 = raw_end.parse().map_err(|_| RangeParseError::Invalid)?;
        if suffix_len == 0 {
            return Err(RangeParseError::Invalid);
        }

        if suffix_len >= size {
            return Ok(ByteRange {
                start: 0,
                end: size - 1,
            });
        }

        return Ok(ByteRange {
            start: size - suffix_len,
            end: size - 1,
        });
    }

    let start: u64 = raw_start.parse().map_err(|_| RangeParseError::Invalid)?;
    if start >= size {
        return Err(RangeParseError::Unsatisfiable);
    }

    let end = if raw_end.is_empty() {
        size - 1
    } else {
        let parsed: u64 = raw_end.parse().map_err(|_| RangeParseError::Invalid)?;
        parsed.min(size - 1)
    };

    if end < start {
        return Err(RangeParseError::Invalid);
    }

    Ok(ByteRange { start, end })
}

fn range_not_satisfiable_response(size: u64, message: &str) -> Response {
    let mut response = (
        StatusCode::RANGE_NOT_SATISFIABLE,
        Json(ApiError::new(message).with_code("RANGE_NOT_SATISFIABLE")),
    )
        .into_response();

    response.headers_mut().insert(
        header::ACCEPT_RANGES,
        HeaderValue::from_static("bytes"),
    );

    let header_value = HeaderValue::from_str(&format!("bytes */{size}"))
        .unwrap_or_else(|_| HeaderValue::from_static("bytes */0"));
    response
        .headers_mut()
        .insert(header::CONTENT_RANGE, header_value);

    response
}

#[utoipa::path(
    get,
    path = "/api/v1/objects/{id}",
    params(("id" = Uuid, Path, description = "Object ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Object content (binary)"),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Forbidden", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 503, description = "Object storage not configured", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_object(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let object_service = state
        .object_service
        .as_ref()
        .ok_or_else(|| AppError::service_unavailable("Object storage is not configured"))?;

    let object = object_service
        .get_object_record(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    let is_admin = state
        .user_service
        .has_permission(user.id, "*")
        .await
        .map_err(AppError::from)?;

    if !is_admin && object.owner_user_id != Some(user.id) {
        return Err(AppError::forbidden("Access denied"));
    }

    let range_header = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    state
        .audit_service
        .log(
            user.tenant_id,
            CreateAuditLog {
                user_id: Some(user.id),
                action: "objects.download".to_string(),
                resource: "objects".to_string(),
                resource_id: Some(id),
                old_value: None,
                new_value: Some(json!({
                    "kind": object.kind,
                    "content_type": object.content_type,
                    "byte_size": object.byte_size,
                    "range": range_header.as_deref(),
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    let content_type = HeaderValue::from_str(&object.content_type)
        .map_err(|_| AppError::internal("Invalid object content-type"))?;

    let mut response = if let (Some(range_header), Ok(size)) = (
        range_header.as_deref(),
        u64::try_from(object.byte_size),
    ) {
        let byte_range = match parse_single_byte_range(range_header, size) {
            Ok(value) => value,
            Err(_) => {
                return Ok(range_not_satisfiable_response(
                    size,
                    "Range is invalid or not satisfiable",
                ));
            }
        };

        let stream = object_service
            .get_object_stream_range(&object, byte_range.start, byte_range.end)
            .await
            .map_err(AppError::from)?;

        let mut response = Response::new(Body::new(stream.into_inner()));
        *response.status_mut() = StatusCode::PARTIAL_CONTENT;
        response
            .headers_mut()
            .insert(header::CONTENT_TYPE, content_type);
        response.headers_mut().insert(
            header::ACCEPT_RANGES,
            HeaderValue::from_static("bytes"),
        );

        let content_length = byte_range.end.saturating_sub(byte_range.start) + 1;
        let content_length = HeaderValue::from_str(&content_length.to_string())
            .map_err(|_| AppError::internal("Invalid object byte_size"))?;
        response
            .headers_mut()
            .insert(header::CONTENT_LENGTH, content_length);

        let content_range = HeaderValue::from_str(&format!(
            "bytes {}-{}/{}",
            byte_range.start, byte_range.end, size
        ))
        .map_err(|_| AppError::internal("Invalid content-range"))?;
        response
            .headers_mut()
            .insert(header::CONTENT_RANGE, content_range);

        response
    } else {
        let stream = object_service
            .get_object_stream(&object)
            .await
            .map_err(AppError::from)?;

        let mut response = Response::new(Body::new(stream.into_inner()));
        *response.status_mut() = StatusCode::OK;
        response
            .headers_mut()
            .insert(header::CONTENT_TYPE, content_type);
        response.headers_mut().insert(
            header::ACCEPT_RANGES,
            HeaderValue::from_static("bytes"),
        );
        if object.byte_size >= 0 {
            let content_length = HeaderValue::from_str(&object.byte_size.to_string())
                .map_err(|_| AppError::internal("Invalid object byte_size"))?;
            response
                .headers_mut()
                .insert(header::CONTENT_LENGTH, content_length);
        }
        response
    };

    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=31536000, immutable"),
    );
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static("Cookie"));

    Ok(response)
}

#[cfg(test)]
mod range_tests {
    use super::*;

    #[test]
    fn parse_range_prefix_required() {
        assert_eq!(
            parse_single_byte_range("items=0-1", 10),
            Err(RangeParseError::Invalid)
        );
    }

    #[test]
    fn parse_single_range_basic() {
        assert_eq!(
            parse_single_byte_range("bytes=0-499", 1000),
            Ok(ByteRange { start: 0, end: 499 })
        );
        assert_eq!(
            parse_single_byte_range("bytes=500-", 1000),
            Ok(ByteRange {
                start: 500,
                end: 999
            })
        );
        assert_eq!(
            parse_single_byte_range("bytes=0-999", 1000),
            Ok(ByteRange { start: 0, end: 999 })
        );
    }

    #[test]
    fn parse_single_range_clamps_end() {
        assert_eq!(
            parse_single_byte_range("bytes=0-2000", 1000),
            Ok(ByteRange { start: 0, end: 999 })
        );
        assert_eq!(
            parse_single_byte_range("bytes=999-2000", 1000),
            Ok(ByteRange {
                start: 999,
                end: 999
            })
        );
    }

    #[test]
    fn parse_single_range_suffix() {
        assert_eq!(
            parse_single_byte_range("bytes=-200", 1000),
            Ok(ByteRange {
                start: 800,
                end: 999
            })
        );
        assert_eq!(
            parse_single_byte_range("bytes=-2000", 1000),
            Ok(ByteRange { start: 0, end: 999 })
        );
    }

    #[test]
    fn parse_single_range_rejects_multiple_ranges() {
        assert_eq!(
            parse_single_byte_range("bytes=0-1,4-5", 1000),
            Err(RangeParseError::Invalid)
        );
    }

    #[test]
    fn parse_single_range_unsatisfiable() {
        assert_eq!(
            parse_single_byte_range("bytes=1000-", 1000),
            Err(RangeParseError::Unsatisfiable)
        );
        assert_eq!(
            parse_single_byte_range("bytes=0-0", 0),
            Err(RangeParseError::Unsatisfiable)
        );
    }
}
