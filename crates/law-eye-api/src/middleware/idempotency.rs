use axum::body::{to_bytes, Body};
use axum::extract::State;
use axum::http::{header, HeaderName, HeaderValue, Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};
use sqlx::Postgres;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::AppError;

const IDEMPOTENCY_KEY_HEADER: &str = "idempotency-key";
const IDEMPOTENCY_REPLAYED_HEADER: &str = "idempotency-replayed";
const IDEMPOTENCY_KEY_MAX_LEN: usize = 128;
const IDEMPOTENCY_MAX_BODY_BYTES: usize = 1024 * 1024;

#[derive(Debug, sqlx::FromRow)]
struct IdempotencyRow {
    method: String,
    path: String,
    request_hash: Vec<u8>,
    response_status: Option<i32>,
    response_content_type: Option<String>,
    response_body: Option<Vec<u8>>,
    expired: bool,
}

fn idempotency_ttl_secs() -> i64 {
    const DEFAULT: i64 = 24 * 60 * 60;
    const MIN: i64 = 60;
    const MAX: i64 = 7 * 24 * 60 * 60;

    std::env::var("LAW_EYE__IDEMPOTENCY__TTL_SECS")
        .ok()
        .and_then(|raw| raw.trim().parse::<i64>().ok())
        .filter(|v| *v >= MIN)
        .unwrap_or(DEFAULT)
        .min(MAX)
}

fn is_write_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

fn request_scope(req: &Request<Body>) -> (Uuid, String) {
    let auth = req.extensions().get::<AuthSession>();
    let Some(user) = auth.and_then(|s| s.user.as_ref()) else {
        return (Uuid::nil(), "anon".to_string());
    };

    (user.tenant_id, format!("user:{}", user.id))
}

