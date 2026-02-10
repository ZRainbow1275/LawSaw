use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use law_eye_db::CreateAuditLog;
use law_eye_queue::{AiTask, AiTaskType};
use serde::Serialize;
use serde_json::json;
use std::net::SocketAddr;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

const DEGRADED_REASON_RULE_BASED_FALLBACK: &str = "rule-based fallback";

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
    pub degraded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degraded_reason: Option<String>,
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
    pub degraded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub degraded_reason: Option<String>,
}

fn degraded_reason_from_flag(degraded: bool) -> Option<String> {
    degraded.then(|| DEGRADED_REASON_RULE_BASED_FALLBACK.to_string())
}

fn build_process_response(article_id: Uuid, task_type: &str, degraded: bool) -> AiProcessResponse {
    let message = if degraded {
        format!("AI task enqueued in degraded mode (rule-based fallback): {task_type}")
    } else {
        format!("AI processing task enqueued: {task_type}")
    };

    AiProcessResponse {
        message,
        article_id,
        task_type: task_type.to_string(),
        degraded,
        degraded_reason: degraded_reason_from_flag(degraded),
    }
}


async fn audit_ai_enqueue(
    state: &AppState,
    tenant_id: Uuid,
    user_id: Uuid,
    action: &str,
    article_id: Uuid,
    degraded: bool,
    ip_address: Option<String>,
    user_agent: Option<String>,
) -> Result<(), AppError> {
    state
        .audit_service
        .log(
            tenant_id,
            CreateAuditLog {
                user_id: Some(user_id),
                action: action.to_string(),
                resource: "ai_tasks".to_string(),
                resource_id: Some(article_id),
                old_value: None,
                new_value: Some(json!({
                    "article_id": article_id,
                    "degraded": degraded,
                })),
                ip_address,
                user_agent,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(())
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
        .has_permission(user.tenant_id, user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let available = state.ai_service.is_some();
    let degraded = !available;

    Ok(Json(AiAvailabilityResponse {
        available,
        degraded,
        degraded_reason: degraded_reason_from_flag(degraded),
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
        (status = 500, description = "Failed to enqueue task", body = ApiError)
    )
)]
pub(crate) async fn process_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    // Verify article exists
    state
        .article_service
        .get_by_id(user.tenant_id, article_id)
        .await
        .map_err(AppError::from)?;

    let degraded = state.ai_service.is_none();

    // Enqueue AI task
    let task = AiTask {
        tenant_id: user.tenant_id,
        article_id,
        task_type: AiTaskType::Full,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    audit_ai_enqueue(
        &state,
        user.tenant_id,
        user.id,
        "ai.enqueue.full",
        article_id,
        degraded,
        ip_address,
        user_agent,
    )
    .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(build_process_response(article_id, "full", degraded)),
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
        (status = 500, description = "Failed to enqueue task", body = ApiError)
    )
)]
pub(crate) async fn classify_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .get_by_id(user.tenant_id, article_id)
        .await
        .map_err(AppError::from)?;

    let degraded = state.ai_service.is_none();

    let task = AiTask {
        tenant_id: user.tenant_id,
        article_id,
        task_type: AiTaskType::Classify,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    audit_ai_enqueue(
        &state,
        user.tenant_id,
        user.id,
        "ai.enqueue.classify",
        article_id,
        degraded,
        ip_address,
        user_agent,
    )
    .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(build_process_response(article_id, "classify", degraded)),
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
        (status = 500, description = "Failed to enqueue task", body = ApiError)
    )
)]
pub(crate) async fn summarize_article(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .get_by_id(user.tenant_id, article_id)
        .await
        .map_err(AppError::from)?;

    let degraded = state.ai_service.is_none();

    let task = AiTask {
        tenant_id: user.tenant_id,
        article_id,
        task_type: AiTaskType::Summarize,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    audit_ai_enqueue(
        &state,
        user.tenant_id,
        user.id,
        "ai.enqueue.summarize",
        article_id,
        degraded,
        ip_address,
        user_agent,
    )
    .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(build_process_response(article_id, "summarize", degraded)),
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
        (status = 500, description = "Failed to enqueue task", body = ApiError)
    )
)]
pub(crate) async fn assess_risk(
    State(state): State<AppState>,
    auth_session: AuthSession,
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(article_id): Path<Uuid>,
) -> ApiResult<(StatusCode, Json<AiProcessResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let can_write = state
        .user_service
        .has_permission(user.tenant_id, user.id, "articles:write")
        .await
        .map_err(AppError::from)?;
    if !can_write {
        return Err(AppError::forbidden("Permission denied"));
    }

    state
        .article_service
        .get_by_id(user.tenant_id, article_id)
        .await
        .map_err(AppError::from)?;

    let degraded = state.ai_service.is_none();

    let task = AiTask {
        tenant_id: user.tenant_id,
        article_id,
        task_type: AiTaskType::RiskAssess,
    };

    state
        .task_queue
        .enqueue_retryable("queue:ai", task)
        .await
        .map_err(AppError::from)?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    audit_ai_enqueue(
        &state,
        user.tenant_id,
        user.id,
        "ai.enqueue.risk_assess",
        article_id,
        degraded,
        ip_address,
        user_agent,
    )
    .await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(build_process_response(article_id, "risk_assess", degraded)),
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
        .has_permission(user.tenant_id, user.id, "articles:read")
        .await
        .map_err(AppError::from)?;
    if !can_read {
        return Err(AppError::forbidden("Permission denied"));
    }

    let article = state
        .article_service
        .get_by_id(user.tenant_id, article_id)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn degraded_reason_matches_flag() {
        assert_eq!(degraded_reason_from_flag(false), None);
        assert_eq!(
            degraded_reason_from_flag(true),
            Some("rule-based fallback".to_string())
        );
    }

    #[test]
    fn build_process_response_sets_degraded_fields() {
        let article_id = Uuid::new_v4();
        let response = build_process_response(article_id, "summarize", true);

        assert_eq!(response.article_id, article_id);
        assert_eq!(response.task_type, "summarize");
        assert!(response.degraded);
        assert_eq!(
            response.degraded_reason.as_deref(),
            Some("rule-based fallback")
        );
        assert!(response.message.contains("degraded mode"));
    }

    #[test]
    fn build_process_response_clears_degraded_fields() {
        let article_id = Uuid::new_v4();
        let response = build_process_response(article_id, "classify", false);

        assert_eq!(response.article_id, article_id);
        assert_eq!(response.task_type, "classify");
        assert!(!response.degraded);
        assert_eq!(response.degraded_reason, None);
        assert_eq!(response.message, "AI processing task enqueued: classify");
    }
}
