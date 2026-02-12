# Phase 2: 统计服务层设计 — StatisticsService + API Endpoints

> 后端统计聚合：从原始数据到结构化统计结果

---

## 1. StatisticsService 数据模型

### 1.1 新建文件: `crates/law-eye-core/src/statistics.rs`

```rust
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

/// 地域分布统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionalDistribution {
    pub items: Vec<RegionalCount>,
    pub total: i64,
    pub coverage_rate: f64, // 有 region_code 的文章占比
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionalCount {
    pub region_code: String,    // GB/T 2260 代码
    pub region_name: String,    // 省份名称
    pub count: i64,
    pub percentage: f64,
}

/// 行业/领域分布统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndustryDistribution {
    pub items: Vec<DomainCount>,
    pub total: i64,
    pub coverage_rate: f64, // 有 domain_root 的文章占比
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainCount {
    pub domain_root: String,
    pub domain_sub: Option<String>,
    pub label: String,          // 中文标签
    pub count: i64,
    pub percentage: f64,
    pub sub_domains: Option<Vec<SubDomainCount>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubDomainCount {
    pub domain_sub: String,
    pub label: String,
    pub count: i64,
}

/// 重要性分布统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportanceDistribution {
    pub levels: [i64; 5],       // index 0 = level 1, index 4 = level 5
    pub total: i64,
    pub average: f64,
    pub coverage_rate: f64,     // 有 importance 的文章占比
}

/// 权威等级分布统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorityDistribution {
    pub levels: Vec<AuthorityLevelCount>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorityLevelCount {
    pub level: i32,
    pub label: String,          // 等级名称
    pub count: i64,
    pub percentage: f64,
}

/// 发布机构统计
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

/// 交叉维度查询
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

/// 时序统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineByDimension {
    pub dimension: String,
    pub granularity: String,    // "daily" | "weekly" | "monthly"
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
```

