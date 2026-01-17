use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;
use law_eye_db::Article;

#[derive(Deserialize)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct ArticleListResponse {
    pub data: Vec<Article>,
    pub total: usize,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_articles))
        .route("/{id}", get(get_article))
        .route("/{id}/publish", post(publish_article))
}

async fn list_articles(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> Result<Json<ArticleListResponse>, StatusCode> {
    let limit = params.limit.unwrap_or(20);
    let offset = params.offset.unwrap_or(0);

    let articles = state
        .article_service
        .list(limit, offset)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ArticleListResponse {
        total: articles.len(),
        data: articles,
    }))
}

async fn get_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Article>, StatusCode> {
    state
        .article_service
        .get_by_id(id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

async fn publish_article(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Article>, StatusCode> {
    state
        .article_service
        .update_status(id, "published")
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
