use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use serde::Serialize;

use crate::auth::AuthSession;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_categories))
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

async fn list_categories(
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

    let can_read = state
        .user_service
        .has_permission(user.id, "categories:read")
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

    match state.category_service.list().await {
        Ok(categories) => (StatusCode::OK, Json(categories)).into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch categories".to_string(),
            }),
        )
            .into_response(),
    }
}
