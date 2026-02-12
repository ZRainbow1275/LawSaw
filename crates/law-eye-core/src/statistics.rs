use chrono::NaiveDate;
use law_eye_common::{Error, Result};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

// ── Region code -> name mapping (GB/T 2260) ─────────────────────────

pub const REGION_MAP: &[(&str, &str)] = &[
    ("110000", "\u{5317}\u{4eac}"),   // 北京
    ("120000", "\u{5929}\u{6d25}"),   // 天津
    ("130000", "\u{6cb3}\u{5317}"),   // 河北
    ("140000", "\u{5c71}\u{897f}"),   // 山西
    ("150000", "\u{5185}\u{8499}\u{53e4}"), // 内蒙古
    ("210000", "\u{8fbd}\u{5b81}"),   // 辽宁
    ("220000", "\u{5409}\u{6797}"),   // 吉林
    ("230000", "\u{9ed1}\u{9f99}\u{6c5f}"), // 黑龙江
    ("310000", "\u{4e0a}\u{6d77}"),   // 上海
    ("320000", "\u{6c5f}\u{82cf}"),   // 江苏
    ("330000", "\u{6d59}\u{6c5f}"),   // 浙江
    ("340000", "\u{5b89}\u{5fbd}"),   // 安徽
    ("350000", "\u{798f}\u{5efa}"),   // 福建
    ("360000", "\u{6c5f}\u{897f}"),   // 江西
    ("370000", "\u{5c71}\u{4e1c}"),   // 山东
    ("410000", "\u{6cb3}\u{5357}"),   // 河南
    ("420000", "\u{6e56}\u{5317}"),   // 湖北
    ("430000", "\u{6e56}\u{5357}"),   // 湖南
    ("440000", "\u{5e7f}\u{4e1c}"),   // 广东
    ("450000", "\u{5e7f}\u{897f}"),   // 广西
    ("460000", "\u{6d77}\u{5357}"),   // 海南
    ("500000", "\u{91cd}\u{5e86}"),   // 重庆
    ("510000", "\u{56db}\u{5ddd}"),   // 四川
    ("520000", "\u{8d35}\u{5dde}"),   // 贵州
    ("530000", "\u{4e91}\u{5357}"),   // 云南
    ("540000", "\u{897f}\u{85cf}"),   // 西藏
    ("610000", "\u{9655}\u{897f}"),   // 陕西
    ("620000", "\u{7518}\u{8083}"),   // 甘肃
    ("630000", "\u{9752}\u{6d77}"),   // 青海
    ("640000", "\u{5b81}\u{590f}"),   // 宁夏
    ("650000", "\u{65b0}\u{7586}"),   // 新疆
    ("710000", "\u{53f0}\u{6e7e}"),   // 台湾
    ("810000", "\u{9999}\u{6e2f}"),   // 香港
    ("820000", "\u{6fb3}\u{95e8}"),   // 澳门
];

pub fn region_code_to_name(code: &str) -> &str {
    REGION_MAP
        .iter()
        .find(|(c, _)| *c == code)
        .map(|(_, name)| *name)
        .unwrap_or("\u{672a}\u{77e5}\u{5730}\u{533a}") // 未知地区
}

// Domain root -> Chinese label
pub fn domain_root_label(root: &str) -> &str {
    match root {
        "legislation" => "\u{7acb}\u{6cd5}\u{524d}\u{6cbf}",     // 立法前沿
        "regulation" => "\u{76d1}\u{7ba1}\u{52a8}\u{5411}",       // 监管动向
        "enforcement" => "\u{6267}\u{6cd5}\u{6848}\u{4f8b}",      // 执法案例
        "industry" => "\u{4e1a}\u{754c}\u{8d44}\u{8baf}",         // 业界资讯
        "compliance" => "\u{5408}\u{89c4}\u{524d}\u{6cbf}",       // 合规前沿
        "technology" => "\u{6570}\u{636e}/\u{5b89}\u{5168}/\u{6280}\u{672f}", // 数据/安全/技术
        "academic" => "\u{5b66}\u{672f}\u{6587}\u{7ae0}",         // 学术文章
        "international" => "\u{56fd}\u{9645}\u{89c6}\u{91ce}",    // 国际视野
        _ => root,
    }
}

