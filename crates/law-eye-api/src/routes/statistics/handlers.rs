use axum::{extract::State, Json};
use law_eye_common::{CacheService, CacheTtl};
use law_eye_core::statistics::{CrossDimensionalQuery, StatisticsQuery, TimelineQuery};

use super::dto::*;
use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiQuery, ApiResult, AppError};

pub(crate) async fn get_regional(
    State(state): State<AppState>,
    auth_session: AuthSession,
    ApiQuery(params): ApiQuery<StatisticsQueryParams>,
) -> ApiResult<Json<RegionalDistributionResponse>> {
    let user = auth_session
        .user
        .ok_or_else(|| AppError::unauthorized("Not authenticated"))?;

    let query = StatisticsQuery {
        date_from: params.date_from,
        date_to: params.date_to,
    };

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

    let query = StatisticsQuery {
        date_from: params.date_from,
        date_to: params.date_to,
    };
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

    let query = StatisticsQuery {
        date_from: params.date_from,
        date_to: params.date_to,
    };

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

    let query = StatisticsQuery {
        date_from: params.date_from,
        date_to: params.date_to,
    };

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

    let query = StatisticsQuery {
        date_from: params.date_from,
        date_to: params.date_to,
    };
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

    let query = CrossDimensionalQuery {
        dimension_x: params.dimension_x,
        dimension_y: params.dimension_y,
        date_from: params.date_from,
        date_to: params.date_to,
        limit: params.limit,
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
        dimension: params.dimension,
        granularity: params.granularity,
        days: params.days,
        top_n: params.top_n,
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
