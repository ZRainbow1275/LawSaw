use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

// ── Query parameter DTOs ─────────────────────────────────────────────

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StatisticsQueryParams {
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct IndustryQueryParams {
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub include_sub: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct IssuerQueryParams {
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CrossDimensionalQueryParams {
    pub dimension_x: String,
    pub dimension_y: String,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TimelineQueryParams {
    pub dimension: String,
    pub granularity: Option<String>,
    pub days: Option<i32>,
    pub top_n: Option<i32>,
}

// ── Response DTOs ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct RegionalDistributionResponse {
    pub items: Vec<RegionalCountDto>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct RegionalCountDto {
    pub region_code: String,
    pub region_name: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct IndustryDistributionResponse {
    pub items: Vec<DomainCountDto>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct DomainCountDto {
    pub domain_root: String,
    pub label: String,
    pub count: i64,
    pub percentage: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_domains: Option<Vec<SubDomainCountDto>>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct SubDomainCountDto {
    pub domain_sub: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct ImportanceDistributionResponse {
    pub levels: [i64; 5],
    pub total: i64,
    pub average: f64,
    pub coverage_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct AuthorityDistributionResponse {
    pub levels: Vec<AuthorityLevelCountDto>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct AuthorityLevelCountDto {
    pub level: i32,
    pub label: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct IssuerDistributionResponse {
    pub items: Vec<IssuerCountDto>,
    pub total: i64,
    pub unique_issuers: i64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct IssuerCountDto {
    pub issuer: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct CrossDimensionalResponse {
    pub dimension_x: String,
    pub dimension_y: String,
    pub cells: Vec<CrossDimensionalCellDto>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct CrossDimensionalCellDto {
    pub x_value: String,
    pub y_value: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct TimelineByDimensionResponse {
    pub dimension: String,
    pub granularity: String,
    pub series: Vec<TimelineSeriesDto>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct TimelineSeriesDto {
    pub dimension_value: String,
    pub label: String,
    pub points: Vec<TimelinePointDto>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct TimelinePointDto {
    pub date: NaiveDate,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct StatisticsOverviewResponse {
    pub total_articles: i64,
    pub with_region: i64,
    pub with_domain: i64,
    pub with_importance: i64,
    pub with_authority: i64,
    pub with_issuer: i64,
}
