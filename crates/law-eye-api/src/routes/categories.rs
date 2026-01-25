use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_categories))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct CategoryResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    pub sort_order: i32,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<law_eye_db::Category> for CategoryResponse {
    fn from(category: law_eye_db::Category) -> Self {
        Self {
            id: category.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            parent_id: category.parent_id,
            sort_order: category.sort_order,
            icon: category.icon,
            color: category.color,
            created_at: category.created_at,
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/categories",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "Categories", body = Vec<CategoryResponse>),
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn list_categories(
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
        Ok(categories) => {
            let categories: Vec<CategoryResponse> =
                categories.into_iter().map(CategoryResponse::from).collect();
            (StatusCode::OK, Json(categories)).into_response()
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch categories".to_string(),
            }),
        )
            .into_response(),
    }
}
