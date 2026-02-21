use axum::{extract::State, Json};
use law_eye_common::{CacheService, CacheTtl};
use law_eye_core::statistics::{CrossDimensionalQuery, StatisticsQuery, TimelineQuery};

use super::dto::*;
use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiQuery, ApiResult, AppError};

fn normalize_date_range(
    date_from: Option<chrono::NaiveDate>,
    date_to: Option<chrono::NaiveDate>,
) -> Result<StatisticsQuery, AppError> {
    if let (Some(from), Some(to)) = (date_from, date_to) {
        if from > to {
            return Err(AppError::validation("date_from must be <= date_to"));
        }
    }
    Ok(StatisticsQuery { date_from, date_to })
}

fn normalize_dimension(raw: &str, field: &str) -> Result<String, AppError> {
    let normalized = raw.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err(AppError::validation(format!("{field} must not be empty")));
    }
    Ok(normalized)
}

fn normalize_cross_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(200).clamp(1, 1000)
}

fn normalize_timeline_granularity(raw: Option<&str>) -> Result<String, AppError> {
    let normalized = raw.unwrap_or("daily").trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized == "daily" {
        return Ok("daily".to_string());
    }
    if normalized == "weekly" {
        return Ok("weekly".to_string());
    }
    if normalized == "monthly" {
        return Ok("monthly".to_string());
    }
    Err(AppError::validation(
        "granularity must be one of: daily, weekly, monthly",
    ))
}

fn normalize_timeline_days(days: Option<i32>) -> i32 {
    days.unwrap_or(30).clamp(1, 365)
}

fn normalize_timeline_top_n(top_n: Option<i32>) -> i32 {
    top_n.unwrap_or(5).clamp(1, 20)
}

pub(crate) async fn get_regional(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<StatisticsQueryParams>,
) -> ApiResult<Json<RegionalDistributionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = normalize_date_range(params.date_from, params.date_to)?;

    // Cache-Aside: 先查缓存
    let cache_key = CacheService::build_key(user.tenant_id, "statistics:regional", &query);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<RegionalDistributionResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .regional_distribution(user.tenant_id, &query)
        .await
        .map_err(AppError::from)?;

    let response = RegionalDistributionResponse {
        items: result
            .items
            .into_iter()
            .map(|r| RegionalCountDto {
                region_code: r.region_code,
                region_name: r.region_name,
                count: r.count,
                percentage: r.percentage,
            })
            .collect(),
        total: result.total,
        coverage_rate: result.coverage_rate,
    };

    // 写入缓存
    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

