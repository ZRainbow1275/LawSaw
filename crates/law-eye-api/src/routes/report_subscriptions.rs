use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::{AuthSession, AuthenticatedUser};
use crate::state::AppState;
use crate::{ApiError, ApiJson, ApiResult, AppError};
use law_eye_common::Error;
use law_eye_core::report::{CreateReportInput, ReportStatus};
use law_eye_core::AuthzCheckInput;
use law_eye_db::{
    CreateAuditLog, CreateAuthRelation, CreateReportSubscription, ReportSubscription,
    UpdateReportSubscription,
};
use law_eye_queue::ReportGenerateTask;

const REPORT_SUBSCRIPTION_NAME_MAX_LEN: usize = 100;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(list_report_subscriptions).post(create_report_subscription),
        )
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

async fn ensure_can_subscribe(state: &AppState, user: &AuthenticatedUser) -> ApiResult<()> {
    let allowed = state
        .user_service
        .has_permission(user.tenant_id, user.id, "reports:subscribe")
        .await
        .map_err(AppError::from)?;
    if !allowed {
        return Err(AppError::forbidden("Permission denied"));
    }
    Ok(())
}

async fn ensure_subscription_authz(
    state: &AppState,
    user: &AuthenticatedUser,
    subscription_id: Uuid,
) -> ApiResult<()> {
    let decision = state
        .authz_service
        .check(
            user.tenant_id,
            user.id,
            AuthzCheckInput {
                resource_type: "report_subscription".to_string(),
                resource_id: subscription_id,
                permission: "reports:subscribe".to_string(),
            },
        )
        .await
        .map_err(AppError::from)?;

    if !decision.allow {
        return Err(AppError::forbidden("Permission denied"));
    }

    Ok(())
}

fn subscription_audit_value(subscription: &ReportSubscription) -> serde_json::Value {
    serde_json::json!({
        "id": subscription.id,
        "name": subscription.name,
        "template_id": subscription.template_id,
        "period_type": subscription.period_type,
        "delivery_channel": subscription.delivery_channel,
        "export_format": subscription.export_format,
        "filters": subscription.filters,
        "is_active": subscription.is_active,
        "last_triggered_at": subscription.last_triggered_at,
        "version": subscription.version,
    })
}

