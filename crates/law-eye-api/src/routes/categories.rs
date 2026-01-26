use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_categories))
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
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn list_categories(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<CategoryResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "categories:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let categories = state
        .category_service
        .list()
        .await
        .map_err(AppError::from)?;
    Ok(Json(
        categories.into_iter().map(CategoryResponse::from).collect(),
    ))
}