pub(crate) async fn get_industry(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<IndustryQueryParams>,
) -> ApiResult<Json<IndustryDistributionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = normalize_date_range(params.date_from, params.date_to)?;
    let include_sub = params.include_sub.unwrap_or(false);

    // Cache-Aside: 先查缓存
    let cache_params = serde_json::json!({"q": &query, "include_sub": include_sub});
    let cache_key = CacheService::build_key(user.tenant_id, "statistics:industry", &cache_params);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<IndustryDistributionResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .industry_distribution(user.tenant_id, &query, include_sub)
        .await
        .map_err(AppError::from)?;

    let response = IndustryDistributionResponse {
        items: result
            .items
            .into_iter()
            .map(|d| DomainCountDto {
                domain_root: d.domain_root,
                label: d.label,
                count: d.count,
                percentage: d.percentage,
                sub_domains: d.sub_domains.map(|subs| {
                    subs.into_iter()
                        .map(|s| SubDomainCountDto {
                            domain_sub: s.domain_sub,
                            count: s.count,
                        })
                        .collect()
                }),
            })
            .collect(),
        total: result.total,
        coverage_rate: result.coverage_rate,
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

pub(crate) async fn get_importance(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<StatisticsQueryParams>,
) -> ApiResult<Json<ImportanceDistributionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = normalize_date_range(params.date_from, params.date_to)?;

    let cache_key = CacheService::build_key(user.tenant_id, "statistics:importance", &query);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<ImportanceDistributionResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .importance_distribution(user.tenant_id, &query)
        .await
        .map_err(AppError::from)?;

    let response = ImportanceDistributionResponse {
        levels: result.levels,
        total: result.total,
        average: result.average,
        coverage_rate: result.coverage_rate,
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

pub(crate) async fn get_authority(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<StatisticsQueryParams>,
) -> ApiResult<Json<AuthorityDistributionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = normalize_date_range(params.date_from, params.date_to)?;

    let cache_key = CacheService::build_key(user.tenant_id, "statistics:authority", &query);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<AuthorityDistributionResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .authority_distribution(user.tenant_id, &query)
        .await
        .map_err(AppError::from)?;

    let response = AuthorityDistributionResponse {
        levels: result
            .levels
            .into_iter()
            .map(|l| AuthorityLevelCountDto {
                level: l.level,
                label: l.label,
                count: l.count,
                percentage: l.percentage,
            })
            .collect(),
        total: result.total,
        coverage_rate: result.coverage_rate,
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

pub(crate) async fn get_issuer(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<IssuerQueryParams>,
) -> ApiResult<Json<IssuerDistributionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = normalize_date_range(params.date_from, params.date_to)?;
    let limit = params.limit.unwrap_or(20).clamp(1, 200);

    let cache_params = serde_json::json!({"q": &query, "limit": limit});
    let cache_key = CacheService::build_key(user.tenant_id, "statistics:issuer", &cache_params);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<IssuerDistributionResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .issuer_distribution(user.tenant_id, &query, limit)
        .await
        .map_err(AppError::from)?;

    let response = IssuerDistributionResponse {
        items: result
            .items
            .into_iter()
            .map(|i| IssuerCountDto {
                issuer: i.issuer,
                count: i.count,
                percentage: i.percentage,
            })
            .collect(),
        total: result.total,
        unique_issuers: result.unique_issuers,
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

pub(crate) async fn get_cross_dimensional(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<CrossDimensionalQueryParams>,
) -> ApiResult<Json<CrossDimensionalResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let date_query = normalize_date_range(params.date_from, params.date_to)?;
    let query = CrossDimensionalQuery {
        dimension_x: normalize_dimension(&params.dimension_x, "dimension_x")?,
        dimension_y: normalize_dimension(&params.dimension_y, "dimension_y")?,
        date_from: date_query.date_from,
        date_to: date_query.date_to,
        limit: Some(normalize_cross_limit(params.limit)),
    };

    let cache_key = CacheService::build_key(user.tenant_id, "statistics:cross", &query);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<CrossDimensionalResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .cross_dimensional(user.tenant_id, &query)
        .await
        .map_err(AppError::from)?;

    let response = CrossDimensionalResponse {
        dimension_x: result.dimension_x,
        dimension_y: result.dimension_y,
        cells: result
            .cells
            .into_iter()
            .map(|c| CrossDimensionalCellDto {
                x_value: c.x_value,
                y_value: c.y_value,
                count: c.count,
            })
            .collect(),
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

pub(crate) async fn get_timeline(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<TimelineQueryParams>,
) -> ApiResult<Json<TimelineByDimensionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = TimelineQuery {
        dimension: normalize_dimension(&params.dimension, "dimension")?,
        granularity: Some(normalize_timeline_granularity(
            params.granularity.as_deref(),
        )?),
        days: Some(normalize_timeline_days(params.days)),
        top_n: Some(normalize_timeline_top_n(params.top_n)),
    };

    let cache_key = CacheService::build_key(user.tenant_id, "statistics:timeline", &query);
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<TimelineByDimensionResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .timeline_by_dimension(user.tenant_id, &query)
        .await
        .map_err(AppError::from)?;

    let response = TimelineByDimensionResponse {
        dimension: result.dimension,
        granularity: result.granularity,
        series: result
            .series
            .into_iter()
            .map(|s| TimelineSeriesDto {
                dimension_value: s.dimension_value,
                label: s.label,
                points: s
                    .points
                    .into_iter()
                    .map(|p| TimelinePointDto {
                        date: p.date,
                        count: p.count,
                    })
                    .collect(),
            })
            .collect(),
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::STATISTICS).await;
    }

    Ok(Json(response))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn normalize_date_range_rejects_inverted_range() {
        let from = NaiveDate::from_ymd_opt(2026, 2, 21).expect("valid date");
        let to = NaiveDate::from_ymd_opt(2026, 2, 20).expect("valid date");
        let err = normalize_date_range(Some(from), Some(to)).expect_err("should reject range");
        assert_eq!(err.body.code.as_deref(), Some("VALIDATION_ERROR"));
    }

    #[test]
    fn normalize_dimension_trims_and_lowercases() {
        let normalized = normalize_dimension("  Domain  ", "dimension").expect("normalize");
        assert_eq!(normalized, "domain");
    }

    #[test]
    fn normalize_timeline_granularity_rejects_unknown_value() {
        let err = normalize_timeline_granularity(Some("hourly")).expect_err("invalid granularity");
        assert_eq!(err.body.code.as_deref(), Some("VALIDATION_ERROR"));
    }

    #[test]
    fn normalize_numeric_params_clamp_to_expected_range() {
        assert_eq!(normalize_cross_limit(Some(9_999)), 1_000);
        assert_eq!(normalize_timeline_days(Some(0)), 1);
        assert_eq!(normalize_timeline_top_n(Some(200)), 20);
    }
}

pub(crate) async fn get_overview(
    State(state): State<AppState>,
    auth_session: AuthSession,
) -> ApiResult<Json<StatisticsOverviewResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let cache_key = CacheService::build_key_simple(user.tenant_id, "statistics:overview");
    if let Some(ref cache) = state.cache_service {
        if let Some(cached) = cache
            .get::<StatisticsOverviewResponse>(&cache_key)
            .await
            .unwrap_or(None)
        {
            return Ok(Json(cached));
        }
    }

    let result = state
        .statistics_service
        .overview(user.tenant_id)
        .await
        .map_err(AppError::from)?;

    let response = StatisticsOverviewResponse {
        total_articles: result.total_articles,
        with_region: result.with_region,
        with_domain: result.with_domain,
        with_importance: result.with_importance,
        with_authority: result.with_authority,
        with_issuer: result.with_issuer,
    };

    if let Some(ref cache) = state.cache_service {
        let _ = cache.set(&cache_key, &response, CacheTtl::OVERVIEW).await;
    }

    Ok(Json(response))
}