// Authority level -> Chinese label
fn authority_level_label(level: i32) -> &'static str {
    match level {
        1 => "\u{5baa}\u{6cd5}",             // 宪法
        2 => "\u{6cd5}\u{5f8b}",             // 法律
        3 => "\u{884c}\u{653f}\u{6cd5}\u{89c4}", // 行政法规
        4 => "\u{90e8}\u{95e8}\u{89c4}\u{7ae0}", // 部门规章
        5 => "\u{5730}\u{65b9}\u{6027}\u{6cd5}\u{89c4}", // 地方性法规
        6 => "\u{5730}\u{65b9}\u{653f}\u{5e9c}\u{89c4}\u{7ae0}", // 地方政府规章
        7 => "\u{53f8}\u{6cd5}\u{89e3}\u{91ca}", // 司法解释
        8 => "\u{89c4}\u{8303}\u{6027}\u{6587}\u{4ef6}", // 规范性文件
        9 => "\u{884c}\u{4e1a}\u{6807}\u{51c6}", // 行业标准
        10 => "\u{975e}\u{6b63}\u{5f0f}",    // 非正式
        _ => "\u{672a}\u{77e5}",              // 未知
    }
}

// ── Data types ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionalDistribution {
    pub items: Vec<RegionalCount>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionalCount {
    pub region_code: String,
    pub region_name: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndustryDistribution {
    pub items: Vec<DomainCount>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainCount {
    pub domain_root: String,
    pub label: String,
    pub count: i64,
    pub percentage: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_domains: Option<Vec<SubDomainCount>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubDomainCount {
    pub domain_sub: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportanceDistribution {
    pub levels: [i64; 5],
    pub total: i64,
    pub average: f64,
    pub coverage_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorityDistribution {
    pub levels: Vec<AuthorityLevelCount>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorityLevelCount {
    pub level: i32,
    pub label: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuerDistribution {
    pub items: Vec<IssuerCount>,
    pub total: i64,
    pub unique_issuers: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuerCount {
    pub issuer: String,
    pub count: i64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossDimensionalResult {
    pub dimension_x: String,
    pub dimension_y: String,
    pub cells: Vec<CrossDimensionalCell>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossDimensionalCell {
    pub x_value: String,
    pub y_value: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineByDimension {
    pub dimension: String,
    pub granularity: String,
    pub series: Vec<TimelineSeries>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineSeries {
    pub dimension_value: String,
    pub label: String,
    pub points: Vec<TimelinePoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelinePoint {
    pub date: NaiveDate,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticsOverview {
    pub total_articles: i64,
    pub with_region: i64,
    pub with_domain: i64,
    pub with_importance: i64,
    pub with_authority: i64,
    pub with_issuer: i64,
}

// ── Query parameters ─────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatisticsQuery {
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossDimensionalQuery {
    pub dimension_x: String,
    pub dimension_y: String,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineQuery {
    pub dimension: String,
    pub granularity: Option<String>,
    pub days: Option<i32>,
    pub top_n: Option<i32>,
}

// ── Service ──────────────────────────────────────────────────────────

pub struct StatisticsService {
    pool: PgPool,
}

impl StatisticsService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn regional_distribution(
        &self,
        tenant_id: Uuid,
        query: &StatisticsQuery,
    ) -> Result<RegionalDistribution> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            r#"
            SELECT region_code, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND region_code IS NOT NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            GROUP BY region_code
            ORDER BY count DESC
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total_row: (i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE region_code IS NOT NULL)::bigint AS with_region
            FROM articles
            WHERE tenant_id = $1 AND deleted_at IS NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total = total_row.0;
        let with_region = total_row.1;
        let sum: i64 = rows.iter().map(|(_, c)| c).sum();

        let items = rows
            .into_iter()
            .map(|(code, count)| {
                let percentage = if sum > 0 {
                    count as f64 / sum as f64
                } else {
                    0.0
                };
                RegionalCount {
                    region_name: region_code_to_name(&code).to_string(),
                    region_code: code,
                    count,
                    percentage,
                }
            })
            .collect();

        let coverage_rate = if total > 0 {
            with_region as f64 / total as f64
        } else {
            0.0
        };

        Ok(RegionalDistribution {
            items,
            total: with_region,
            coverage_rate,
        })
    }

    pub async fn industry_distribution(
        &self,
        tenant_id: Uuid,
        query: &StatisticsQuery,
        include_sub: bool,
    ) -> Result<IndustryDistribution> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            r#"
            SELECT domain_root, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND domain_root IS NOT NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            GROUP BY domain_root
            ORDER BY count DESC
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total_row: (i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE domain_root IS NOT NULL)::bigint AS with_domain
            FROM articles
            WHERE tenant_id = $1 AND deleted_at IS NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total = total_row.0;
        let with_domain = total_row.1;
        let sum: i64 = rows.iter().map(|(_, c)| c).sum();

        // Optionally load sub-domain breakdown
        let sub_map: std::collections::HashMap<String, Vec<SubDomainCount>> = if include_sub {
            let sub_rows: Vec<(String, String, i64)> = sqlx::query_as(
                r#"
                SELECT domain_root, domain_sub, COUNT(*)::bigint AS count
                FROM articles
                WHERE tenant_id = $1
                  AND deleted_at IS NULL
                  AND domain_root IS NOT NULL
                  AND domain_sub IS NOT NULL
                  AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
                  AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
                GROUP BY domain_root, domain_sub
                ORDER BY domain_root, count DESC
                "#,
            )
            .bind(tenant_id)
            .bind(query.date_from)
            .bind(query.date_to)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

            let mut map: std::collections::HashMap<String, Vec<SubDomainCount>> =
                std::collections::HashMap::new();
            for (root, sub, count) in sub_rows {
                map.entry(root).or_default().push(SubDomainCount {
                    domain_sub: sub,
                    count,
                });
            }
            map
        } else {
            std::collections::HashMap::new()
        };

        let items = rows
            .into_iter()
            .map(|(root, count)| {
                let percentage = if sum > 0 {
                    count as f64 / sum as f64
                } else {
                    0.0
                };
                let sub_domains = sub_map.get(&root).cloned();
                DomainCount {
                    label: domain_root_label(&root).to_string(),
                    domain_root: root,
                    count,
                    percentage,
                    sub_domains,
                }
            })
            .collect();

        let coverage_rate = if total > 0 {
            with_domain as f64 / total as f64
        } else {
            0.0
        };

        Ok(IndustryDistribution {
            items,
            total: with_domain,
            coverage_rate,
        })
    }

    pub async fn importance_distribution(
        &self,
        tenant_id: Uuid,
        query: &StatisticsQuery,
    ) -> Result<ImportanceDistribution> {
        let rows: Vec<(i32, i64)> = sqlx::query_as(
            r#"
            SELECT importance, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND importance IS NOT NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            GROUP BY importance
            ORDER BY importance
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let agg_row: (Option<f64>, i64, i64) = sqlx::query_as(
            r#"
            SELECT
                AVG(importance)::float8 AS average,
                COUNT(*) FILTER (WHERE importance IS NOT NULL)::bigint AS with_importance,
                COUNT(*)::bigint AS total
            FROM articles
            WHERE tenant_id = $1 AND deleted_at IS NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let mut levels = [0i64; 5];
        for (level, count) in &rows {
            let idx = (*level as usize).saturating_sub(1).min(4);
            levels[idx] += count;
        }

        let total = agg_row.2;
        let with_importance = agg_row.1;
        let average = agg_row.0.unwrap_or(0.0);
        let coverage_rate = if total > 0 {
            with_importance as f64 / total as f64
        } else {
            0.0
        };

        Ok(ImportanceDistribution {
            levels,
            total: with_importance,
            average,
            coverage_rate,
        })
    }

    pub async fn authority_distribution(
        &self,
        tenant_id: Uuid,
        query: &StatisticsQuery,
    ) -> Result<AuthorityDistribution> {
        let rows: Vec<(i32, i64)> = sqlx::query_as(
            r#"
            SELECT authority_level, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND authority_level IS NOT NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            GROUP BY authority_level
            ORDER BY authority_level
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total_row: (i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE authority_level IS NOT NULL)::bigint AS with_authority
            FROM articles
            WHERE tenant_id = $1 AND deleted_at IS NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total = total_row.0;
        let with_authority = total_row.1;
        let sum: i64 = rows.iter().map(|(_, c)| c).sum();

        let levels = rows
            .into_iter()
            .map(|(level, count)| {
                let percentage = if sum > 0 {
                    count as f64 / sum as f64
                } else {
                    0.0
                };
                AuthorityLevelCount {
                    level,
                    label: authority_level_label(level).to_string(),
                    count,
                    percentage,
                }
            })
            .collect();

        let coverage_rate = if total > 0 {
            with_authority as f64 / total as f64
        } else {
            0.0
        };

        Ok(AuthorityDistribution {
            levels,
            total: with_authority,
            coverage_rate,
        })
    }

    pub async fn issuer_distribution(
        &self,
        tenant_id: Uuid,
        query: &StatisticsQuery,
        limit: i64,
    ) -> Result<IssuerDistribution> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            r#"
            SELECT issuer, COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND issuer IS NOT NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            GROUP BY issuer
            ORDER BY count DESC
            LIMIT $4
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let agg_row: (i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*) FILTER (WHERE issuer IS NOT NULL)::bigint AS total_with_issuer,
                COUNT(DISTINCT issuer)::bigint AS unique_issuers
            FROM articles
            WHERE tenant_id = $1 AND deleted_at IS NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            "#,
        )
        .bind(tenant_id)
        .bind(query.date_from)
        .bind(query.date_to)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        let total = agg_row.0;
        let unique_issuers = agg_row.1;

        let items = rows
            .into_iter()
            .map(|(issuer, count)| {
                let percentage = if total > 0 {
                    count as f64 / total as f64
                } else {
                    0.0
                };
                IssuerCount {
                    issuer,
                    count,
                    percentage,
                }
            })
            .collect();

        Ok(IssuerDistribution {
            items,
            total,
            unique_issuers,
        })
    }

    pub async fn cross_dimensional(
        &self,
        tenant_id: Uuid,
        query: &CrossDimensionalQuery,
    ) -> Result<CrossDimensionalResult> {
        let col_x = Self::dimension_to_column(&query.dimension_x)?;
        let col_y = Self::dimension_to_column(&query.dimension_y)?;
        let limit = query.limit.unwrap_or(200).clamp(1, 1000);

        // We need to use a dynamic query since column names can't be parameterized
        let sql = format!(
            r#"
            SELECT
                COALESCE({col_x}::text, 'unknown') AS x_value,
                COALESCE({col_y}::text, 'unknown') AS y_value,
                COUNT(*)::bigint AS count
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND {col_x} IS NOT NULL
              AND {col_y} IS NOT NULL
              AND ($2::date IS NULL OR created_at >= $2::date::timestamptz)
              AND ($3::date IS NULL OR created_at < ($3::date + 1)::timestamptz)
            GROUP BY x_value, y_value
            ORDER BY count DESC
            LIMIT $4
            "#,
        );

        let rows: Vec<(String, String, i64)> = sqlx::query_as(&sql)
            .bind(tenant_id)
            .bind(query.date_from)
            .bind(query.date_to)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let cells = rows
            .into_iter()
            .map(|(x, y, count)| CrossDimensionalCell {
                x_value: x,
                y_value: y,
                count,
            })
            .collect();

        Ok(CrossDimensionalResult {
            dimension_x: query.dimension_x.clone(),
            dimension_y: query.dimension_y.clone(),
            cells,
        })
    }

    pub async fn timeline_by_dimension(
        &self,
        tenant_id: Uuid,
        query: &TimelineQuery,
    ) -> Result<TimelineByDimension> {
        let dim_col = Self::dimension_to_column(&query.dimension)?;
        let days = query.days.unwrap_or(30).clamp(1, 365);
        let top_n = query.top_n.unwrap_or(5).clamp(1, 20);
        let granularity = query.granularity.as_deref().unwrap_or("daily");

        let interval = match granularity {
            "weekly" => "7 days",
            "monthly" => "1 month",
            _ => "1 day",
        };

        // First get top N dimension values
        let top_values_sql = format!(
            r#"
            SELECT {dim_col}::text AS dim_value
            FROM articles
            WHERE tenant_id = $1
              AND deleted_at IS NULL
              AND {dim_col} IS NOT NULL
              AND created_at >= (CURRENT_DATE - ($2::int * INTERVAL '1 day'))
            GROUP BY {dim_col}
            ORDER BY COUNT(*) DESC
            LIMIT $3
            "#,
        );

        let top_values: Vec<(String,)> = sqlx::query_as(&top_values_sql)
            .bind(tenant_id)
            .bind(days)
            .bind(top_n as i64)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        let top_dim_values: Vec<String> = top_values.into_iter().map(|(v,)| v).collect();

        // Then get timeline data for those values
        let timeline_sql = format!(
            r#"
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - (($2::int - 1) * INTERVAL '1 day'),
                    CURRENT_DATE,
                    '{interval}'::interval
                )::date AS date
            )
            SELECT
                ds.date,
                COALESCE(a.{dim_col}::text, '') AS dimension_value,
                COUNT(a.id)::bigint AS count
            FROM date_series ds
            LEFT JOIN articles a
                ON a.created_at >= ds.date::timestamptz
               AND a.created_at < (ds.date::timestamptz + '{interval}'::interval)
               AND a.tenant_id = $1
               AND a.deleted_at IS NULL
               AND a.{dim_col} IS NOT NULL
               AND a.{dim_col}::text = ANY($3)
            GROUP BY ds.date, a.{dim_col}
            ORDER BY ds.date ASC
            "#,
        );

        let rows: Vec<(NaiveDate, String, i64)> = sqlx::query_as(&timeline_sql)
            .bind(tenant_id)
            .bind(days)
            .bind(&top_dim_values)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| Error::Database(e.to_string()))?;

        // Group into series
        let mut series_map: std::collections::HashMap<String, Vec<TimelinePoint>> =
            std::collections::HashMap::new();

        for (date, dim_val, count) in rows {
            if dim_val.is_empty() {
                continue;
            }
            series_map
                .entry(dim_val)
                .or_default()
                .push(TimelinePoint { date, count });
        }

        let series = series_map
            .into_iter()
            .map(|(dim_val, points)| {
                let label = match query.dimension.as_str() {
                    "domain" => domain_root_label(&dim_val).to_string(),
                    "region" => region_code_to_name(&dim_val).to_string(),
                    "authority" => {
                        if let Ok(level) = dim_val.parse::<i32>() {
                            authority_level_label(level).to_string()
                        } else {
                            dim_val.clone()
                        }
                    }
                    _ => dim_val.clone(),
                };
                TimelineSeries {
                    dimension_value: dim_val,
                    label,
                    points,
                }
            })
            .collect();

        Ok(TimelineByDimension {
            dimension: query.dimension.clone(),
            granularity: granularity.to_string(),
            series,
        })
    }

    pub async fn overview(&self, tenant_id: Uuid) -> Result<StatisticsOverview> {
        let row: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
            r#"
            SELECT
                COUNT(*)::bigint AS total,
                COUNT(*) FILTER (WHERE region_code IS NOT NULL)::bigint AS with_region,
                COUNT(*) FILTER (WHERE domain_root IS NOT NULL)::bigint AS with_domain,
                COUNT(*) FILTER (WHERE importance IS NOT NULL)::bigint AS with_importance,
                COUNT(*) FILTER (WHERE authority_level IS NOT NULL)::bigint AS with_authority,
                COUNT(*) FILTER (WHERE issuer IS NOT NULL)::bigint AS with_issuer
            FROM articles
            WHERE tenant_id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        Ok(StatisticsOverview {
            total_articles: row.0,
            with_region: row.1,
            with_domain: row.2,
            with_importance: row.3,
            with_authority: row.4,
            with_issuer: row.5,
        })
    }

    /// Map a dimension name to its SQL column, with whitelist for safety.
    fn dimension_to_column(dimension: &str) -> Result<&'static str> {
        match dimension {
            "region" => Ok("region_code"),
            "domain" => Ok("domain_root"),
            "importance" => Ok("importance"),
            "authority" => Ok("authority_level"),
            "risk" => Ok("risk_score"),
            "sentiment" => Ok("sentiment"),
            "issuer" => Ok("issuer"),
            _ => Err(Error::Validation(format!(
                "Unknown dimension: {}. Allowed: region, domain, importance, authority, risk, sentiment, issuer",
                dimension
            ))),
        }
    }
}
