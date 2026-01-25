use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use law_eye_db::CreateSource;
use law_eye_queue::IngestTask;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sources).post(create_source))
        .route("/{id}", get(get_source))
        .route("/{id}/fetch", post(trigger_fetch))
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

async fn list_sources(State(state): State<AppState>, auth_session: AuthSession) -> impl IntoResponse {
    let user = match auth_session.user {
        Some(u) => u,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponse {
                    error: "Not authenticated".to_string(),
                }),
            )
                .into_response()
        }
    };

    let can_read = state
        .user_service
        .has_permission(user.id, "sources:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    match state.source_service.list().await {
        Ok(sources) => (StatusCode::OK, Json(sources)).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch sources".to_string(),
            }),
        )
            .into_response(),
    }
}

async fn get_source(
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
                .into_response()
        }
    };

    let can_read = state
        .user_service
        .has_permission(user.id, "sources:read")
        .await
        .unwrap_or(false);
    if !can_read {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    match state.source_service.get_by_id(id).await {
        Ok(source) => (StatusCode::OK, Json(source)).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Source not found".to_string(),
            }),
        )
            .into_response(),
    }
}

async fn create_source(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Json(input): Json<CreateSource>,
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
                .into_response()
        }
    };

    let is_admin = state.user_service.has_permission(user.id, "*").await.unwrap_or(false);
    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
            }),
        )
            .into_response();
    }

    match state.source_service.create(input).await {
        Ok(source) => (StatusCode::CREATED, Json(source)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: e.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn trigger_fetch(
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
                .into_response()
        }
    };

    let is_admin = state.user_service.has_permission(user.id, "*").await.unwrap_or(false);
    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Admin permission required".to_string(),
            }),
        )
            .into_response();
    }

    let source = match state.source_service.get_by_id(id).await {
        Ok(source) => source,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Source not found".to_string(),
                }),
            )
                .into_response()
        }
    };

    let task = IngestTask {
        source_id: source.id,
        source_type: source.source_type,
        url: source.url,
        config: source.config,
    };

    if let Err(e) = state.task_queue.enqueue("queue:ingest", &task).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to enqueue task: {}", e),
            }),
        )
            .into_response();
    }

    StatusCode::ACCEPTED.into_response()
}
