use axum::{
    extract::{Path, Query, State},
    middleware,
    routing::{get, patch, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::middleware::{RequirePermission, RequiredPermission};
use crate::routes::articles::ArticleResponse;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};
use law_eye_core::UpdateArticlePinInput;
use law_eye_db::CreateArticlePin;

pub fn public_router() -> Router<AppState> {
    Router::new().route("/", get(list_article_pins))
}

pub fn admin_router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_admin_article_pins))
        .route("/", post(create_article_pin))
        .route(
            "/{id}",
            patch(update_article_pin).delete(delete_article_pin),
        )
        .layer(middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission("pins:manage")))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ArticlePinResponse {
    pub id: Uuid,
    pub article_id: Uuid,
    pub priority: i32,
    pub starts_at: Option<chrono::DateTime<chrono::Utc>>,
    pub ends_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub article: ArticleResponse,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateArticlePinRequest {
    pub article_id: Uuid,
    pub priority: Option<i32>,
    pub starts_at: Option<chrono::DateTime<chrono::Utc>>,
    pub ends_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateArticlePinRequest {
    pub priority: Option<i32>,
    pub starts_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub ends_at: Option<Option<chrono::DateTime<chrono::Utc>>>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListPinsQuery {
    pub limit: Option<i64>,
}

fn to_pin_response(item: law_eye_core::PinnedArticle) -> ArticlePinResponse {
    ArticlePinResponse {
        id: item.pin.id,
        article_id: item.pin.article_id,
        priority: item.pin.priority,
        starts_at: item.pin.starts_at,
        ends_at: item.pin.ends_at,
        created_at: item.pin.created_at,
        article: item.article.into(),
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/articles/pins",
    params(ListPinsQuery),
    security(("session" = [])),
    responses((status = 200, description = "Pinned articles", body = [ArticlePinResponse])),
    tag = "articles"
)]
pub(crate) async fn list_article_pins(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListPinsQuery>,
) -> ApiResult<Json<Vec<ArticlePinResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .article_pin_service
        .list_active(user.tenant_id, query.limit.unwrap_or(10))
        .await
        .map_err(AppError::from)?;
    Ok(Json(items.into_iter().map(to_pin_response).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/article-pins",
    security(("session" = [])),
    responses((status = 200, description = "Pinned articles admin list", body = [ArticlePinResponse])),
    tag = "articles"
)]
pub(crate) async fn list_admin_article_pins(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<Vec<ArticlePinResponse>>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let items = state
        .article_pin_service
        .list_admin(user.tenant_id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(items.into_iter().map(to_pin_response).collect()))
}

#[utoipa::path(
    post,
    path = "/api/v1/admin/article-pins",
    request_body = CreateArticlePinRequest,
    security(("session" = [])),
    responses((status = 200, description = "Article pinned", body = ArticlePinResponse)),
    tag = "articles"
)]
pub(crate) async fn create_article_pin(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<CreateArticlePinRequest>,
) -> ApiResult<Json<ArticlePinResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let pin = state
        .article_pin_service
        .create(
            user.tenant_id,
            CreateArticlePin {
                article_id: req.article_id,
                priority: req.priority,
                starts_at: req.starts_at,
                ends_at: req.ends_at,
                pinned_by: Some(user.id),
                metadata: req.metadata,
            },
        )
        .await
        .map_err(AppError::from)?;
    let items = state
        .article_pin_service
        .list_admin(user.tenant_id)
        .await
        .map_err(AppError::from)?;
    let response = items
        .into_iter()
        .find(|item| item.pin.id == pin.id)
        .ok_or_else(|| AppError::not_found("Pinned article not found after create"))?;
    Ok(Json(to_pin_response(response)))
}

#[utoipa::path(
    patch,
    path = "/api/v1/admin/article-pins/{id}",
    params(("id" = Uuid, Path, description = "Pin ID")),
    request_body = UpdateArticlePinRequest,
    security(("session" = [])),
    responses((status = 200, description = "Article pin updated", body = ArticlePinResponse)),
    tag = "articles"
)]
pub(crate) async fn update_article_pin(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateArticlePinRequest>,
) -> ApiResult<Json<ArticlePinResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let pin = state
        .article_pin_service
        .update(
            user.tenant_id,
            id,
            UpdateArticlePinInput {
                priority: req.priority,
                starts_at: req.starts_at,
                ends_at: req.ends_at,
                metadata: req.metadata,
            },
        )
        .await
        .map_err(AppError::from)?;
    let items = state
        .article_pin_service
        .list_admin(user.tenant_id)
        .await
        .map_err(AppError::from)?;
    let response = items
        .into_iter()
        .find(|item| item.pin.id == pin.id)
        .ok_or_else(|| AppError::not_found("Pinned article not found after update"))?;
    Ok(Json(to_pin_response(response)))
}

#[utoipa::path(
    delete,
    path = "/api/v1/admin/article-pins/{id}",
    params(("id" = Uuid, Path, description = "Pin ID")),
    security(("session" = [])),
    responses((status = 200, description = "Article pin deleted", body = ApiError)),
    tag = "articles"
)]
pub(crate) async fn delete_article_pin(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;
    let pin = state
        .article_pin_service
        .delete(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    Ok(Json(serde_json::json!({"success": true, "id": pin.id})))
}
