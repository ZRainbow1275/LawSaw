use axum::{extract::State, routing::get, Json, Router};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiQuery, ApiResult};

mod dto;
mod handlers;

pub use dto::{
    AuthorityDistributionResponse, CrossDimensionalResponse, ImportanceDistributionResponse,
    IndustryDistributionResponse, IssuerDistributionResponse, RegionalDistributionResponse,
    StatisticsOverviewResponse, TimelineByDimensionResponse,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/regional", get(get_regional))
        .route("/industry", get(get_industry))
        .route("/importance", get(get_importance))
        .route("/authority", get(get_authority))
        .route("/issuer", get(get_issuer))
        .route("/cross", get(get_cross_dimensional))
        .route("/timeline", get(get_timeline))
        .route("/overview", get(get_overview))
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/regional",
    params(
        ("date_from" = Option<String>, Query, description = "Start date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "End date (YYYY-MM-DD)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Regional distribution", body = RegionalDistributionResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_regional(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::StatisticsQueryParams>,
) -> ApiResult<Json<dto::RegionalDistributionResponse>> {
    handlers::get_regional(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/industry",
    params(
        ("date_from" = Option<String>, Query, description = "Start date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "End date (YYYY-MM-DD)"),
        ("include_sub" = Option<bool>, Query, description = "Include sub-domain breakdown")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Industry distribution", body = IndustryDistributionResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_industry(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::IndustryQueryParams>,
) -> ApiResult<Json<dto::IndustryDistributionResponse>> {
    handlers::get_industry(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/importance",
    params(
        ("date_from" = Option<String>, Query, description = "Start date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "End date (YYYY-MM-DD)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Importance distribution", body = ImportanceDistributionResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_importance(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::StatisticsQueryParams>,
) -> ApiResult<Json<dto::ImportanceDistributionResponse>> {
    handlers::get_importance(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/authority",
    params(
        ("date_from" = Option<String>, Query, description = "Start date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "End date (YYYY-MM-DD)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Authority level distribution", body = AuthorityDistributionResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_authority(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::StatisticsQueryParams>,
) -> ApiResult<Json<dto::AuthorityDistributionResponse>> {
    handlers::get_authority(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/issuer",
    params(
        ("date_from" = Option<String>, Query, description = "Start date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "End date (YYYY-MM-DD)"),
        ("limit" = Option<i64>, Query, description = "Max issuers to return (1-200)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Issuer distribution", body = IssuerDistributionResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_issuer(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::IssuerQueryParams>,
) -> ApiResult<Json<dto::IssuerDistributionResponse>> {
    handlers::get_issuer(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/cross",
    params(
        ("dimension_x" = String, Query, description = "X-axis dimension (region|domain|importance|authority|risk|sentiment|issuer)"),
        ("dimension_y" = String, Query, description = "Y-axis dimension"),
        ("date_from" = Option<String>, Query, description = "Start date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "End date (YYYY-MM-DD)"),
        ("limit" = Option<i64>, Query, description = "Max cells (1-1000)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Cross-dimensional analysis", body = CrossDimensionalResponse),
        (status = 400, description = "Invalid dimension"),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_cross_dimensional(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::CrossDimensionalQueryParams>,
) -> ApiResult<Json<dto::CrossDimensionalResponse>> {
    handlers::get_cross_dimensional(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/timeline",
    params(
        ("dimension" = String, Query, description = "Dimension to track (region|domain|importance|authority)"),
        ("granularity" = Option<String>, Query, description = "daily|weekly|monthly"),
        ("days" = Option<i32>, Query, description = "Number of days (1-365)"),
        ("top_n" = Option<i32>, Query, description = "Top N dimension values (1-20)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Timeline by dimension", body = TimelineByDimensionResponse),
        (status = 400, description = "Invalid dimension"),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_timeline(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<dto::TimelineQueryParams>,
) -> ApiResult<Json<dto::TimelineByDimensionResponse>> {
    handlers::get_timeline(state, auth_session, query).await
}

#[utoipa::path(
    get,
    path = "/api/v1/statistics/overview",
    security(("session" = [])),
    responses(
        (status = 200, description = "Statistics coverage overview", body = StatisticsOverviewResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "statistics"
)]
pub(crate) async fn get_overview(
    state: State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<dto::StatisticsOverviewResponse>> {
    handlers::get_overview(state, auth_session).await
}
