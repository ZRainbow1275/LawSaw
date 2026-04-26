use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};
use law_eye_core::report::{CreateReportInput, ReportStatus};
use law_eye_db::{CreateReportSubscription, ReportSubscription, UpdateReportSubscription};
use law_eye_queue::ReportGenerateTask;

const REPORT_SUBSCRIPTION_NAME_MAX_LEN: usize = 100;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_report_subscriptions).post(create_report_subscription))
        .route(
            "/{id}",
            get(get_report_subscription)
                .put(update_report_subscription)
                .delete(delete_report_subscription),
        )
        .route("/{id}/trigger", post(trigger_report_subscription))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateReportSubscriptionRequest {
    pub name: String,
    pub template_id: Uuid,
    pub period_type: String,
    pub delivery_channel: String,
    pub export_format: String,
    pub filters: Option<serde_json::Value>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateReportSubscriptionRequest {
    pub name: Option<String>,
    pub template_id: Option<Uuid>,
    pub period_type: Option<String>,
    pub delivery_channel: Option<String>,
    pub export_format: Option<String>,
    pub filters: Option<serde_json::Value>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReportSubscriptionResponse {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub template_id: Uuid,
    pub period_type: String,
    pub delivery_channel: String,
    pub export_format: String,
    pub filters: serde_json::Value,
    pub is_active: bool,
    pub last_triggered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub version: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<ReportSubscription> for ReportSubscriptionResponse {
    fn from(value: ReportSubscription) -> Self {
        Self {
            id: value.id,
            tenant_id: value.tenant_id,
            user_id: value.user_id,
            name: value.name,
            template_id: value.template_id,
            period_type: value.period_type,
            delivery_channel: value.delivery_channel,
            export_format: value.export_format,
            filters: value.filters,
            is_active: value.is_active,
            last_triggered_at: value.last_triggered_at,
            version: value.version,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportSubscriptionListResponse {
    pub data: Vec<ReportSubscriptionResponse>,
    pub total: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportSubscriptionTriggerResponse {
    pub message: String,
    pub subscription_id: Uuid,
    pub report_id: Uuid,
}

fn validate_subscription_name(name: &str) -> ApiResult<()> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("subscription name cannot be empty"));
    }
    if trimmed.len() > REPORT_SUBSCRIPTION_NAME_MAX_LEN {
        return Err(AppError::validation(format!(
            "subscription name too long (max {REPORT_SUBSCRIPTION_NAME_MAX_LEN})"
        )));
    }
    Ok(())
}

fn ensure_owned(subscription: &ReportSubscription, user_id: Uuid) -> ApiResult<()> {
    if subscription.user_id != user_id {
        return Err(AppError::not_found("Report subscription not found"));
    }
    Ok(())
}

async fn ensure_web_push_ready(state: &AppState, tenant_id: Uuid, user_id: Uuid, delivery_channel: &str) -> ApiResult<()> {
    if delivery_channel != "web_push" {
        return Ok(());
    }

    let count = state
        .web_push_subscription_service
        .count_by_user(tenant_id, user_id)
        .await
        .map_err(AppError::from)?;

    if count <= 0 {
        return Err(AppError::validation_with_code(
            "WEB_PUSH_SUBSCRIPTION_REQUIRED",
            "web_push delivery requires at least one active browser push subscription",
        ));
    }

    Ok(())
}

fn period_window(period_type: &str, today: NaiveDate) -> ApiResult<(NaiveDate, NaiveDate)> {
    match period_type {
        "weekly" => Ok((today - Duration::days(6), today)),
        "monthly" => Ok((
            NaiveDate::from_ymd_opt(today.year(), today.month(), 1)
                .ok_or_else(|| AppError::internal("failed to resolve monthly period start"))?,
            today,
        )),
        "quarterly" => {
            let quarter_start_month = ((today.month() - 1) / 3) * 3 + 1;
            Ok((
                NaiveDate::from_ymd_opt(today.year(), quarter_start_month, 1)
                    .ok_or_else(|| AppError::internal("failed to resolve quarterly period start"))?,
                today,
            ))
        }
        _ => Err(AppError::validation("Invalid period_type for report subscription trigger")),
    }
}

#[utoipa::path(
    get,
    path = "/api/v1/report-subscriptions",
    security(("session" = [])),
    responses(
        (status = 200, description = "Current user's report subscriptions", body = ReportSubscriptionListResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-subscriptions"
)]
pub(crate) async fn list_report_subscriptions(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<ReportSubscriptionListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let data = state
        .report_subscription_service
        .list_by_user(user.tenant_id, user.id)
        .await
        .map_err(AppError::from)?
        .into_iter()
        .map(ReportSubscriptionResponse::from)
        .collect::<Vec<_>>();

    Ok(Json(ReportSubscriptionListResponse {
        total: data.len() as i64,
        data,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/report-subscriptions",
    request_body = CreateReportSubscriptionRequest,
    security(("session" = [])),
    responses(
        (status = 201, description = "Report subscription created", body = ReportSubscriptionResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-subscriptions"
)]
pub(crate) async fn create_report_subscription(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiJson(req): ApiJson<CreateReportSubscriptionRequest>,
) -> ApiResult<(StatusCode, Json<ReportSubscriptionResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    validate_subscription_name(&req.name)?;
    if let Some(filters) = &req.filters {
        if !filters.is_object() {
            return Err(AppError::validation("filters must be a JSON object"));
        }
    }
    ensure_web_push_ready(&state, user.tenant_id, user.id, &req.delivery_channel).await?;

    let created = state
        .report_subscription_service
        .create(
            user.tenant_id,
            CreateReportSubscription {
                user_id: user.id,
                name: req.name,
                template_id: req.template_id,
                period_type: req.period_type,
                delivery_channel: req.delivery_channel,
                export_format: req.export_format,
                filters: req.filters,
                is_active: req.is_active,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok((StatusCode::CREATED, Json(ReportSubscriptionResponse::from(created))))
}

#[utoipa::path(
    get,
    path = "/api/v1/report-subscriptions/{id}",
    params(("id" = Uuid, Path, description = "Report subscription ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report subscription details", body = ReportSubscriptionResponse),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError)
    ),
    tag = "report-subscriptions"
)]
pub(crate) async fn get_report_subscription(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ReportSubscriptionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let subscription = state
        .report_subscription_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&subscription, user.id)?;

    Ok(Json(ReportSubscriptionResponse::from(subscription)))
}

#[utoipa::path(
    put,
    path = "/api/v1/report-subscriptions/{id}",
    params(("id" = Uuid, Path, description = "Report subscription ID")),
    request_body = UpdateReportSubscriptionRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Report subscription updated", body = ReportSubscriptionResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError)
    ),
    tag = "report-subscriptions"
)]
pub(crate) async fn update_report_subscription(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateReportSubscriptionRequest>,
) -> ApiResult<Json<ReportSubscriptionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let current = state
        .report_subscription_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&current, user.id)?;

    if let Some(name) = &req.name {
        validate_subscription_name(name)?;
    }
    if let Some(filters) = &req.filters {
        if !filters.is_object() {
            return Err(AppError::validation("filters must be a JSON object"));
        }
    }

    let target_delivery = req.delivery_channel.as_deref().unwrap_or(current.delivery_channel.as_str());
    ensure_web_push_ready(&state, user.tenant_id, user.id, target_delivery).await?;

    let updated = state
        .report_subscription_service
        .update(
            user.tenant_id,
            id,
            UpdateReportSubscription {
                name: req.name,
                template_id: req.template_id,
                period_type: req.period_type,
                delivery_channel: req.delivery_channel,
                export_format: req.export_format,
                filters: req.filters,
                is_active: req.is_active,
            },
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(ReportSubscriptionResponse::from(updated)))
}

#[utoipa::path(
    delete,
    path = "/api/v1/report-subscriptions/{id}",
    params(("id" = Uuid, Path, description = "Report subscription ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report subscription deleted"),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError)
    ),
    tag = "report-subscriptions"
)]
pub(crate) async fn delete_report_subscription(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let current = state
        .report_subscription_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&current, user.id)?;

    state
        .report_subscription_service
        .soft_delete(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;

    Ok(StatusCode::OK)
}

