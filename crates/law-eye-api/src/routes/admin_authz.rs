use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};
use uuid::Uuid;

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiError, ApiResult, AppError};

const RELATIONS_DEFAULT_LIMIT: i64 = 50;
const RELATIONS_MAX_LIMIT: i64 = 200;

#[derive(Debug, Deserialize, IntoParams, ToSchema)]
pub struct ListRelationsQuery {
    pub subject_type: Option<String>,
    pub resource_type: Option<String>,
    pub relation: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRelationListItem {
    pub id: Uuid,
    pub resource_type: String,
    pub resource_id: Uuid,
    pub relation: String,
    pub subject_type: String,
    pub subject_id: Option<Uuid>,
    pub subject_key: String,
    pub subject_relation: Option<String>,
    pub properties: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<law_eye_db::AuthRelation> for AdminRelationListItem {
    fn from(value: law_eye_db::AuthRelation) -> Self {
        Self {
            id: value.id,
            resource_type: value.resource_type,
            resource_id: value.resource_id,
            relation: value.relation,
            subject_type: value.subject_type,
            subject_id: value.subject_id,
            subject_key: value.subject_key,
            subject_relation: value.subject_relation,
            properties: value.properties,
            created_at: value.created_at,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AdminRelationListResponse {
    pub items: Vec<AdminRelationListItem>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/relations", get(list_admin_relations))
}

#[utoipa::path(
    get,
    path = "/api/v1/admin/authz/relations",
    params(ListRelationsQuery),
    security(("session" = [])),
    responses(
        (status = 200, body = AdminRelationListResponse),
        (status = 401, body = ApiError),
        (status = 403, body = ApiError),
        (status = 500, body = ApiError),
    ),
    tag = "admin-authz"
)]
pub(crate) async fn list_admin_relations(
    State(state): State<AppState>,
    auth_session: AuthSession,
    Query(query): Query<ListRelationsQuery>,
) -> ApiResult<Json<AdminRelationListResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Authentication required"))?;

    let limit = query
        .limit
        .unwrap_or(RELATIONS_DEFAULT_LIMIT)
        .clamp(1, RELATIONS_MAX_LIMIT);
    let offset = query.offset.unwrap_or(0).max(0);

    let (rows, total) = state
        .authz_service
        .list_relations(
            user.tenant_id,
            query.subject_type.as_deref(),
            query.resource_type.as_deref(),
            query.relation.as_deref(),
            limit,
            offset,
        )
        .await
        .map_err(AppError::from)?;

    Ok(Json(AdminRelationListResponse {
        items: rows.into_iter().map(AdminRelationListItem::from).collect(),
        total,
        limit,
        offset,
    }))
}
