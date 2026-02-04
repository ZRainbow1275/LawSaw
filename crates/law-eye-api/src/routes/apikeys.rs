use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiQuery, ApiResult, AppError};

const APIKEY_NAME_MAX_LEN: usize = 100;
const APIKEY_PERMISSION_MAX_LEN: usize = 64;
const APIKEY_MAX_PERMISSIONS: usize = 32;
const APIKEY_RATE_LIMIT_MIN: i32 = 1;
const APIKEY_RATE_LIMIT_MAX: i32 = 10_000;
const APIKEY_LIST_DEFAULT_LIMIT: i64 = 100;
const APIKEY_LIST_MAX_LIMIT: i64 = 1000;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_keys))
        .route("/", post(create_key))
        .route("/{id}", delete(delete_key))
        .route("/{id}/revoke", post(revoke_key))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateKeyRequest {
    pub name: String,
    pub permissions: Option<Vec<String>>,
    pub rate_limit: Option<i32>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub permissions: serde_json::Value,
    pub rate_limit: i32,
    pub is_active: bool,
    pub last_used: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CreateKeyResponse {
    pub key: ApiKeyResponse,
    pub raw_key: String, // Only returned on creation
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ListKeysParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct KeyListResponse {
    pub keys: Vec<ApiKeyResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SuccessResponse {
    pub success: bool,
    pub message: String,
}

/// List user's API keys
#[utoipa::path(
    get,
    path = "/api/v1/apikeys",
    params(
        ("limit" = Option<i64>, Query, description = "Max results (default 100, max 1000)"),
        ("offset" = Option<i64>, Query, description = "Offset (default 0)")
    ),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "List of API keys", body = KeyListResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_keys(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<ListKeysParams>,
) -> ApiResult<Json<KeyListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let mut limit = params.limit.unwrap_or(APIKEY_LIST_DEFAULT_LIMIT);
    if limit < 1 {
        return Err(AppError::validation("limit must be >= 1"));
    }
    limit = limit.min(APIKEY_LIST_MAX_LIMIT);

    let offset = params.offset.unwrap_or(0);
    if offset < 0 {
        return Err(AppError::validation("offset must be >= 0"));
    }

    let keys = state
        .apikey_service
        .list_by_user(user.id, limit, offset)
        .await
        .map_err(|e| AppError::internal_with_code("FETCH_ERROR", e.to_string()))?;

    let total = state
        .apikey_service
        .count_by_user(user.id)
        .await
        .map_err(|e| AppError::internal_with_code("COUNT_ERROR", e.to_string()))?;

    Ok(Json(KeyListResponse {
        keys: keys
            .into_iter()
            .map(|k| ApiKeyResponse {
                id: k.id,
                name: k.name,
                key_prefix: k.key_prefix,
                permissions: k.permissions,
                rate_limit: k.rate_limit,
                is_active: k.is_active,
                last_used: k.last_used,
                created_at: k.created_at,
            })
            .collect(),
        total,
        limit,
        offset,
    }))
}

/// Create a new API key
#[utoipa::path(
    post,
    path = "/api/v1/apikeys",
    request_body = CreateKeyRequest,
    security(
        ("session" = [])
    ),
    responses(
        (status = 201, description = "API key created", body = CreateKeyResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn create_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(mut req): ApiJson<CreateKeyRequest>,
) -> ApiResult<(StatusCode, Json<CreateKeyResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let name = req.name.trim();
    if name.is_empty() {
        return Err(AppError::validation("API key name cannot be empty"));
    }
    if name.len() > APIKEY_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "API key name too long (max {APIKEY_NAME_MAX_LEN})"
        )));
    }
    req.name = name.to_string();

    if let Some(perms) = req.permissions.take() {
        use std::collections::BTreeSet;
        let mut unique = BTreeSet::<String>::new();
        for raw in perms {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err(AppError::validation("API key permission cannot be empty"));
            }
            if trimmed.len() > APIKEY_PERMISSION_MAX_LEN {
                return Err(AppError::validation(format!(
                    "API key permission too long (max {APIKEY_PERMISSION_MAX_LEN})"
                )));
            }
            unique.insert(trimmed.to_string());
            if unique.len() > APIKEY_MAX_PERMISSIONS {
                return Err(AppError::validation(format!(
                    "Too many permissions (max {APIKEY_MAX_PERMISSIONS})"
                )));
            }
        }
        req.permissions = Some(unique.into_iter().collect());
    }

    if let Some(limit) = req.rate_limit {
        if !(APIKEY_RATE_LIMIT_MIN..=APIKEY_RATE_LIMIT_MAX).contains(&limit) {
            return Err(AppError::validation(format!(
                "rate_limit must be between {APIKEY_RATE_LIMIT_MIN} and {APIKEY_RATE_LIMIT_MAX}"
            )));
        }
    }

    let input = law_eye_db::CreateApiKey {
        user_id: Some(user.id),
        name: req.name,
        permissions: req.permissions,
        rate_limit: req.rate_limit,
        expires_at: None,
    };

    let (key, raw_key) = state
        .apikey_service
        .create(input)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(CreateKeyResponse {
            key: ApiKeyResponse {
                id: key.id,
                name: key.name,
                key_prefix: key.key_prefix,
                permissions: key.permissions,
                rate_limit: key.rate_limit,
                is_active: key.is_active,
                last_used: key.last_used,
                created_at: key.created_at,
            },
            raw_key,
        }),
    ))
}

/// Revoke an API key
#[utoipa::path(
    post,
    path = "/api/v1/apikeys/{id}/revoke",
    params(("id" = Uuid, Path, description = "API key ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Key revoked", body = SuccessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 404, description = "Key not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn revoke_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SuccessResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    state
        .apikey_service
        .revoke(id, user.id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: "API key revoked".to_string(),
    }))
}

/// Delete an API key
#[utoipa::path(
    delete,
    path = "/api/v1/apikeys/{id}",
    params(("id" = Uuid, Path, description = "API key ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Key deleted", body = SuccessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 404, description = "Key not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn delete_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SuccessResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    state
        .apikey_service
        .delete(id, user.id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(SuccessResponse {
        success: true,
        message: "API key deleted".to_string(),
    }))
}
