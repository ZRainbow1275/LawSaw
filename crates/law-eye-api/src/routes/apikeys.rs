use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_keys))
        .route("/", post(create_key))
        .route("/{id}", delete(delete_key))
        .route("/{id}/revoke", post(revoke_key))
}

#[derive(Debug, Deserialize, ToSchema)]
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

#[derive(Debug, Serialize, ToSchema)]
pub struct KeyListResponse {
    pub keys: Vec<ApiKeyResponse>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
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
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "List of API keys", body = KeyListResponse),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_keys(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response();
        }
    };

    match state.apikey_service.list_by_user(user.id).await {
        Ok(keys) => {
            let response = KeyListResponse {
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
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn create_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(req): Json<CreateKeyRequest>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response();
        }
    };

    let input = law_eye_db::CreateApiKey {
        user_id: Some(user.id),
        name: req.name,
        permissions: req.permissions,
        rate_limit: req.rate_limit,
        expires_at: None,
    };

    match state.apikey_service.create(input).await {
        Ok((key, raw_key)) => {
            let response = CreateKeyResponse {
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
            };
            (StatusCode::CREATED, Json(response)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 404, description = "Key not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn revoke_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response();
        }
    };

    match state.apikey_service.revoke(id, user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(SuccessResponse {
                success: true,
                message: "API key revoked".to_string(),
            }),
        )
            .into_response(),
        Err(e) => {
            let status = if e.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (
                status,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    }
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 404, description = "Key not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn delete_key(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response();
        }
    };

    match state.apikey_service.delete(id, user.id).await {
        Ok(()) => (
            StatusCode::OK,
            Json(SuccessResponse {
                success: true,
                message: "API key deleted".to_string(),
            }),
        )
            .into_response(),
        Err(e) => {
            let status = if e.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (
                status,
                Json(ErrorResponse {
                    error: e.to_string(),
                }),
            )
                .into_response()
        }
    }
}