fn sha256_bytes(data: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

fn idempotency_key(req: &Request<Body>) -> Result<Option<String>, AppError> {
    let Some(header_value) = req.headers().get(IDEMPOTENCY_KEY_HEADER) else {
        return Ok(None);
    };

    let raw = header_value.to_str().map_err(|_| {
        AppError::bad_request_with_code("INVALID_IDEMPOTENCY_KEY", "Invalid Idempotency-Key header")
    })?;

    let key = raw.trim();
    if key.is_empty() {
        return Err(AppError::bad_request_with_code(
            "INVALID_IDEMPOTENCY_KEY",
            "Idempotency-Key cannot be empty",
        ));
    }
    if key.len() > IDEMPOTENCY_KEY_MAX_LEN {
        return Err(AppError::bad_request_with_code(
            "INVALID_IDEMPOTENCY_KEY",
            format!("Idempotency-Key too long (max {IDEMPOTENCY_KEY_MAX_LEN})"),
        ));
    }

    Ok(Some(key.to_string()))
}

fn should_persist_response(status: StatusCode) -> bool {
    if status.is_server_error() {
        return false;
    }

    !matches!(
        status,
        StatusCode::TOO_MANY_REQUESTS
            | StatusCode::REQUEST_TIMEOUT
            | StatusCode::SERVICE_UNAVAILABLE
    )
}

fn response_from_row(key: &str, row: IdempotencyRow) -> Response {
    let status = row
        .response_status
        .and_then(|s| u16::try_from(s).ok())
        .and_then(|s| StatusCode::from_u16(s).ok())
        .unwrap_or(StatusCode::OK);

    let body = row.response_body.unwrap_or_default();
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;

    if let Some(content_type) = row.response_content_type {
        if let Ok(value) = HeaderValue::from_str(&content_type) {
            response.headers_mut().insert(header::CONTENT_TYPE, value);
        }
    }

    response.headers_mut().insert(
        HeaderName::from_static(IDEMPOTENCY_REPLAYED_HEADER),
        HeaderValue::from_static("true"),
    );
    if let Ok(value) = HeaderValue::from_str(key) {
        response
            .headers_mut()
            .insert(HeaderName::from_static(IDEMPOTENCY_KEY_HEADER), value);
    }

    response
}

pub async fn idempotency_middleware(
    State(state): State<AppState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    if !is_write_method(req.method()) {
        return next.run(req).await;
    }

    let key = match idempotency_key(&req) {
        Ok(Some(v)) => v,
        Ok(None) => return next.run(req).await,
        Err(err) => return err.into_response(),
    };

    let content_length_too_large = req
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok())
        .is_some_and(|len| len > IDEMPOTENCY_MAX_BODY_BYTES);
    if content_length_too_large {
        return next.run(req).await;
    }

    let method = req.method().to_string();
    let path = req
        .uri()
        .path_and_query()
        .map(|v| v.as_str())
        .unwrap_or_else(|| req.uri().path())
        .to_string();

    let (tenant_id, scope) = request_scope(&req);
    let lock_id = Uuid::new_v4();

    let (parts, body) = req.into_parts();
    let body_bytes = match to_bytes(body, IDEMPOTENCY_MAX_BODY_BYTES).await {
        Ok(bytes) => bytes,
        Err(_) => return AppError::payload_too_large("Request body too large").into_response(),
    };
    let request_hash = sha256_bytes(&body_bytes);
    let req = Request::from_parts(parts, Body::from(body_bytes));

    let ttl_secs = idempotency_ttl_secs();

    let existing = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let scope = scope.clone();
        let key = key.clone();
        let method = method.clone();
        let path = path.clone();
        let request_hash = request_hash.clone();

        Box::pin(async move {
            // Try to reserve the key.
            let inserted: Option<Uuid> = sqlx::query_scalar(
                r#"
                INSERT INTO idempotency_keys (scope, idem_key, method, path, request_hash, locked_at, locked_by, expires_at)
                VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW() + ($7 * INTERVAL '1 second'))
                ON CONFLICT (tenant_id, scope, idem_key) DO NOTHING
                RETURNING id
                "#,
            )
            .bind(&scope)
            .bind(&key)
            .bind(&method)
            .bind(&path)
            .bind(&request_hash)
            .bind(lock_id)
            .bind(ttl_secs)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;

            if inserted.is_some() {
                return Ok(None);
            }

            let row = sqlx::query_as::<Postgres, IdempotencyRow>(
                r#"
                SELECT
                    method,
                    path,
                    request_hash,
                    response_status,
                    response_content_type,
                    response_body,
                    expires_at <= NOW() AS expired
                FROM idempotency_keys
                WHERE scope = $1 AND idem_key = $2
                LIMIT 1
                "#,
            )
            .bind(&scope)
            .bind(&key)
            .fetch_optional(tx.as_mut())
            .await
            .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;

            let Some(row) = row else {
                return Ok(None);
            };

            if row.expired {
                let refreshed = sqlx::query(
                    r#"
                    UPDATE idempotency_keys
                    SET method = $3,
                        path = $4,
                        request_hash = $5,
                        response_status = NULL,
                        response_content_type = NULL,
                        response_body = NULL,
                        locked_at = NOW(),
                        locked_by = $6,
                        expires_at = NOW() + ($7 * INTERVAL '1 second'),
                        updated_at = NOW()
                    WHERE scope = $1
                      AND idem_key = $2
                      AND expires_at <= NOW()
                    "#,
                )
                .bind(&scope)
                .bind(&key)
                .bind(&method)
                .bind(&path)
                .bind(&request_hash)
                .bind(lock_id)
                .bind(ttl_secs)
                .execute(tx.as_mut())
                .await
                .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;

                if refreshed.rows_affected() > 0 {
                    return Ok(None);
                }

                // Another request refreshed it between our SELECT and UPDATE; re-read it.
                let row = sqlx::query_as::<Postgres, IdempotencyRow>(
                    r#"
                    SELECT
                        method,
                        path,
                        request_hash,
                        response_status,
                        response_content_type,
                        response_body,
                        expires_at <= NOW() AS expired
                    FROM idempotency_keys
                    WHERE scope = $1 AND idem_key = $2
                    LIMIT 1
                    "#,
                )
                .bind(&scope)
                .bind(&key)
                .fetch_optional(tx.as_mut())
                .await
                .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
                return Ok(row);
            }

            Ok(Some(row))
        })
    })
    .await;

    let existing = match existing {
        Ok(v) => v,
        Err(err) => return AppError::from(err).into_response(),
    };

    if let Some(row) = existing {
        if row.method != method || row.path != path {
            return AppError::conflict("Idempotency-Key already used for a different endpoint")
                .into_response();
        } else if row.request_hash != request_hash {
            return AppError::conflict(
                "Idempotency-Key already used with a different request body",
            )
            .into_response();
        } else if row.response_status.is_some() {
            return response_from_row(&key, row);
        } else {
            return AppError::conflict("Idempotency-Key is currently in progress").into_response();
        }
    }

    let response = next.run(req).await;
    let (parts, body) = response.into_parts();
    let status = parts.status;
    let headers = parts.headers;

    let body_bytes = match to_bytes(body, IDEMPOTENCY_MAX_BODY_BYTES).await {
        Ok(bytes) => bytes,
        Err(_) => {
            // Do not persist oversized responses.
            let _ = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
                let scope = scope.clone();
                let key = key.clone();
                Box::pin(async move {
                    sqlx::query("DELETE FROM idempotency_keys WHERE scope = $1 AND idem_key = $2 AND locked_by = $3")
                        .bind(&scope)
                        .bind(&key)
                        .bind(lock_id)
                        .execute(tx.as_mut())
                        .await
                        .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
                    Ok(())
                })
            })
            .await;

            let mut resp = Response::new(Body::empty());
            *resp.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
            return resp;
        }
    };

    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    if should_persist_response(status) {
        let _ = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
            let scope = scope.clone();
            let key = key.clone();
            let content_type = content_type.clone();
            let body = body_bytes.to_vec();
            Box::pin(async move {
                sqlx::query(
                    r#"
                    UPDATE idempotency_keys
                    SET response_status = $1,
                        response_content_type = $2,
                        response_body = $3,
                        locked_at = NULL,
                        locked_by = NULL,
                        updated_at = NOW()
                    WHERE scope = $4 AND idem_key = $5 AND locked_by = $6
                    "#,
                )
                .bind(status.as_u16() as i32)
                .bind(content_type)
                .bind(body)
                .bind(&scope)
                .bind(&key)
                .bind(lock_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await;
    } else {
        let _ = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
            let scope = scope.clone();
            let key = key.clone();
            Box::pin(async move {
                sqlx::query(
                    "DELETE FROM idempotency_keys WHERE scope = $1 AND idem_key = $2 AND locked_by = $3",
                )
                .bind(&scope)
                .bind(&key)
                .bind(lock_id)
                .execute(tx.as_mut())
                .await
                .map_err(|e| law_eye_common::Error::Database(e.to_string()))?;
                Ok(())
            })
        })
        .await;
    }

    let mut response = Response::new(Body::from(body_bytes));
    *response.status_mut() = status;
    *response.headers_mut() = headers;

    if let Ok(value) = HeaderValue::from_str(&key) {
        response
            .headers_mut()
            .insert(HeaderName::from_static(IDEMPOTENCY_KEY_HEADER), value);
    }

    response.headers_mut().insert(
        HeaderName::from_static(IDEMPOTENCY_REPLAYED_HEADER),
        HeaderValue::from_static("false"),
    );

    response
}
