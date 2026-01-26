use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use law_eye_queue::{AiTask, AiTaskType};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/process/{article_id}", post(process_article))
        .route("/classify/{article_id}", post(classify_article))
        .route("/summarize/{article_id}", post(summarize_article))
        .route("/risk/{article_id}", post(assess_risk))
        .route("/available", get(get_ai_availability))
        .route("/status/{article_id}", get(get_ai_status))
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiProcessResponse {
    pub message: String,
    pub article_id: Uuid,
    pub task_type: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiStatusResponse {
    pub article_id: Uuid,
    pub ai_processed: bool,
    pub category: Option<String>,
    pub risk_score: Option<i32>,
    pub summary: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AiAvailabilityResponse {
    pub available: bool,
}

/// AI 服务是否可用（仅检测 API 侧配置，不做外部 LLM 探测）
#[utoipa::path(
    get,
    path = "/api/v1/ai/available",
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "AI availability", body = AiAvailabilityResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_ai_availability(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<AiAvailabilityResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    Ok(Json(AiAvailabilityResponse {
        available: state.ai_service.is_some(),
    }))
}

/// 触发文章完整 AI 处理
#[utoipa::path(
    post,
    path = "/api/v1/ai/process/{article_id}",
    params(("article_id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 202, description = "AI processing task enqueued", body = AiProcessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Article not found", body = ApiError),
        (status = 500, description = "Failed to enqueue task", body = ApiError),
        (status = 503, description = "AI service not available", body = ApiError)
    )
)]
pub(crate) async fn process_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    // Verify article exists
    state
        .article_service
        .get_by_id(article_id)
        .await
        .map_err(AppError::from)?;

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    // Enqueue AI task
    let task = AiTask {
        article_id,
        task_type: AiTaskType::Full,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "AI processing task enqueued".to_string(),
            article_id,
            task_type: "full".to_string(),
        }),
    ))
}

/// 触发文章分类
#[utoipa::path(
    post,
    path = "/api/v1/ai/classify/{article_id}",
    params(("article_id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 202, description = "Classification task enqueued", body = AiProcessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Article not found", body = ApiError),
        (status = 500, description = "Failed to enqueue task", body = ApiError),
        (status = 503, description = "AI service not available", body = ApiError)
    )
)]
pub(crate) async fn classify_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .get_by_id(article_id)
        .await
        .map_err(AppError::from)?;

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let task = AiTask {
        article_id,
        task_type: AiTaskType::Classify,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "Classification task enqueued".to_string(),
            article_id,
            task_type: "classify".to_string(),
        }),
    ))
}

/// 触发文章摘要生成
#[utoipa::path(
    post,
    path = "/api/v1/ai/summarize/{article_id}",
    params(("article_id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 202, description = "Summarization task enqueued", body = AiProcessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Article not found", body = ApiError),
        (status = 500, description = "Failed to enqueue task", body = ApiError),
        (status = 503, description = "AI service not available", body = ApiError)
    )
)]
pub(crate) async fn summarize_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .get_by_id(article_id)
        .await
        .map_err(AppError::from)?;

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let task = AiTask {
        article_id,
        task_type: AiTaskType::Summarize,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "Summarization task enqueued".to_string(),
            article_id,
            task_type: "summarize".to_string(),
        }),
    ))
}

/// 触发风险评估
#[utoipa::path(
    post,
    path = "/api/v1/ai/risk/{article_id}",
    params(("article_id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 202, description = "Risk assessment task enqueued", body = AiProcessResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Article not found", body = ApiError),
        (status = 500, description = "Failed to enqueue task", body = ApiError),
        (status = 503, description = "AI service not available", body = ApiError)
    )
)]
pub(crate) async fn assess_risk(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .get_by_id(article_id)
        .await
        .map_err(AppError::from)?;

    if state.ai_service.is_none() {
        return Err(AppError::service_unavailable("AI service not available"));
    }

    let task = AiTask {
        article_id,
        task_type: AiTaskType::RiskAssess,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    Ok((
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "Risk assessment task enqueued".to_string(),
            article_id,
            task_type: "risk_assess".to_string(),
        }),
    ))
}

/// 获取文章 AI 处理状态
#[utoipa::path(
    get,
    path = "/api/v1/ai/status/{article_id}",
    params(("article_id" = Uuid, Path, description = "Article ID")),
    security(
        ("session" = [])
    ),
    responses(
        (status = 200, description = "AI processing status", body = AiStatusResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Article not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    )
)]
pub(crate) async fn get_ai_status(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
) -> ApiResult<Json<AiStatusResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_read = state
        .user_service
        .has_permission(user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let article = state
        .article_service
        .get_by_id(article_id)
        .await
        .map_err(AppError::from)?;

    let ai_processed = article.ai_processed_at.is_some();
    let category = match article.category_id {
        Some(category_id) => match state.category_service.get_by_id(category_id).await {
            Ok(c) => Some(c.name),
            Err(law_eye_common::Error::NotFound(_)) => None,
            Err(err) => return Err(AppError::from(err)),
        },
        None => None,
    };

    Ok(Json(AiStatusResponse {
        article_id,
        ai_processed,
        category,
        risk_score: article.risk_score,
        summary: article.summary,
    }))
}
