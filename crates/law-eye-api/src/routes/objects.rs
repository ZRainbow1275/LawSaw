use axum::{
    extract::{Path, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new().route("/{id}", get(get_object))
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

    let bytes = object_service
        .get_object_bytes(&object)
        .await
        .map_err(AppError::from)?;

    let mut response = (StatusCode::OK, bytes).into_response();
    let content_type = HeaderValue::from_str(&object.content_type)
        .map_err(|_| AppError::internal("Invalid object content-type"))?;

    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, content_type);

    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=31536000, immutable"),
    );
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static("Cookie"));

    Ok(response)
}
