use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use law_eye_queue::{AiTask, AiTaskType};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/process/{article_id}", post(process_article))
        .route("/classify/{article_id}", post(classify_article))
        .route("/summarize/{article_id}", post(summarize_article))
        .route("/risk/{article_id}", post(assess_risk))
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
pub struct ErrorResponse {
    pub error: String,
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Article not found", body = ErrorResponse),
        (status = 500, description = "Failed to enqueue task", body = ErrorResponse),
        (status = 503, description = "AI service not available", body = ErrorResponse)
    )
)]
pub(crate) async fn process_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
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

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .unwrap_or(false);
    if !can_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    // Verify article exists
    if state.article_service.get_by_id(article_id).await.is_err() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Article not found".to_string(),
            }),
        )
            .into_response();
    }

    if state.ai_service.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "AI service not available".to_string(),
            }),
        )
            .into_response();
    }

    // Enqueue AI task
    let task = AiTask {
        article_id,
        task_type: AiTaskType::Full,
    };

    if let Err(e) = state.task_queue.enqueue_retryable("queue:ai", task).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to enqueue task: {}", e),
            }),
        )
            .into_response();
    }

    (
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "AI processing task enqueued".to_string(),
            article_id,
            task_type: "full".to_string(),
        }),
    )
        .into_response()
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Article not found", body = ErrorResponse),
        (status = 500, description = "Failed to enqueue task", body = ErrorResponse),
        (status = 503, description = "AI service not available", body = ErrorResponse)
    )
)]
pub(crate) async fn classify_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
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

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .unwrap_or(false);
    if !can_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    if state.article_service.get_by_id(article_id).await.is_err() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Article not found".to_string(),
            }),
        )
            .into_response();
    }

    if state.ai_service.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "AI service not available".to_string(),
            }),
        )
            .into_response();
    }

    let task = AiTask {
        article_id,
        task_type: AiTaskType::Classify,
    };

    if let Err(e) = state.task_queue.enqueue_retryable("queue:ai", task).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to enqueue task: {}", e),
            }),
        )
            .into_response();
    }

    (
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "Classification task enqueued".to_string(),
            article_id,
            task_type: "classify".to_string(),
        }),
    )
        .into_response()
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Article not found", body = ErrorResponse),
        (status = 500, description = "Failed to enqueue task", body = ErrorResponse),
        (status = 503, description = "AI service not available", body = ErrorResponse)
    )
)]
pub(crate) async fn summarize_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
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

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .unwrap_or(false);
    if !can_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    if state.article_service.get_by_id(article_id).await.is_err() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Article not found".to_string(),
            }),
        )
            .into_response();
    }

    if state.ai_service.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "AI service not available".to_string(),
            }),
        )
            .into_response();
    }

    let task = AiTask {
        article_id,
        task_type: AiTaskType::Summarize,
    };

    if let Err(e) = state.task_queue.enqueue_retryable("queue:ai", task).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to enqueue task: {}", e),
            }),
        )
            .into_response();
    }

    (
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "Summarization task enqueued".to_string(),
            article_id,
            task_type: "summarize".to_string(),
        }),
    )
        .into_response()
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Article not found", body = ErrorResponse),
        (status = 500, description = "Failed to enqueue task", body = ErrorResponse),
        (status = 503, description = "AI service not available", body = ErrorResponse)
    )
)]
pub(crate) async fn assess_risk(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
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

    let can_write = state
        .user_service
        .has_permission(user.id, "articles:write")
        .await
        .unwrap_or(false);
    if !can_write {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Permission denied".to_string(),
            }),
        )
            .into_response();
    }

    if state.article_service.get_by_id(article_id).await.is_err() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Article not found".to_string(),
            }),
        )
            .into_response();
    }

    if state.ai_service.is_none() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "AI service not available".to_string(),
            }),
        )
            .into_response();
    }

    let task = AiTask {
        article_id,
        task_type: AiTaskType::RiskAssess,
    };

    if let Err(e) = state.task_queue.enqueue_retryable("queue:ai", task).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Failed to enqueue task: {}", e),
            }),
        )
            .into_response();
    }

    (
        StatusCode::ACCEPTED,
        Json(AiProcessResponse {
            message: "Risk assessment task enqueued".to_string(),
            article_id,
            task_type: "risk_assess".to_string(),
        }),
    )
        .into_response()
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
        (status = 401, description = "Not authenticated", body = ErrorResponse),
        (status = 403, description = "Permission denied", body = ErrorResponse),
        (status = 404, description = "Article not found", body = ErrorResponse),
        (status = 500, description = "Server error", body = ErrorResponse)
    )
)]
pub(crate) async fn get_ai_status(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(article_id): Path<Uuid>,
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
        .has_permission(user.id, "articles:read")
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

    match state.article_service.get_by_id(article_id).await {
        Ok(article) => {
            let ai_processed = article.ai_processed_at.is_some();
            let category = match article.category_id {
                Some(category_id) => state
                    .category_service
                    .get_by_id(category_id)
                    .await
                    .ok()
                    .map(|c| c.name),
                None => None,
            };
            (
                StatusCode::OK,
                Json(AiStatusResponse {
                    article_id,
                    ai_processed,
                    category,
                    risk_score: article.risk_score,
                    summary: article.summary,
                }),
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Article not found".to_string(),
            }),
        )
            .into_response(),
    }
}
