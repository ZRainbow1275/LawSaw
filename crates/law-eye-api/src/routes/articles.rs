use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ArticleResponse {
    pub id: Uuid,
    pub source_id: Uuid,
    pub category_id: Option<Uuid>,
    pub title: String,
    pub link: String,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<DateTime<Utc>>,
    pub risk_score: Option<i32>,
    pub importance: Option<i32>,
    pub sentiment: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<law_eye_db::Article> for ArticleResponse {
    fn from(a: law_eye_db::Article) -> Self {
        Self {
            id: a.id,
            source_id: a.source_id,
            category_id: a.category_id,
            title: a.title,
            link: a.link,
            content: a.content,
            summary: a.summary,
            author: a.author,
            published_at: a.published_at,
            risk_score: a.risk_score,
            importance: a.importance,
            sentiment: a.sentiment,
            status: a.status,
            created_at: a.created_at,
            updated_at: a.updated_at,
        }
    }
}

#[derive(Deserialize, ToSchema)]
pub struct ListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize, ToSchema)]
pub struct ArticleListResponse {
    pub data: Vec<ArticleResponse>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Serialize, ToSchema)]
pub struct ArticleStatsResponse {
    pub total_articles: i64,
    pub pending_count: i64,
    pub published_count: i64,
    pub high_risk_count: i64,
    pub today_count: i64,
}

#[derive(Deserialize, ToSchema)]
pub struct UpdateArticleRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub category_id: Option<Uuid>,
}

#[derive(Deserialize, ToSchema)]
pub struct BatchStatusRequest {
    pub ids: Vec<Uuid>,
    pub status: String,
}

#[derive(Serialize, ToSchema)]
pub struct BatchStatusResponse {
    pub updated: i64,
}

#[derive(Serialize, ToSchema)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

#[derive(Serialize, ToSchema)]
pub struct DeleteResponse {
    pub success: bool,
    pub message: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_articles))
        .route("/stats", get(get_stats))
        .route("/recent", get(list_recent))
        .route("/batch-status", post(batch_update_status))
        .route("/{id}", get(get_article))
        .route("/{id}/publish", post(publish_article))
        .route("/{id}/archive", post(archive_article))
}

async fn list_articles(
    State(state): State<AppState>,
    Query(params): Query<ListParams>,
) -> Result<Json<ArticleListResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = params.offset.unwrap_or(0);

    let articles = state
        .article_service
        .list(limit, offset)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "FETCH_ERROR".to_string() })))?;

    let total = state.article_service.count().await.unwrap_or(0);
    let data: Vec<ArticleResponse> = articles.into_iter().map(|a| a.into()).collect();

    Ok(Json(ArticleListResponse { data, total, limit, offset }))
}

async fn get_stats(State(state): State<AppState>) -> Result<Json<ArticleStatsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let stats = state.article_service.get_stats().await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "STATS_ERROR".to_string() })))?;
    Ok(Json(ArticleStatsResponse {
        total_articles: stats.total,
        pending_count: stats.pending,
        published_count: stats.published,
        high_risk_count: 0, // TODO: Add high_risk to ArticleStats
        today_count: stats.today,
    }))
}

async fn list_recent(State(state): State<AppState>, Query(params): Query<ListParams>) -> Result<Json<Vec<ArticleResponse>>, (StatusCode, Json<ErrorResponse>)> {
    let limit = params.limit.unwrap_or(10).min(50);
    let articles = state.article_service.list_recent(limit).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "FETCH_ERROR".to_string() })))?;
    let data: Vec<ArticleResponse> = articles.into_iter().map(|a| a.into()).collect();
    Ok(Json(data))
}

async fn get_article(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<Json<ArticleResponse>, (StatusCode, Json<ErrorResponse>)> {
    let article = state.article_service.get_by_id(id).await
        .map_err(|e| (StatusCode::NOT_FOUND, Json(ErrorResponse { error: e.to_string(), code: "NOT_FOUND".to_string() })))?;
    Ok(Json(article.into()))
}

async fn publish_article(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<Json<ArticleResponse>, (StatusCode, Json<ErrorResponse>)> {
    let article = state.article_service.update_status(id, "published").await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "PUBLISH_ERROR".to_string() })))?;
    Ok(Json(article.into()))
}

async fn archive_article(State(state): State<AppState>, Path(id): Path<Uuid>) -> Result<Json<ArticleResponse>, (StatusCode, Json<ErrorResponse>)> {
    let article = state.article_service.update_status(id, "archived").await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "ARCHIVE_ERROR".to_string() })))?;
    Ok(Json(article.into()))
}

async fn batch_update_status(State(state): State<AppState>, Json(req): Json<BatchStatusRequest>) -> Result<Json<BatchStatusResponse>, (StatusCode, Json<ErrorResponse>)> {
    let updated = state.article_service.batch_update_status(&req.ids, &req.status).await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse { error: e.to_string(), code: "BATCH_ERROR".to_string() })))?;
    Ok(Json(BatchStatusResponse { updated }))
}