async fn ensure_web_push_ready(
    state: &AppState,
    tenant_id: Uuid,
    user_id: Uuid,
    delivery_channel: &str,
) -> ApiResult<()> {
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
                NaiveDate::from_ymd_opt(today.year(), quarter_start_month, 1).ok_or_else(|| {
                    AppError::internal("failed to resolve quarterly period start")
                })?,
                today,
            ))
        }
        _ => Err(AppError::validation(
            "Invalid period_type for report subscription trigger",
        )),
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
    ensure_can_subscribe(&state, &user).await?;

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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    ApiJson(req): ApiJson<CreateReportSubscriptionRequest>,
) -> ApiResult<(StatusCode, Json<ReportSubscriptionResponse>)> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_can_subscribe(&state, &user).await?;

    validate_subscription_name(&req.name)?;
    if let Some(filters) = &req.filters {
        if !filters.is_object() {
            return Err(AppError::validation("filters must be a JSON object"));
        }
    }
    ensure_web_push_ready(&state, user.tenant_id, user.id, &req.delivery_channel).await?;

    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let tenant_id = user.tenant_id;
    let user_id = user.id;
    let input = CreateReportSubscription {
        user_id,
        name: req.name,
        template_id: req.template_id,
        period_type: req.period_type,
        delivery_channel: req.delivery_channel,
        export_format: req.export_format,
        filters: req.filters,
        is_active: req.is_active,
    };

    let created = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let authz_service = state.authz_service.clone();
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let input = input.clone();

        Box::pin(async move {
            let created =
                law_eye_core::ReportSubscriptionService::create_tx(tenant_id, tx, input).await?;

            authz_service
                .create_relation_tx(
                    tenant_id,
                    tx,
                    CreateAuthRelation {
                        resource_type: "report_subscription".to_string(),
                        resource_id: created.id,
                        relation: "owner".to_string(),
                        subject_type: "user".to_string(),
                        subject_key: user_id.to_string(),
                        subject_relation: None,
                        properties: serde_json::json!({
                            "created_by": "report_subscriptions.create",
                        }),
                        created_by: Some(user_id),
                    },
                )
                .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "report_subscriptions.create".to_string(),
                        resource: "report_subscriptions".to_string(),
                        resource_id: Some(created.id),
                        old_value: None,
                        new_value: Some(subscription_audit_value(&created)),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<ReportSubscription, Error>(created)
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok((
        StatusCode::CREATED,
        Json(ReportSubscriptionResponse::from(created)),
    ))
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
    ensure_can_subscribe(&state, &user).await?;

    let subscription = state
        .report_subscription_service
        .get_by_id(user.tenant_id, user.id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&subscription, user.id)?;
    ensure_subscription_authz(&state, &user, subscription.id).await?;

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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    Path(id): Path<Uuid>,
    ApiJson(req): ApiJson<UpdateReportSubscriptionRequest>,
) -> ApiResult<Json<ReportSubscriptionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_can_subscribe(&state, &user).await?;

    let current = state
        .report_subscription_service
        .get_by_id(user.tenant_id, user.id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&current, user.id)?;
    ensure_subscription_authz(&state, &user, current.id).await?;

    if let Some(name) = &req.name {
        validate_subscription_name(name)?;
    }
    if let Some(filters) = &req.filters {
        if !filters.is_object() {
            return Err(AppError::validation("filters must be a JSON object"));
        }
    }

    let target_delivery = req
        .delivery_channel
        .as_deref()
        .unwrap_or(current.delivery_channel.as_str());
    ensure_web_push_ready(&state, user.tenant_id, user.id, target_delivery).await?;

    let tenant_id = user.tenant_id;
    let user_id = user.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    let update = UpdateReportSubscription {
        name: req.name,
        template_id: req.template_id,
        period_type: req.period_type,
        delivery_channel: req.delivery_channel,
        export_format: req.export_format,
        filters: req.filters,
        is_active: req.is_active,
    };

    let updated = law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();
        let update = update.clone();

        Box::pin(async move {
            let before =
                law_eye_core::ReportSubscriptionService::get_by_id_tx(tx, user_id, id).await?;
            let after = law_eye_core::ReportSubscriptionService::update_tx(
                tenant_id, tx, user_id, id, update,
            )
            .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "report_subscriptions.update".to_string(),
                        resource: "report_subscriptions".to_string(),
                        resource_id: Some(id),
                        old_value: Some(subscription_audit_value(&before)),
                        new_value: Some(subscription_audit_value(&after)),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<ReportSubscription, Error>(after)
        })
    })
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<StatusCode> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_can_subscribe(&state, &user).await?;

    let current = state
        .report_subscription_service
        .get_by_id(user.tenant_id, user.id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&current, user.id)?;
    ensure_subscription_authz(&state, &user, current.id).await?;

    let tenant_id = user.tenant_id;
    let user_id = user.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);

    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let before =
                law_eye_core::ReportSubscriptionService::get_by_id_tx(tx, user_id, id).await?;
            law_eye_core::ReportSubscriptionService::soft_delete_tx(tx, user_id, id).await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "report_subscriptions.delete".to_string(),
                        resource: "report_subscriptions".to_string(),
                        resource_id: Some(id),
                        old_value: Some(subscription_audit_value(&before)),
                        new_value: Some(serde_json::json!({ "deleted": true })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<(), Error>(())
        })
    })
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
    headers: HeaderMap,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<ReportSubscriptionTriggerResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;
    ensure_can_subscribe(&state, &user).await?;

    let subscription = state
        .report_subscription_service
        .get_by_id(user.tenant_id, user.id, id)
        .await
        .map_err(AppError::from)?;
    ensure_owned(&subscription, user.id)?;
    ensure_subscription_authz(&state, &user, subscription.id).await?;

    if !subscription.is_active {
        return Err(AppError::validation(
            "inactive report subscriptions cannot be triggered",
        ));
    }

    ensure_web_push_ready(
        &state,
        user.tenant_id,
        user.id,
        &subscription.delivery_channel,
    )
    .await?;

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
        .transition_status(
            user.tenant_id,
            report.id,
            ReportStatus::Generating,
            report.version,
        )
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
        .map_err(|err| {
            AppError::internal(format!("failed to enqueue report generation task: {err}"))
        })?;

    let tenant_id = user.tenant_id;
    let user_id = user.id;
    let subscription_id = subscription.id;
    let (ip_address, user_agent) = super::extract_audit_meta(&headers, addr);
    law_eye_core::with_tenant_tx(&state.pool, tenant_id, |tx| {
        let audit_service = state.audit_service.clone();
        let ip_address = ip_address.clone();
        let user_agent = user_agent.clone();

        Box::pin(async move {
            let updated = law_eye_core::ReportSubscriptionService::mark_triggered_tx(
                tx,
                user_id,
                subscription_id,
            )
            .await?;

            audit_service
                .log_tx(
                    tenant_id,
                    tx,
                    CreateAuditLog {
                        user_id: Some(user_id),
                        action: "report_subscriptions.trigger".to_string(),
                        resource: "report_subscriptions".to_string(),
                        resource_id: Some(subscription_id),
                        old_value: Some(subscription_audit_value(&subscription)),
                        new_value: Some(serde_json::json!({
                            "report_id": report.id,
                            "last_triggered_at": updated.last_triggered_at,
                            "version": updated.version,
                        })),
                        ip_address,
                        user_agent,
                    },
                )
                .await?;

            Ok::<(), Error>(())
        })
    })
    .await
    .map_err(AppError::from)?;

    Ok(Json(ReportSubscriptionTriggerResponse {
        message: "Report subscription triggered successfully".to_string(),
        subscription_id,
        report_id: report.id,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn period_window_rejects_unknown_period_type() {
        let today = NaiveDate::from_ymd_opt(2026, 5, 5).unwrap();
        let err = period_window("yearly", today).unwrap_err();
        assert!(err.body.error.contains("Invalid period_type"));
    }

    #[test]
    fn validate_subscription_name_rejects_blank_names() {
        assert!(validate_subscription_name("   ").is_err());
    }

    #[test]
    fn subscription_audit_value_keeps_owner_safe_fields() {
        let id = Uuid::parse_str("11111111-1111-1111-1111-111111111111").unwrap();
        let tenant_id = Uuid::parse_str("22222222-2222-2222-2222-222222222222").unwrap();
        let user_id = Uuid::parse_str("33333333-3333-3333-3333-333333333333").unwrap();
        let template_id = Uuid::parse_str("44444444-4444-4444-4444-444444444444").unwrap();
        let now = Utc::now();
        let value = subscription_audit_value(&ReportSubscription {
            id,
            tenant_id,
            user_id,
            name: "Weekly".to_string(),
            template_id,
            period_type: "weekly".to_string(),
            delivery_channel: "in_app".to_string(),
            export_format: "pdf".to_string(),
            filters: serde_json::json!({"channel": "policy"}),
            is_active: true,
            last_triggered_at: None,
            version: 7,
            created_at: now,
            updated_at: now,
            deleted_at: None,
        });

        assert_eq!(value["id"], serde_json::json!(id));
        assert_eq!(value["name"], "Weekly");
        assert_eq!(value["filters"]["channel"], "policy");
        assert!(value.get("tenant_id").is_none());
        assert!(value.get("user_id").is_none());
    }
}