#[utoipa::path(
    post,
    path = "/api/v1/report-subscriptions/{id}/trigger",
    params(("id" = Uuid, Path, description = "Report subscription ID")),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report subscription triggered", body = ReportSubscriptionTriggerResponse),
        (status = 400, description = "Validation error", body = ApiError),
        (status = 401, description = "Not authenticated", body = ApiError),
        (status = 403, description = "Permission denied", body = ApiError),
        (status = 404, description = "Not found", body = ApiError),
        (status = 500, description = "Server error", body = ApiError)
    ),
    tag = "report-subscriptions"
)]
pub(crate) async fn trigger_report_subscription(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ReportSubscriptionTriggerResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let subscription = state
        .report_subscription_service
        .get_by_id(user.tenant_id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&subscription, user.id)?;

    if !subscription.is_active {
        return Err(AppError::validation("inactive report subscriptions cannot be triggered"));
    }

    ensure_web_push_ready(&state, user.tenant_id, user.id, &subscription.delivery_channel).await?;

    let today = Utc::now().date_naive();
    let (period_start, period_end) = period_window(&subscription.period_type, today)?;
    let title = format!(
        "{} ({} - {})",
        subscription.name,
        period_start.format("%Y-%m-%d"),
        period_end.format("%Y-%m-%d")
    );

    let report = state
        .report_service
        .create_report(
            user.tenant_id,
            CreateReportInput {
                title,
                period_type: subscription.period_type.clone(),
                period_start,
                period_end,
                template_id: Some(subscription.template_id),
                author_id: user.id,
            },
        )
        .await
        .map_err(AppError::from)?;

    state
        .report_service
        .transition_status(user.tenant_id, report.id, ReportStatus::Generating, report.version)
        .await
        .map_err(AppError::from)?;

    let task = ReportGenerateTask {
        tenant_id: user.tenant_id,
        report_id: report.id,
        task_type: Some("subscription_trigger".to_string()),
        requested_by: Some(user.id),
        requested_at: Some(Utc::now().to_rfc3339()),
    };

    state
        .task_queue
        .enqueue_retryable_with_ordering(
            "queue:report",
            task,
            Some(format!("report:{}", report.id)),
            None,
        )
        .await
        .map_err(|err| AppError::internal(format!("failed to enqueue report generation task: {err}")))?;

    state
        .report_subscription_service
        .mark_triggered(user.tenant_id, subscription.id)
        .await
        .map_err(AppError::from)?;

    Ok(Json(ReportSubscriptionTriggerResponse {
        message: "Report subscription triggered successfully".to_string(),
        subscription_id: subscription.id,
        report_id: report.id,
    }))
}