### 1.2 查询参数

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct StatisticsQuery {
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub status: Option<String>,          // 筛选 published/all
    pub limit: Option<i64>,              // TOP N
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrossDimensionalQuery {
    pub dimension_x: String,  // "region" | "domain" | "importance" | "authority" | "risk" | "sentiment"
    pub dimension_y: String,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TimelineQuery {
    pub dimension: String,    // "region" | "domain" | "importance" | "authority"
    pub granularity: Option<String>, // "daily" | "weekly" | "monthly"
    pub days: Option<i32>,           // 默认 30
    pub top_n: Option<i32>,          // 只显示 TOP N 维度值
}
```

---

## 2. SQL 查询设计

### 2.1 地域分布

```sql
SELECT
    region_code,
    COUNT(*) as count
FROM articles
WHERE tenant_id = $1
    AND deleted_at IS NULL
    AND region_code IS NOT NULL
    AND ($2::date IS NULL OR created_at >= $2)
    AND ($3::date IS NULL OR created_at < $3)
GROUP BY region_code
ORDER BY count DESC;
```

### 2.2 行业分布 (含二级下钻)

```sql
-- 一级分布
SELECT
    domain_root,
    COUNT(*) as count
FROM articles
WHERE tenant_id = $1
    AND deleted_at IS NULL
    AND domain_root IS NOT NULL
GROUP BY domain_root
ORDER BY count DESC;

-- 二级下钻
SELECT
    domain_root,
    domain_sub,
    COUNT(*) as count
FROM articles
WHERE tenant_id = $1
    AND deleted_at IS NULL
    AND domain_root IS NOT NULL
    AND domain_sub IS NOT NULL
GROUP BY domain_root, domain_sub
ORDER BY domain_root, count DESC;
```

### 2.3 重要性分布

```sql
SELECT
    importance as level,
    COUNT(*) as count
FROM articles
WHERE tenant_id = $1
    AND deleted_at IS NULL
    AND importance IS NOT NULL
GROUP BY importance
ORDER BY importance;

-- 同时计算平均值
SELECT
    AVG(importance)::float8 as average,
    COUNT(*) FILTER (WHERE importance IS NOT NULL) as with_importance,
    COUNT(*) as total
FROM articles
WHERE tenant_id = $1 AND deleted_at IS NULL;
```

### 2.4 交叉维度 (通用模式)

```sql
-- 使用动态 SQL 或 QueryBuilder
SELECT
    {dim_x_column} as x_value,
    {dim_y_column} as y_value,
    COUNT(*) as count
FROM articles
WHERE tenant_id = $1
    AND deleted_at IS NULL
    AND {dim_x_column} IS NOT NULL
    AND {dim_y_column} IS NOT NULL
GROUP BY {dim_x_column}, {dim_y_column}
ORDER BY count DESC
LIMIT $2;
```

### 2.5 时序统计 (按维度分组)

```sql
-- 示例: 按 domain_root 分组的每日趋势
WITH date_series AS (
    SELECT generate_series(
        CURRENT_DATE - INTERVAL '30 days',
        CURRENT_DATE,
        '1 day'::interval
    )::date AS date
)
SELECT
    ds.date,
    a.domain_root as dimension_value,
    COUNT(a.id) as count
FROM date_series ds
LEFT JOIN articles a ON DATE(a.created_at) = ds.date
    AND a.tenant_id = $1
    AND a.deleted_at IS NULL
    AND a.domain_root IS NOT NULL
GROUP BY ds.date, a.domain_root
ORDER BY ds.date, count DESC;
```

---

## 3. API Endpoints 设计

### 3.1 路由结构

新建 `crates/law-eye-api/src/routes/statistics/` 模块：

```
routes/statistics/
├── mod.rs          // Router 定义
├── handlers.rs     // Handler 函数
└── dto.rs          // DTO 类型
```

### 3.2 端点列表

| Method | Path | 参数 | 返回类型 |
|--------|------|------|----------|
| GET | `/api/v1/statistics/regional` | date_from, date_to, status, limit | `RegionalDistributionResponse` |
| GET | `/api/v1/statistics/industry` | date_from, date_to, status, include_sub | `IndustryDistributionResponse` |
| GET | `/api/v1/statistics/importance` | date_from, date_to, status | `ImportanceDistributionResponse` |
| GET | `/api/v1/statistics/authority` | date_from, date_to, status | `AuthorityDistributionResponse` |
| GET | `/api/v1/statistics/issuer` | date_from, date_to, limit | `IssuerDistributionResponse` |
| GET | `/api/v1/statistics/cross` | dim_x, dim_y, date_from, date_to, limit | `CrossDimensionalResponse` |
| GET | `/api/v1/statistics/timeline` | dimension, granularity, days, top_n | `TimelineByDimensionResponse` |
| GET | `/api/v1/statistics/overview` | (无) | 所有维度的快照概要 |

### 3.3 DTO 示例

```rust
// dto.rs
#[derive(Serialize, Deserialize, ToSchema)]
pub struct RegionalDistributionResponse {
    pub items: Vec<RegionalCountDto>,
    pub total: i64,
    pub coverage_rate: f64,
}

#[derive(Serialize, Deserialize, ToSchema)]
pub struct RegionalCountDto {
    pub region_code: String,
    pub region_name: String,
    pub count: i64,
    pub percentage: f64,
}

// ... 其他 DTO 遵循相同模式
```

### 3.4 OpenAPI 注册

在 `openapi.rs` 中添加所有新端点的 path 和 schema 注册。

---

## 4. Region Code ↔ 省份名称映射

在 StatisticsService 中内置映射表 (复用 crawler 的 REGIONS 表):

```rust
pub const REGION_MAP: &[(&str, &str)] = &[
    ("110000", "北京"),
    ("120000", "天津"),
    ("130000", "河北"),
    ("140000", "山西"),
    ("150000", "内蒙古"),
    ("210000", "辽宁"),
    ("220000", "吉林"),
    ("230000", "黑龙江"),
    ("310000", "上海"),
    ("320000", "江苏"),
    ("330000", "浙江"),
    ("340000", "安徽"),
    ("350000", "福建"),
    ("360000", "江西"),
    ("370000", "山东"),
    ("410000", "河南"),
    ("420000", "湖北"),
    ("430000", "湖南"),
    ("440000", "广东"),
    ("450000", "广西"),
    ("460000", "海南"),
    ("500000", "重庆"),
    ("510000", "四川"),
    ("520000", "贵州"),
    ("530000", "云南"),
    ("540000", "西藏"),
    ("610000", "陕西"),
    ("620000", "甘肃"),
    ("630000", "青海"),
    ("640000", "宁夏"),
    ("650000", "新疆"),
    ("710000", "台湾"),
    ("810000", "香港"),
    ("820000", "澳门"),
];

pub fn region_code_to_name(code: &str) -> &str {
    REGION_MAP.iter()
        .find(|(c, _)| *c == code)
        .map(|(_, name)| *name)
        .unwrap_or("未知地区")
}
```

---

## 5. 权限和租户隔离

所有统计查询**必须**带 `tenant_id` 过滤：

```rust
impl StatisticsService {
    pub fn new(pool: PgPool) -> Self { Self { pool } }

    pub async fn regional_distribution(
        &self,
        tenant_id: Uuid,
        query: &StatisticsQuery
    ) -> Result<RegionalDistribution> {
        // tenant_id 作为第一个参数绑定
        // ...
    }
}
```

Handler 层从 auth context 中提取 tenant_id：

```rust
async fn get_regional_stats(
    State(state): State<AppState>,
    auth: AuthContext,            // 提供 tenant_id
    Query(params): Query<StatisticsQueryParams>,
) -> Result<Json<RegionalDistributionResponse>, ApiError> {
    let result = state.statistics_service
        .regional_distribution(auth.tenant_id, &params.into())
        .await?;
    Ok(Json(result.into()))
}
```
