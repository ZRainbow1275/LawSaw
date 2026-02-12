# 命题四：模板系统设计

> 文档编号: RPT-TMPL-006
> 版本: 1.0
> 更新日期: 2026-02-13
> 状态: 设计中

---

## 一、Tera 模板引擎集成方案

### 1.1 Tera 初始化与配置

```rust
// crates/law-eye-core/src/report/template_engine.rs

use std::sync::Arc;
use tera::{Tera, Context, Value, Function, Filter};
use chrono::{NaiveDate, Datelike};
use serde_json::json;

/// 报告模板引擎 — 基于 Tera (Jinja2 语法) 的安全沙箱渲染器
pub struct ReportTemplateEngine {
    tera: Arc<Tera>,
}

impl ReportTemplateEngine {
    /// 创建模板引擎实例
    ///
    /// 安全策略：
    /// - 不加载文件系统模板（防止路径穿越）
    /// - 所有模板通过 `add_raw_template` 从数据库加载
    /// - 禁用 Tera 的 `include` / `import` / `extends` 上下文
    pub fn new() -> Result<Self, tera::Error> {
        let mut tera = Tera::default();

        // ── 注册自定义过滤器 ──────────────────────────────
        tera.register_filter("date_cn", DateCnFilter);
        tera.register_filter("number_comma", NumberCommaFilter);
        tera.register_filter("percentage", PercentageFilter);
        tera.register_filter("domain_label", DomainLabelFilter);
        tera.register_filter("region_name", RegionNameFilter);
        tera.register_filter("authority_label", AuthorityLabelFilter);
        tera.register_filter("importance_stars", ImportanceStarsFilter);
        tera.register_filter("risk_color", RiskColorFilter);
        tera.register_filter("risk_level", RiskLevelFilter);
        tera.register_filter("truncate_cn", TruncateCnFilter);

        // ── 注册自定义函数 ──────────────────────────────
        tera.register_function("chart_placeholder", ChartPlaceholderFn);
        tera.register_function("risk_badge_color", RiskBadgeColorFn);
        tera.register_function("page_break", PageBreakFn);
        tera.register_function("current_year", CurrentYearFn);

        Ok(Self {
            tera: Arc::new(tera),
        })
    }

    /// 从数据库模板内容渲染 HTML
    ///
    /// # 安全
    /// - `template_body` 来自 `report_templates.body_template` 字段
    /// - 在 `add_raw_template` 之前进行 SSTI 扫描
    pub fn render(
        &self,
        template_name: &str,
        template_body: &str,
        context: &Context,
    ) -> Result<String, tera::Error> {
        // SSTI 防护：扫描危险指令
        Self::validate_template_safety(template_body)?;

        let mut tera = (*self.tera).clone();
        tera.add_raw_template(template_name, template_body)?;
        tera.render(template_name, context)
    }

    /// SSTI 安全校验 — 禁止危险的 Tera 指令
    fn validate_template_safety(body: &str) -> Result<(), tera::Error> {
        let forbidden_patterns = [
            "{% include",
            "{% import",
            "{% extends",
            "{% macro",          // 禁用宏定义防止复杂注入
            "__tera_context",    // 禁止访问内部上下文
        ];
        for pattern in &forbidden_patterns {
            if body.contains(pattern) {
                return Err(tera::Error::msg(format!(
                    "模板安全校验失败：禁止使用 `{}` 指令",
                    pattern
                )));
            }
        }
        Ok(())
    }
}
```

### 1.2 自定义过滤器

```rust
// ── 日期中文格式化 ──────────────────────────────────────
// 用法: {{ date_value | date_cn }}
// 输出: "2026年02月13日"
struct DateCnFilter;

impl Filter for DateCnFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let date_str = value.as_str().ok_or_else(|| {
            tera::Error::msg("date_cn 过滤器需要字符串输入")
        })?;
        // 尝试解析 YYYY-MM-DD 格式
        if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
            Ok(Value::String(
                format!("{}年{:02}月{:02}日", date.year(), date.month(), date.day())
            ))
        } else {
            Ok(value.clone())
        }
    }
}

// ── 数字千分位格式化 ────────────────────────────────────
// 用法: {{ 12345 | number_comma }}
// 输出: "12,345"
struct NumberCommaFilter;

impl Filter for NumberCommaFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let num = value.as_i64().or_else(|| value.as_f64().map(|f| f as i64))
            .ok_or_else(|| tera::Error::msg("number_comma 需要数字输入"))?;
        let formatted = format_number_with_comma(num);
        Ok(Value::String(formatted))
    }
}

fn format_number_with_comma(n: i64) -> String {
    let s = n.to_string();
    let bytes = s.as_bytes();
    let len = bytes.len();
    let mut result = String::with_capacity(len + len / 3);
    for (i, &b) in bytes.iter().enumerate() {
        if i > 0 && (len - i) % 3 == 0 && b != b'-' {
            result.push(',');
        }
        result.push(b as char);
    }
    result
}

// ── 百分比格式化 ────────────────────────────────────────
// 用法: {{ 0.156 | percentage }}
// 输出: "15.6%"
// 用法: {{ 0.156 | percentage(precision=0) }}
// 输出: "16%"
struct PercentageFilter;

impl Filter for PercentageFilter {
    fn filter(&self, value: &Value, args: &HashMap<String, Value>) -> tera::Result<Value> {
        let num = value.as_f64()
            .ok_or_else(|| tera::Error::msg("percentage 需要数字输入"))?;
        let precision = args.get("precision")
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as usize;
        let pct = num * 100.0;
        Ok(Value::String(format!("{:.prec$}%", pct, prec = precision)))
    }
}

// ── 法律领域中文映射 ───────────────────────────────────
// 用法: {{ "legislation" | domain_label }}
// 输出: "立法前沿"
struct DomainLabelFilter;

impl Filter for DomainLabelFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let key = value.as_str().unwrap_or("");
        let label = match key {
            "legislation" => "立法前沿",
            "regulation"  => "监管动向",
            "enforcement" => "执法案例",
            "industry"    => "业界资讯",
            "compliance"  => "合规前沿",
            "technology"  => "数据/安全/技术",
            "academic"    => "学术文章",
            "international" => "国际视野",
            other => other,
        };
        Ok(Value::String(label.to_string()))
    }
}

// ── 地区编码 → 中文名 ─────────────────────────────────
// 用法: {{ "110000" | region_name }}
// 输出: "北京"
struct RegionNameFilter;

impl Filter for RegionNameFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let code = value.as_str().unwrap_or("");
        let name = crate::statistics::region_code_to_name(code);
        Ok(Value::String(name.to_string()))
    }
}

// ── 权威等级中文标签 ───────────────────────────────────
// 用法: {{ 2 | authority_label }}
// 输出: "法律"
struct AuthorityLabelFilter;

impl Filter for AuthorityLabelFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let level = value.as_i64().unwrap_or(0) as i32;
        let label = match level {
            1  => "宪法",
            2  => "法律",
            3  => "行政法规",
            4  => "部门规章",
            5  => "地方性法规",
            6  => "地方政府规章",
            7  => "司法解释",
            8  => "规范性文件",
            9  => "行业标准",
            10 => "非正式",
            _  => "未知",
        };
        Ok(Value::String(label.to_string()))
    }
}

// ── 重要性星级 ─────────────────────────────────────────
// 用法: {{ 4 | importance_stars }}
// 输出: "★★★★☆"
struct ImportanceStarsFilter;

impl Filter for ImportanceStarsFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let level = value.as_i64().unwrap_or(0).clamp(0, 5) as usize;
        let stars = "★".repeat(level) + &"☆".repeat(5 - level);
        Ok(Value::String(stars))
    }
}

// ── 风险等级颜色映射 ───────────────────────────────────
// 用法: {{ 85 | risk_color }}
// 输出: "#c53030"
struct RiskColorFilter;

impl Filter for RiskColorFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let score = value.as_i64().unwrap_or(0);
        let color = match score {
            70..=100 => "#c53030",  // 高风险 — 红色
            40..=69  => "#c05621",  // 中风险 — 橙色
            1..=39   => "#2f855a",  // 低风险 — 绿色
            _        => "#718096",  // 未评估 — 灰色
        };
        Ok(Value::String(color.to_string()))
    }
}

// ── 风险等级文字 ───────────────────────────────────────
// 用法: {{ 85 | risk_level }}
// 输出: "高"
struct RiskLevelFilter;

impl Filter for RiskLevelFilter {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        let score = value.as_i64().unwrap_or(0);
        let level = match score {
            70..=100 => "高",
            40..=69  => "中",
            1..=39   => "低",
            _        => "未评估",
        };
        Ok(Value::String(level.to_string()))
    }
}

// ── 中文安全截断 ───────────────────────────────────────
// 用法: {{ long_text | truncate_cn(length=100) }}
struct TruncateCnFilter;

impl Filter for TruncateCnFilter {
    fn filter(&self, value: &Value, args: &HashMap<String, Value>) -> tera::Result<Value> {
        let text = value.as_str().unwrap_or("");
        let max_len = args.get("length")
            .and_then(|v| v.as_i64())
            .unwrap_or(200) as usize;
        if text.chars().count() <= max_len {
            Ok(value.clone())
        } else {
            let truncated: String = text.chars().take(max_len).collect();
            Ok(Value::String(format!("{}...", truncated)))
        }
    }
}
```

### 1.3 自定义函数

```rust
// ── 图表占位符 ─────────────────────────────────────────
// 用法: {{ chart_placeholder(id="regional_heatmap", width=800, height=500) }}
// 输出: <div class="chart-placeholder" data-chart-id="regional_heatmap" ...>
struct ChartPlaceholderFn;

impl Function for ChartPlaceholderFn {
    fn call(&self, args: &HashMap<String, Value>) -> tera::Result<Value> {
        let chart_id = args.get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| tera::Error::msg("chart_placeholder 需要 id 参数"))?;
        let width = args.get("width").and_then(|v| v.as_i64()).unwrap_or(760);
        let height = args.get("height").and_then(|v| v.as_i64()).unwrap_or(400);
        let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");

        let html = format!(
            r#"<div class="chart-container" data-chart-id="{id}" style="width:{w}px;height:{h}px;">
  <div class="chart-title">{title}</div>
  <div class="chart-content" id="chart-{id}">
    <!-- SVG 将在导出阶段由 ReportDataAggregator 注入 -->
  </div>
</div>"#,
            id = chart_id, w = width, h = height, title = title
        );
        Ok(Value::String(html))
    }
}

// ── 风险徽章颜色 ───────────────────────────────────────
// 用法: {{ risk_badge_color(score=85) }}
struct RiskBadgeColorFn;

impl Function for RiskBadgeColorFn {
    fn call(&self, args: &HashMap<String, Value>) -> tera::Result<Value> {
        let score = args.get("score").and_then(|v| v.as_i64()).unwrap_or(0);
        let (bg, fg) = match score {
            70..=100 => ("#fed7d7", "#c53030"),
            40..=69  => ("#feebc8", "#c05621"),
            1..=39   => ("#c6f6d5", "#2f855a"),
            _        => ("#e2e8f0", "#718096"),
        };
        Ok(Value::String(format!(
            "background:{};color:{};", bg, fg
        )))
    }
}

// ── 分页符 ─────────────────────────────────────────────
// 用法: {{ page_break() }}
struct PageBreakFn;

impl Function for PageBreakFn {
    fn call(&self, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        Ok(Value::String(
            r#"<div class="page-break" style="page-break-after:always;"></div>"#.to_string()
        ))
    }
}

// ── 当前年份 ───────────────────────────────────────────
// 用法: {{ current_year() }}
struct CurrentYearFn;

impl Function for CurrentYearFn {
    fn call(&self, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        Ok(Value::Number(chrono::Utc::now().year().into()))
    }
}
```

### 1.4 沙箱安全策略

| 威胁向量 | 缓解措施 | 实现方式 |
|:---------|:---------|:---------|
| **SSTI (服务端模板注入)** | 禁用 `include` / `import` / `extends` / `macro` | `validate_template_safety()` 正则扫描 |
| **路径穿越** | 不从文件系统加载模板 | 仅使用 `add_raw_template()` |
| **无限循环** | Tera 原生无 while 循环；`for` 循环受数据量限制 | 限制传入数据的数组长度 (max 500 items) |
| **内存爆炸** | 限制模板体积和渲染输出 | 模板 body 最大 512KB，输出最大 10MB |
| **信息泄露** | 禁止访问 `__tera_context` 内部变量 | 关键字黑名单 |
| **XSS 注入** | 用户输入内容默认 HTML 转义 | Tera 默认 autoescape 开启 |

---

## 二、模板变量映射表

### 2.1 全局变量

| 变量路径 | 数据源 | Rust 类型 | 说明 |
|:---------|:-------|:----------|:-----|
| `report.id` | `reports.id` | `Uuid` | 报告唯一标识 |
| `report.title` | `reports.title` | `String` | 报告标题 |
| `report.report_number` | `reports.report_number` | `String` | 编号，如 "LAW-WR-2026-W07" |
| `report.period_type` | `reports.period_type` | `String` | "weekly" / "monthly" / "quarterly" |
| `report.period_start` | `reports.period_start` | `NaiveDate` | 期间起始日 |
| `report.period_end` | `reports.period_end` | `NaiveDate` | 期间截止日 |
| `report.period` | 计算生成 | `String` | "2026.02.10 - 2026.02.16" |
| `report.status` | `reports.status` | `String` | 报告状态 |
| `report.version` | `reports.version` | `i64` | 版本号 |
| `report.created_at` | `reports.created_at` | `DateTime<Utc>` | 创建时间 |

### 2.2 组织与作者变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `org.name` | `tenants.name` | `String` | 租户/组织名称 |
| `org.slug` | `tenants.slug` | `String` | 租户标识 |
| `author.name` | `users.display_name` | `String` | 报告作者 |
| `author.email` | `users.email` | `String` | 作者邮箱 |
| `reviewer.name` | `users.display_name` | `Option<String>` | 审阅人 |

### 2.3 统计概览变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `stats.total_articles` | `StatisticsOverview.total_articles` | `i64` | 期间内总资讯数 |
| `stats.with_region` | `StatisticsOverview.with_region` | `i64` | 有地域标注的数量 |
| `stats.with_domain` | `StatisticsOverview.with_domain` | `i64` | 有领域分类的数量 |
| `stats.with_importance` | `StatisticsOverview.with_importance` | `i64` | 有重要性评分的数量 |
| `stats.with_authority` | `StatisticsOverview.with_authority` | `i64` | 有权威等级的数量 |
| `stats.with_issuer` | `StatisticsOverview.with_issuer` | `i64` | 有发布机构的数量 |

### 2.4 地域分布变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `regional.items` | `RegionalDistribution.items` | `Vec<RegionalCount>` | 地域统计列表 |
| `regional.items[].region_code` | `RegionalCount.region_code` | `String` | GB/T 2260 编码 |
| `regional.items[].region_name` | `RegionalCount.region_name` | `String` | 中文地区名 |
| `regional.items[].count` | `RegionalCount.count` | `i64` | 资讯数量 |
| `regional.items[].percentage` | `RegionalCount.percentage` | `f64` | 占比 (0.0-1.0) |
| `regional.total` | `RegionalDistribution.total` | `i64` | 有地域标注的总数 |
| `regional.coverage_rate` | `RegionalDistribution.coverage_rate` | `f64` | 覆盖率 |

### 2.5 行业分布变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `industry.items` | `IndustryDistribution.items` | `Vec<DomainCount>` | 行业分类列表 |
| `industry.items[].domain_root` | `DomainCount.domain_root` | `String` | 领域根标识 |
| `industry.items[].label` | `DomainCount.label` | `String` | 中文标签 |
| `industry.items[].count` | `DomainCount.count` | `i64` | 资讯数量 |
| `industry.items[].percentage` | `DomainCount.percentage` | `f64` | 占比 |
| `industry.items[].sub_domains` | `DomainCount.sub_domains` | `Option<Vec<SubDomainCount>>` | 二级分类 |
| `industry.total` | `IndustryDistribution.total` | `i64` | 有分类的总数 |

### 2.6 重要性分布变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `importance.levels` | `ImportanceDistribution.levels` | `[i64; 5]` | 各等级数量 (索引0=1星, 索引4=5星) |
| `importance.total` | `ImportanceDistribution.total` | `i64` | 有评分的总数 |
| `importance.average` | `ImportanceDistribution.average` | `f64` | 平均分 |
| `importance.coverage_rate` | `ImportanceDistribution.coverage_rate` | `f64` | 覆盖率 |

### 2.7 权威等级变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `authority.levels` | `AuthorityDistribution.levels` | `Vec<AuthorityLevelCount>` | 权威等级列表 |
| `authority.levels[].level` | `AuthorityLevelCount.level` | `i32` | 等级编号 (1-10) |
| `authority.levels[].label` | `AuthorityLevelCount.label` | `String` | 中文标签 |
| `authority.levels[].count` | `AuthorityLevelCount.count` | `i64` | 数量 |
| `authority.levels[].percentage` | `AuthorityLevelCount.percentage` | `f64` | 占比 |
| `authority.total` | `AuthorityDistribution.total` | `i64` | 有等级的总数 |

### 2.8 发布机构变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `issuers.items` | `IssuerDistribution.items` | `Vec<IssuerCount>` | 机构列表 (Top N) |
| `issuers.items[].issuer` | `IssuerCount.issuer` | `String` | 机构名称 |
| `issuers.items[].count` | `IssuerCount.count` | `i64` | 发布数量 |
| `issuers.items[].percentage` | `IssuerCount.percentage` | `f64` | 占比 |
| `issuers.total` | `IssuerDistribution.total` | `i64` | 总数 |
| `issuers.unique_issuers` | `IssuerDistribution.unique_issuers` | `i64` | 唯一机构数 |

### 2.9 资讯列表变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `articles.legislation` | 按 `domain_root` 过滤 | `Vec<ArticleSummary>` | 立法动态资讯 |
| `articles.regulation` | 按 `domain_root` 过滤 | `Vec<ArticleSummary>` | 监管动向资讯 |
| `articles.enforcement` | 按 `domain_root` 过滤 | `Vec<ArticleSummary>` | 执法案例资讯 |
| `articles.industry` | 按 `domain_root` 过滤 | `Vec<ArticleSummary>` | 行业动态资讯 |
| `articles.international` | 按 `domain_root` 过滤 | `Vec<ArticleSummary>` | 国际视野资讯 |
| `articles.high_risk` | `risk_score >= 70` | `Vec<ArticleSummary>` | 高风险资讯 |

每个 `ArticleSummary` 包含：

| 字段 | 类型 | 说明 |
|:-----|:-----|:-----|
| `id` | `Uuid` | 文章 ID |
| `title` | `String` | 标题 |
| `link` | `String` | 原文链接 |
| `summary` | `Option<String>` | AI 摘要 |
| `issuer` | `Option<String>` | 发布机构 |
| `published_at` | `Option<String>` | 发布日期 (YYYY-MM-DD) |
| `risk_score` | `Option<i32>` | 风险评分 (0-100) |
| `importance` | `Option<i32>` | 重要性 (1-5) |
| `authority_level` | `Option<i32>` | 权威等级 (1-10) |
| `domain_root` | `Option<String>` | 一级领域 |
| `region_code` | `Option<String>` | 地区编码 |
| `tags` | `Vec<String>` | 标签列表 |

### 2.10 AI 生成内容变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `ai.executive_summary` | AI 生成 (LlmGateway) | `String` | 执行摘要 (Markdown) |
| `ai.recommendations` | AI 生成 (LlmGateway) | `String` | 合规建议 (Markdown) |
| `ai.risk_analysis` | AI 生成 (LlmGateway) | `String` | 风险分析 (Markdown) |

### 2.11 样式配置变量

| 变量路径 | 数据源 | 类型 | 说明 |
|:---------|:-------|:-----|:-----|
| `style.paper_size` | `style_config.paper_size` | `String` | "A4" |
| `style.font_family` | `style_config.font_family` | `String` | "SimSun" |
| `style.header.text` | `style_config.header.text` | `String` | 页眉文字 |
| `style.header.classification` | `style_config.header.classification` | `String` | 密级标注 |
| `style.footer.text` | `style_config.footer.text` | `String` | 页脚文字 |
| `style.cover.bg_color` | `style_config.cover.bg_color` | `String` | 封面背景色 |

### 2.12 Context 构建器

```rust
// crates/law-eye-core/src/report/aggregator.rs

use tera::Context;

pub struct ReportContextBuilder {
    ctx: Context,
}

impl ReportContextBuilder {
    pub fn new() -> Self {
        Self { ctx: Context::new() }
    }

    /// 注入报告元数据
    pub fn with_report(mut self, report: &Report, tenant: &Tenant, author: &User) -> Self {
        self.ctx.insert("report", &serde_json::json!({
            "id": report.id,
            "title": report.title,
            "report_number": report.report_number,
            "period_type": report.period_type,
            "period_start": report.period_start.to_string(),
            "period_end": report.period_end.to_string(),
            "period": format!("{} - {}",
                report.period_start.format("%Y.%m.%d"),
                report.period_end.format("%Y.%m.%d"),
            ),
            "status": report.status,
            "version": report.version,
            "created_at": report.created_at.to_rfc3339(),
        }));
        self.ctx.insert("org", &serde_json::json!({
            "name": tenant.name,
            "slug": tenant.slug,
        }));
        self.ctx.insert("author", &serde_json::json!({
            "name": author.display_name.as_deref().unwrap_or(&author.email),
            "email": author.email,
        }));
        self
    }

    /// 注入统计数据
    pub fn with_statistics(
        mut self,
        overview: &StatisticsOverview,
        regional: &RegionalDistribution,
        industry: &IndustryDistribution,
        importance: &ImportanceDistribution,
        authority: &AuthorityDistribution,
        issuers: &IssuerDistribution,
    ) -> Self {
        self.ctx.insert("stats", overview);
        self.ctx.insert("regional", regional);
        self.ctx.insert("industry", industry);
        self.ctx.insert("importance", importance);
        self.ctx.insert("authority", authority);
        self.ctx.insert("issuers", issuers);
        self
    }

    /// 注入资讯列表 (按领域分组)
    pub fn with_articles(
        mut self,
        articles_by_domain: &HashMap<String, Vec<ArticleSummary>>,
        high_risk: &[ArticleSummary],
    ) -> Self {
        self.ctx.insert("articles", articles_by_domain);
        self.ctx.insert("high_risk_articles", high_risk);
        self
    }

    /// 注入 AI 生成内容
    pub fn with_ai_content(
        mut self,
        executive_summary: &str,
        recommendations: &str,
        risk_analysis: &str,
    ) -> Self {
        self.ctx.insert("ai", &serde_json::json!({
            "executive_summary": executive_summary,
            "recommendations": recommendations,
            "risk_analysis": risk_analysis,
        }));
        self
    }

    /// 注入样式配置
    pub fn with_style(mut self, style_config: &serde_json::Value) -> Self {
        self.ctx.insert("style", style_config);
        self
    }

    pub fn build(self) -> Context {
        self.ctx
    }
}
```

---

## 三、法律合规周报 HTML 模板

### 3.1 完整 Tera HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ report.title }}</title>
  <style>
    {# ── 基础重置与变量 ── #}
    :root {
      --color-primary: {{ style.cover.bg_color | default(value="#1a365d") }};
      --color-primary-light: #2c5282;
      --color-accent: #3182ce;
      --color-text: #1a202c;
      --color-text-secondary: #4a5568;
      --color-text-muted: #718096;
      --color-border: #e2e8f0;
      --color-bg-light: #f7fafc;
      --color-bg-highlight: #fffbeb;
      --color-risk-high: #c53030;
      --color-risk-high-bg: #fed7d7;
      --color-risk-medium: #c05621;
      --color-risk-medium-bg: #feebc8;
      --color-risk-low: #2f855a;
      --color-risk-low-bg: #c6f6d5;
      --font-serif: "SimSun", "Songti SC", "Noto Serif CJK SC", serif;
      --font-sans: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
      --font-mono: "Consolas", "Source Code Pro", monospace;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-sans);
      font-size: 12pt;
      line-height: 1.8;
      color: var(--color-text);
      background: #fff;
    }

    {# ── 封面页 ── #}
    .cover {
      width: 100%;
      height: 100vh;
      min-height: 297mm;
      background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      page-break-after: always;
      position: relative;
    }
    .cover-classification {
      position: absolute;
      top: 20mm;
      right: 25mm;
      font-size: 14pt;
      font-weight: bold;
      color: #fed7d7;
      border: 2px solid #fed7d7;
      padding: 4px 16px;
      letter-spacing: 2px;
    }
    .cover-logo {
      font-size: 16pt;
      letter-spacing: 4px;
      opacity: 0.9;
      margin-bottom: 40px;
    }
    .cover-title {
      font-size: 32pt;
      font-weight: bold;
      letter-spacing: 3px;
      margin-bottom: 16px;
      font-family: var(--font-serif);
    }
    .cover-subtitle {
      font-size: 16pt;
      opacity: 0.9;
      margin-bottom: 60px;
    }
    .cover-meta {
      font-size: 12pt;
      opacity: 0.8;
      line-height: 2;
    }
    .cover-footer {
      position: absolute;
      bottom: 25mm;
      font-size: 10pt;
      opacity: 0.6;
    }

    {# ── 目录页 ── #}
    .toc {
      padding: 25mm 25mm 25mm 30mm;
      page-break-after: always;
    }
    .toc h2 {
      font-size: 18pt;
      font-family: var(--font-serif);
      margin-bottom: 24px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--color-primary);
    }
    .toc-list {
      list-style: none;
    }
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 8px 0;
      border-bottom: 1px dotted var(--color-border);
      font-size: 12pt;
    }
    .toc-item-title {
      font-weight: 500;
    }
    .toc-item-num {
      flex-shrink: 0;
      margin-left: 8px;
      color: var(--color-text-muted);
    }

    {# ── 正文通用 ── #}
    .page {
      padding: 25mm 25mm 25mm 30mm;
    }
    .section {
      margin-bottom: 32px;
    }
    h1 {
      font-size: 18pt;
      font-family: var(--font-serif);
      color: var(--color-primary);
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--color-primary);
      page-break-after: avoid;
    }
    h2 {
      font-size: 16pt;
      font-family: var(--font-serif);
      color: var(--color-primary-light);
      margin: 24px 0 12px 0;
      page-break-after: avoid;
    }
    h3 {
      font-size: 14pt;
      color: var(--color-text);
      margin: 16px 0 8px 0;
      page-break-after: avoid;
    }
    p {
      margin-bottom: 12px;
      text-align: justify;
      text-indent: 2em;
    }
    p.no-indent {
      text-indent: 0;
    }

    {# ── 资讯卡片 ── #}
    .article-card {
      background: var(--color-bg-light);
      border-left: 4px solid var(--color-accent);
      border-radius: 0 4px 4px 0;
      padding: 16px 20px;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .article-card-title {
      font-size: 13pt;
      font-weight: 600;
      color: var(--color-primary);
      margin-bottom: 8px;
      text-decoration: none;
      display: block;
      text-indent: 0;
    }
    .article-card-meta {
      font-size: 9pt;
      color: var(--color-text-muted);
      margin-bottom: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .article-card-summary {
      font-size: 11pt;
      color: var(--color-text-secondary);
      text-indent: 0;
      line-height: 1.6;
    }
    .badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 3px;
      font-size: 9pt;
      font-weight: 500;
    }
    .badge-risk-high   { background: var(--color-risk-high-bg);   color: var(--color-risk-high);   }
    .badge-risk-medium { background: var(--color-risk-medium-bg); color: var(--color-risk-medium); }
    .badge-risk-low    { background: var(--color-risk-low-bg);    color: var(--color-risk-low);    }
    .badge-importance  { background: #ebf4ff; color: #2b6cb0; }
    .badge-authority   { background: #f0fff4; color: #276749; }

    {# ── 表格 ── #}
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 11pt;
      page-break-inside: avoid;
    }
    thead th {
      background: var(--color-primary);
      color: #fff;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 10pt;
    }
    tbody td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--color-border);
    }
    tbody tr:nth-child(even) {
      background: var(--color-bg-light);
    }

    {# ── 统计概览 ── #}
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin: 16px 0;
    }
    .stat-card {
      background: var(--color-bg-light);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      border: 1px solid var(--color-border);
    }
    .stat-number {
      font-size: 28pt;
      font-weight: bold;
      color: var(--color-primary);
      line-height: 1.2;
    }
    .stat-label {
      font-size: 10pt;
      color: var(--color-text-muted);
      margin-top: 4px;
    }

    {# ── 图表容器 ── #}
    .chart-container {
      margin: 20px 0;
      text-align: center;
      page-break-inside: avoid;
    }
    .chart-title {
      font-size: 12pt;
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: 12px;
    }
    .chart-content {
      display: flex;
      justify-content: center;
    }
    .chart-content svg {
      max-width: 100%;
      height: auto;
    }

    {# ── 风险预警 ── #}
    .risk-alert {
      border: 2px solid var(--color-risk-high);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 16px;
      background: #fff5f5;
      page-break-inside: avoid;
    }
    .risk-alert-header {
      font-size: 13pt;
      font-weight: bold;
      color: var(--color-risk-high);
      margin-bottom: 8px;
    }

    {# ── 合规日历 ── #}
    .calendar-item {
      display: flex;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--color-border);
      page-break-inside: avoid;
    }
    .calendar-date {
      flex-shrink: 0;
      width: 80px;
      text-align: center;
      background: var(--color-primary);
      color: #fff;
      border-radius: 4px;
      padding: 8px;
      font-size: 10pt;
      font-weight: bold;
      line-height: 1.3;
    }
    .calendar-content {
      flex: 1;
    }

    {# ── 免责声明 ── #}
    .disclaimer {
      margin-top: 40px;
      padding: 20px;
      background: var(--color-bg-light);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-size: 9pt;
      color: var(--color-text-muted);
      line-height: 1.6;
    }
    .disclaimer p {
      text-indent: 0;
      margin-bottom: 4px;
    }

    {# ── 分页控制 ── #}
    .page-break {
      page-break-after: always;
      height: 0;
      overflow: hidden;
    }

    {# ── 打印优化 ── #}
    @media print {
      body { background: #fff; }
      .cover { min-height: auto; height: auto; padding: 60mm 25mm; }
      .page { padding: 0; }
      .no-print { display: none !important; }
      a { color: var(--color-text) !important; text-decoration: none !important; }
      .article-card { break-inside: avoid; }
      .risk-alert { break-inside: avoid; }
      table { break-inside: avoid; }
    }
  </style>
</head>
<body>

{# ═══════════════════════════════════════════════════════════ #}
{# 1. 封面页                                                   #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="cover">
  {% if style.header.classification %}
  <div class="cover-classification">{{ style.header.classification }}</div>
  {% endif %}
  <div class="cover-logo">{{ org.name | default(value="LawSaw") }}</div>
  <div class="cover-title">{{ report.title }}</div>
  <div class="cover-subtitle">{{ report.period }}</div>
  <div class="cover-meta">
    <div>报告编号：{{ report.report_number }}</div>
    <div>编制日期：{{ report.created_at | date_cn }}</div>
    <div>编制人员：{{ author.name }}</div>
    {% if reviewer and reviewer.name %}
    <div>审阅人员：{{ reviewer.name }}</div>
    {% endif %}
  </div>
  <div class="cover-footer">{{ style.footer.text | default(value="仅供内部参考") }}</div>
</div>

{# ═══════════════════════════════════════════════════════════ #}
{# 2. 目录                                                     #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="toc">
  <h2>目 录</h2>
  <ol class="toc-list">
    <li class="toc-item">
      <span class="toc-item-title">一、执行摘要</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">二、立法动态</span>
      <span class="toc-item-num">{{ articles.legislation | default(value=[]) | length }} 篇</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">三、监管动向</span>
      <span class="toc-item-num">{{ articles.regulation | default(value=[]) | length }} 篇</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">四、执法案例</span>
      <span class="toc-item-num">{{ articles.enforcement | default(value=[]) | length }} 篇</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">五、行业动态</span>
      <span class="toc-item-num">{{ articles.industry | default(value=[]) | length }} 篇</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">六、数据统计与分析</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">七、风险预警</span>
      <span class="toc-item-num">{{ high_risk_articles | default(value=[]) | length }} 项</span>
    </li>
    <li class="toc-item">
      <span class="toc-item-title">八、合规日历</span>
    </li>
    {% if articles.international and articles.international | length > 0 %}
    <li class="toc-item">
      <span class="toc-item-title">九、国际视野</span>
      <span class="toc-item-num">{{ articles.international | length }} 篇</span>
    </li>
    {% endif %}
    <li class="toc-item">
      <span class="toc-item-title">附：免责声明</span>
    </li>
  </ol>
</div>

{# ═══════════════════════════════════════════════════════════ #}
{# 3. 执行摘要                                                 #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>一、执行摘要</h1>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">{{ stats.total_articles | number_comma }}</div>
        <div class="stat-label">本期资讯总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ high_risk_articles | default(value=[]) | length }}</div>
        <div class="stat-label">高风险预警</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ issuers.unique_issuers | default(value=0) }}</div>
        <div class="stat-label">涉及监管机构</div>
      </div>
    </div>

    <div>{{ ai.executive_summary | safe }}</div>
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 4. 立法动态                                                 #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>二、立法动态</h1>
    {% if articles.legislation and articles.legislation | length > 0 %}
    <p class="no-indent">本期共收录立法相关资讯 <strong>{{ articles.legislation | length }}</strong> 篇。</p>

    {% for article in articles.legislation %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.importance %}
        <span class="badge badge-importance">{{ article.importance | importance_stars }}</span>
        {% endif %}
        {% if article.authority_level %}
        <span class="badge badge-authority">{{ article.authority_level | authority_label }}</span>
        {% endif %}
        {% if article.risk_score and article.risk_score >= 70 %}
        <span class="badge badge-risk-high">风险: {{ article.risk_score }}</span>
        {% elif article.risk_score and article.risk_score >= 40 %}
        <span class="badge badge-risk-medium">风险: {{ article.risk_score }}</span>
        {% elif article.risk_score and article.risk_score > 0 %}
        <span class="badge badge-risk-low">风险: {{ article.risk_score }}</span>
        {% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=300) }}</div>
      {% endif %}
    </div>
    {% endfor %}

    {% else %}
    <p>本期暂无立法动态资讯。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 5. 监管动向                                                 #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>三、监管动向</h1>
    {% if articles.regulation and articles.regulation | length > 0 %}
    <p class="no-indent">本期共收录监管相关资讯 <strong>{{ articles.regulation | length }}</strong> 篇。</p>

    {% for article in articles.regulation %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.importance %}
        <span class="badge badge-importance">{{ article.importance | importance_stars }}</span>
        {% endif %}
        {% if article.risk_score and article.risk_score >= 70 %}
        <span class="badge badge-risk-high">风险: {{ article.risk_score }}</span>
        {% elif article.risk_score and article.risk_score >= 40 %}
        <span class="badge badge-risk-medium">风险: {{ article.risk_score }}</span>
        {% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=300) }}</div>
      {% endif %}
    </div>
    {% endfor %}

    {% else %}
    <p>本期暂无监管动向资讯。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 6. 执法案例                                                 #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>四、执法案例</h1>
    {% if articles.enforcement and articles.enforcement | length > 0 %}
    <p class="no-indent">本期共收录执法案例 <strong>{{ articles.enforcement | length }}</strong> 篇。</p>

    {% for article in articles.enforcement %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.risk_score and article.risk_score >= 40 %}
        <span class="badge badge-risk-{{ article.risk_score | risk_level }}">
          风险: {{ article.risk_score | risk_level }}
        </span>
        {% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=300) }}</div>
      {% endif %}
    </div>
    {% endfor %}

    {% else %}
    <p>本期暂无执法案例资讯。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 7. 行业动态                                                 #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>五、行业动态</h1>
    {% if articles.industry and articles.industry | length > 0 %}
    <p class="no-indent">本期共收录行业动态 <strong>{{ articles.industry | length }}</strong> 篇。</p>

    {% for article in articles.industry %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.importance %}
        <span class="badge badge-importance">{{ article.importance | importance_stars }}</span>
        {% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=200) }}</div>
      {% endif %}
    </div>
    {% endfor %}

    {% else %}
    <p>本期暂无行业动态资讯。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 8. 数据统计与分析                                           #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>六、数据统计与分析</h1>

    {# 8.1 行业分布 #}
    <h2>6.1 行业分布</h2>
    {{ chart_placeholder(id="industry_distribution", width=700, height=400, title="法律领域分布") }}

    {% if industry.items and industry.items | length > 0 %}
    <table>
      <thead>
        <tr>
          <th>法律领域</th>
          <th>资讯数量</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>
        {% for item in industry.items %}
        <tr>
          <td>{{ item.label }}</td>
          <td>{{ item.count | number_comma }}</td>
          <td>{{ item.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% endif %}

    {# 8.2 地域分布 #}
    <h2>6.2 地域分布</h2>
    {{ chart_placeholder(id="regional_heatmap", width=700, height=500, title="地域分布热力图") }}

    {% if regional.items and regional.items | length > 0 %}
    <table>
      <thead>
        <tr>
          <th>地区</th>
          <th>资讯数量</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>
        {% for item in regional.items | slice(end=10) %}
        <tr>
          <td>{{ item.region_name }}</td>
          <td>{{ item.count | number_comma }}</td>
          <td>{{ item.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    <p class="no-indent" style="font-size:9pt;color:var(--color-text-muted);">
      * 地域覆盖率：{{ regional.coverage_rate | percentage }}
    </p>
    {% endif %}

    {# 8.3 重要性分布 #}
    <h2>6.3 重要性分布</h2>
    {{ chart_placeholder(id="importance_distribution", width=700, height=350, title="重要性等级分布") }}

    <table>
      <thead>
        <tr>
          <th>重要性等级</th>
          <th>数量</th>
        </tr>
      </thead>
      <tbody>
        {% for i in range(end=5) %}
        <tr>
          <td>{{ i + 1 | importance_stars }}</td>
          <td>{{ importance.levels[i] | default(value=0) | number_comma }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    <p class="no-indent" style="font-size:9pt;color:var(--color-text-muted);">
      * 平均重要性评分：{{ importance.average | round(precision=1) }}
      | 覆盖率：{{ importance.coverage_rate | percentage }}
    </p>

    {# 8.4 权威等级分布 #}
    <h2>6.4 权威等级分布</h2>
    {{ chart_placeholder(id="authority_distribution", width=700, height=350, title="法律权威等级分布") }}

    {% if authority.levels and authority.levels | length > 0 %}
    <table>
      <thead>
        <tr>
          <th>权威等级</th>
          <th>数量</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>
        {% for lvl in authority.levels %}
        <tr>
          <td>{{ lvl.label }}</td>
          <td>{{ lvl.count | number_comma }}</td>
          <td>{{ lvl.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% endif %}

    {# 8.5 发布机构 TOP 10 #}
    <h2>6.5 主要发布机构</h2>
    {% if issuers.items and issuers.items | length > 0 %}
    <table>
      <thead>
        <tr>
          <th>发布机构</th>
          <th>发布数量</th>
          <th>占比</th>
        </tr>
      </thead>
      <tbody>
        {% for item in issuers.items | slice(end=10) %}
        <tr>
          <td>{{ item.issuer }}</td>
          <td>{{ item.count | number_comma }}</td>
          <td>{{ item.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    <p class="no-indent" style="font-size:9pt;color:var(--color-text-muted);">
      * 共涉及 {{ issuers.unique_issuers }} 个发布机构
    </p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 9. 风险预警                                                 #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>七、风险预警</h1>

    {% if high_risk_articles and high_risk_articles | length > 0 %}
    <p class="no-indent">本期共识别 <strong>{{ high_risk_articles | length }}</strong> 项高风险事项（风险评分 >= 70），请重点关注：</p>

    {% for article in high_risk_articles %}
    <div class="risk-alert">
      <div class="risk-alert-header">
        [风险评分: {{ article.risk_score }}] {{ article.title }}
      </div>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.domain_root %}
        <span>{{ article.domain_root | domain_label }}</span>
        {% endif %}
      </div>
      {% if article.summary %}
      <p class="no-indent" style="margin-top:8px;font-size:11pt;">{{ article.summary }}</p>
      {% endif %}
    </div>
    {% endfor %}

    {% else %}
    <p>本期未发现高风险预警事项。</p>
    {% endif %}

    {# AI 风险分析 #}
    {% if ai.risk_analysis %}
    <h2>风险分析与建议</h2>
    <div>{{ ai.risk_analysis | safe }}</div>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══════════════════════════════════════════════════════════ #}
{# 10. 合规日历                                                #}
{# ═══════════════════════════════════════════════════════════ #}
<div class="page">
  <div class="section">
    <h1>八、合规日历</h1>
    <p class="no-indent">以下为近期需关注的合规时间节点：</p>

    {% if calendar_items and calendar_items | length > 0 %}
    {% for item in calendar_items %}
    <div class="calendar-item">
      <div class="calendar-date">
        {{ item.date | date_cn }}
      </div>
      <div class="calendar-content">
        <strong>{{ item.title }}</strong>
        {% if item.description %}
        <p class="no-indent" style="font-size:11pt;color:var(--color-text-secondary);margin-top:4px;">
          {{ item.description }}
        </p>
        {% endif %}
      </div>
    </div>
    {% endfor %}
    {% else %}
    <p>近期暂无重要合规时间节点。</p>
    {% endif %}
  </div>
</div>

{# ═══════════════════════════════════════════════════════════ #}
{# 11. 国际视野 (条件渲染)                                     #}
{# ═══════════════════════════════════════════════════════════ #}
{% if articles.international and articles.international | length > 0 %}
{{ page_break() }}
<div class="page">
  <div class="section">
    <h1>九、国际视野</h1>
    <p class="no-indent">本期共收录国际法律资讯 <strong>{{ articles.international | length }}</strong> 篇。</p>

    {% for article in articles.international %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=200) }}</div>
      {% endif %}
    </div>
    {% endfor %}
  </div>
</div>
{% endif %}

{# ═══════════════════════════════════════════════════════════ #}
{# 12. 免责声明                                                #}
{# ═══════════════════════════════════════════════════════════ #}
{{ page_break() }}
<div class="page">
  <div class="disclaimer">
    <h3 style="margin-bottom:12px;font-size:12pt;color:var(--color-text);">免责声明</h3>
    <p>1. 本报告所载信息仅供参考，不构成任何法律意见或法律服务。</p>
    <p>2. 本报告中的资讯内容来源于公开渠道，我们已尽合理努力确保信息的准确性，但不对其完整性、准确性或时效性作任何保证。</p>
    <p>3. 阅读者不应仅依赖本报告中的信息做出法律决策。如需法律建议，请咨询具有执业资格的专业律师。</p>
    <p>4. 本报告中的风险评分和重要性评级由人工智能模型生成，仅作为参考指标，不代表最终法律判断。</p>
    <p>5. 未经书面授权，禁止以任何形式复制、转发或公开本报告的全部或部分内容。</p>
    <p style="margin-top:16px;text-align:right;">
      {{ org.name | default(value="LawSaw") }} | {{ report.created_at | date_cn }}
    </p>
  </div>
</div>

</body>
</html>
```

---

## 四、法律合规月报 HTML 模板

月报相比周报增加了以下章节：
- 本月概览（统计面板更详细）
- 趋势分析（含时间线图表）
- 地域分布分析（专题章节）
- 行业分布分析（专题章节）
- 合规建议（AI 深度分析）
- 附录

### 4.1 完整 Tera HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ report.title }}</title>
  <style>
    {# 复用周报基础样式 + 月报增量样式 #}
    :root {
      --color-primary: {{ style.cover.bg_color | default(value="#1a365d") }};
      --color-primary-light: #2c5282;
      --color-accent: #3182ce;
      --color-text: #1a202c;
      --color-text-secondary: #4a5568;
      --color-text-muted: #718096;
      --color-border: #e2e8f0;
      --color-bg-light: #f7fafc;
      --color-risk-high: #c53030;
      --color-risk-high-bg: #fed7d7;
      --color-risk-medium: #c05621;
      --color-risk-medium-bg: #feebc8;
      --color-risk-low: #2f855a;
      --color-risk-low-bg: #c6f6d5;
      --font-serif: "SimSun", "Songti SC", "Noto Serif CJK SC", serif;
      --font-sans: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--font-sans);
      font-size: 12pt;
      line-height: 1.8;
      color: var(--color-text);
      background: #fff;
    }

    {# 封面 - 月报使用更庄重的设计 #}
    .cover {
      width: 100%;
      min-height: 297mm;
      background: linear-gradient(160deg, #0c2340 0%, var(--color-primary) 40%, var(--color-primary-light) 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      page-break-after: always;
      position: relative;
    }
    .cover-classification {
      position: absolute;
      top: 20mm;
      right: 25mm;
      font-size: 14pt;
      font-weight: bold;
      color: #fbd38d;
      border: 2px solid #fbd38d;
      padding: 4px 16px;
      letter-spacing: 2px;
    }
    .cover-logo { font-size: 16pt; letter-spacing: 6px; opacity: 0.8; margin-bottom: 48px; }
    .cover-title { font-size: 36pt; font-weight: bold; letter-spacing: 4px; margin-bottom: 12px; font-family: var(--font-serif); }
    .cover-subtitle { font-size: 18pt; opacity: 0.9; margin-bottom: 8px; }
    .cover-period { font-size: 14pt; opacity: 0.7; margin-bottom: 60px; }
    .cover-meta { font-size: 12pt; opacity: 0.8; line-height: 2.2; }
    .cover-footer { position: absolute; bottom: 25mm; font-size: 10pt; opacity: 0.5; }

    .toc { padding: 25mm 25mm 25mm 30mm; page-break-after: always; }
    .toc h2 { font-size: 18pt; font-family: var(--font-serif); margin-bottom: 24px; padding-bottom: 8px; border-bottom: 2px solid var(--color-primary); }
    .toc-list { list-style: none; }
    .toc-item { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px dotted var(--color-border); font-size: 12pt; }
    .toc-item-title { font-weight: 500; }
    .toc-item.sub { padding-left: 24px; font-size: 11pt; color: var(--color-text-secondary); }

    .page { padding: 25mm 25mm 25mm 30mm; }
    .section { margin-bottom: 32px; }
    h1 { font-size: 18pt; font-family: var(--font-serif); color: var(--color-primary); margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--color-primary); page-break-after: avoid; }
    h2 { font-size: 16pt; font-family: var(--font-serif); color: var(--color-primary-light); margin: 24px 0 12px 0; page-break-after: avoid; }
    h3 { font-size: 14pt; color: var(--color-text); margin: 16px 0 8px 0; page-break-after: avoid; }
    p { margin-bottom: 12px; text-align: justify; text-indent: 2em; }
    p.no-indent { text-indent: 0; }

    .article-card { background: var(--color-bg-light); border-left: 4px solid var(--color-accent); border-radius: 0 4px 4px 0; padding: 16px 20px; margin-bottom: 16px; page-break-inside: avoid; }
    .article-card-title { font-size: 13pt; font-weight: 600; color: var(--color-primary); margin-bottom: 8px; text-decoration: none; display: block; text-indent: 0; }
    .article-card-meta { font-size: 9pt; color: var(--color-text-muted); margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 12px; }
    .article-card-summary { font-size: 11pt; color: var(--color-text-secondary); text-indent: 0; line-height: 1.6; }

    .badge { display: inline-block; padding: 1px 8px; border-radius: 3px; font-size: 9pt; font-weight: 500; }
    .badge-risk-high   { background: var(--color-risk-high-bg);   color: var(--color-risk-high);   }
    .badge-risk-medium { background: var(--color-risk-medium-bg); color: var(--color-risk-medium); }
    .badge-risk-low    { background: var(--color-risk-low-bg);    color: var(--color-risk-low);    }
    .badge-importance  { background: #ebf4ff; color: #2b6cb0; }

    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11pt; page-break-inside: avoid; }
    thead th { background: var(--color-primary); color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 10pt; }
    tbody td { padding: 8px 12px; border-bottom: 1px solid var(--color-border); }
    tbody tr:nth-child(even) { background: var(--color-bg-light); }

    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0; }
    .stats-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
    .stat-card { background: var(--color-bg-light); border-radius: 8px; padding: 20px; text-align: center; border: 1px solid var(--color-border); }
    .stat-number { font-size: 28pt; font-weight: bold; color: var(--color-primary); line-height: 1.2; }
    .stat-number-sm { font-size: 22pt; font-weight: bold; color: var(--color-primary); line-height: 1.2; }
    .stat-label { font-size: 10pt; color: var(--color-text-muted); margin-top: 4px; }

    .chart-container { margin: 20px 0; text-align: center; page-break-inside: avoid; }
    .chart-title { font-size: 12pt; font-weight: 600; color: var(--color-text); margin-bottom: 12px; }
    .chart-content { display: flex; justify-content: center; }
    .chart-content svg { max-width: 100%; height: auto; }

    .risk-alert { border: 2px solid var(--color-risk-high); border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; background: #fff5f5; page-break-inside: avoid; }
    .risk-alert-header { font-size: 13pt; font-weight: bold; color: var(--color-risk-high); margin-bottom: 8px; }

    .calendar-item { display: flex; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--color-border); page-break-inside: avoid; }
    .calendar-date { flex-shrink: 0; width: 80px; text-align: center; background: var(--color-primary); color: #fff; border-radius: 4px; padding: 8px; font-size: 10pt; font-weight: bold; }
    .calendar-content { flex: 1; }

    .disclaimer { margin-top: 40px; padding: 20px; background: var(--color-bg-light); border: 1px solid var(--color-border); border-radius: 4px; font-size: 9pt; color: var(--color-text-muted); line-height: 1.6; }
    .disclaimer p { text-indent: 0; margin-bottom: 4px; }

    {# 月报特有: 趋势对比样式 #}
    .trend-indicator { font-weight: bold; }
    .trend-up   { color: var(--color-risk-high); }
    .trend-down { color: var(--color-risk-low); }
    .trend-flat { color: var(--color-text-muted); }

    .insight-box {
      background: linear-gradient(135deg, #ebf8ff 0%, #e6fffa 100%);
      border-left: 4px solid #3182ce;
      padding: 16px 20px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
      page-break-inside: avoid;
    }
    .insight-box h4 {
      font-size: 12pt;
      color: var(--color-primary);
      margin-bottom: 8px;
    }

    .page-break { page-break-after: always; height: 0; overflow: hidden; }

    @media print {
      body { background: #fff; }
      .cover { min-height: auto; height: auto; padding: 60mm 25mm; }
      .page { padding: 0; }
      a { color: var(--color-text) !important; text-decoration: none !important; }
      .article-card, .risk-alert, table { break-inside: avoid; }
    }
  </style>
</head>
<body>

{# ═══ 1. 封面 ═══ #}
<div class="cover">
  {% if style.header.classification %}
  <div class="cover-classification">{{ style.header.classification }}</div>
  {% endif %}
  <div class="cover-logo">{{ org.name | default(value="LawSaw") }}</div>
  <div class="cover-title">{{ report.title }}</div>
  <div class="cover-subtitle">月度合规报告</div>
  <div class="cover-period">{{ report.period }}</div>
  <div class="cover-meta">
    <div>报告编号：{{ report.report_number }}</div>
    <div>编制日期：{{ report.created_at | date_cn }}</div>
    <div>编制人员：{{ author.name }}</div>
    {% if reviewer and reviewer.name %}
    <div>审阅人员：{{ reviewer.name }}</div>
    {% endif %}
    <div>报告级别：{{ style.header.classification | default(value="内部资料") }}</div>
  </div>
  <div class="cover-footer">{{ style.footer.text | default(value="内部机密 - 未经授权禁止传播") }}</div>
</div>

{# ═══ 2. 目录 ═══ #}
<div class="toc">
  <h2>目 录</h2>
  <ol class="toc-list">
    <li class="toc-item"><span class="toc-item-title">一、执行摘要</span></li>
    <li class="toc-item"><span class="toc-item-title">二、本月概览</span></li>
    <li class="toc-item"><span class="toc-item-title">三、重点立法动态</span></li>
    <li class="toc-item"><span class="toc-item-title">四、重要监管动向</span></li>
    <li class="toc-item"><span class="toc-item-title">五、典型执法案例</span></li>
    <li class="toc-item"><span class="toc-item-title">六、趋势分析</span></li>
    <li class="toc-item sub"><span class="toc-item-title">6.1 领域趋势</span></li>
    <li class="toc-item sub"><span class="toc-item-title">6.2 重要性趋势</span></li>
    <li class="toc-item"><span class="toc-item-title">七、地域分布分析</span></li>
    <li class="toc-item"><span class="toc-item-title">八、行业分布分析</span></li>
    <li class="toc-item"><span class="toc-item-title">九、风险评估与预警</span></li>
    <li class="toc-item"><span class="toc-item-title">十、合规建议</span></li>
    <li class="toc-item"><span class="toc-item-title">附录</span></li>
    <li class="toc-item"><span class="toc-item-title">免责声明</span></li>
  </ol>
</div>

{# ═══ 3. 执行摘要 ═══ #}
<div class="page">
  <div class="section">
    <h1>一、执行摘要</h1>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">{{ stats.total_articles | number_comma }}</div>
        <div class="stat-label">本月资讯总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ high_risk_articles | default(value=[]) | length }}</div>
        <div class="stat-label">高风险预警</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">{{ issuers.unique_issuers | default(value=0) }}</div>
        <div class="stat-label">涉及监管机构</div>
      </div>
    </div>
    <div>{{ ai.executive_summary | safe }}</div>
  </div>
</div>

{{ page_break() }}

{# ═══ 4. 本月概览 ═══ #}
<div class="page">
  <div class="section">
    <h1>二、本月概览</h1>

    <div class="stats-grid-4">
      <div class="stat-card">
        <div class="stat-number-sm">{{ stats.with_region | default(value=0) | number_comma }}</div>
        <div class="stat-label">有地域标注</div>
      </div>
      <div class="stat-card">
        <div class="stat-number-sm">{{ stats.with_domain | default(value=0) | number_comma }}</div>
        <div class="stat-label">有领域分类</div>
      </div>
      <div class="stat-card">
        <div class="stat-number-sm">{{ stats.with_importance | default(value=0) | number_comma }}</div>
        <div class="stat-label">有重要性评分</div>
      </div>
      <div class="stat-card">
        <div class="stat-number-sm">{{ stats.with_authority | default(value=0) | number_comma }}</div>
        <div class="stat-label">有权威等级</div>
      </div>
    </div>

    <h2>发布机构 TOP 10</h2>
    {% if issuers.items and issuers.items | length > 0 %}
    <table>
      <thead>
        <tr><th>排名</th><th>发布机构</th><th>发布数量</th><th>占比</th></tr>
      </thead>
      <tbody>
        {% for item in issuers.items | slice(end=10) %}
        <tr>
          <td>{{ loop.index }}</td>
          <td>{{ item.issuer }}</td>
          <td>{{ item.count | number_comma }}</td>
          <td>{{ item.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 5. 重点立法动态 (仅 importance >= 4) ═══ #}
<div class="page">
  <div class="section">
    <h1>三、重点立法动态</h1>
    {% if articles.legislation and articles.legislation | length > 0 %}
    <p class="no-indent">本月共收录立法动态 <strong>{{ articles.legislation | length }}</strong> 篇（仅展示重要性 4 星及以上）。</p>

    {% for article in articles.legislation %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.importance %}<span class="badge badge-importance">{{ article.importance | importance_stars }}</span>{% endif %}
        {% if article.risk_score and article.risk_score >= 40 %}
        <span class="badge badge-risk-{% if article.risk_score >= 70 %}high{% elif article.risk_score >= 40 %}medium{% else %}low{% endif %}">
          风险: {{ article.risk_score }}
        </span>
        {% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=400) }}</div>
      {% endif %}
    </div>
    {% endfor %}
    {% else %}
    <p>本月暂无重点立法动态。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 6. 重要监管动向 ═══ #}
<div class="page">
  <div class="section">
    <h1>四、重要监管动向</h1>
    {% if articles.regulation and articles.regulation | length > 0 %}
    <p class="no-indent">本月共收录监管动向 <strong>{{ articles.regulation | length }}</strong> 篇。</p>

    {% for article in articles.regulation %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.importance %}<span class="badge badge-importance">{{ article.importance | importance_stars }}</span>{% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=400) }}</div>
      {% endif %}
    </div>
    {% endfor %}
    {% else %}
    <p>本月暂无重要监管动向。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 7. 典型执法案例 ═══ #}
<div class="page">
  <div class="section">
    <h1>五、典型执法案例</h1>
    {% if articles.enforcement and articles.enforcement | length > 0 %}
    <p class="no-indent">本月共收录执法案例 <strong>{{ articles.enforcement | length }}</strong> 篇。</p>

    {% for article in articles.enforcement %}
    <div class="article-card">
      <a class="article-card-title" href="{{ article.link }}" target="_blank">{{ article.title }}</a>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
      </div>
      {% if article.summary %}
      <div class="article-card-summary">{{ article.summary | truncate_cn(length=400) }}</div>
      {% endif %}
    </div>
    {% endfor %}
    {% else %}
    <p>本月暂无典型执法案例。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 8. 趋势分析 ═══ #}
<div class="page">
  <div class="section">
    <h1>六、趋势分析</h1>

    <h2>6.1 领域趋势</h2>
    {{ chart_placeholder(id="domain_timeline", width=700, height=400, title="各法律领域资讯数量趋势") }}

    {% if timeline_domain and timeline_domain.series | length > 0 %}
    <div class="insight-box">
      <h4>趋势洞察</h4>
      <p class="no-indent">本月监测到以下领域活跃度变化趋势：</p>
      <ul style="margin-left:2em;margin-top:8px;">
        {% for series in timeline_domain.series %}
        <li>{{ series.label }}：本期共 {{ series.points | map(attribute="count") | sum }} 篇</li>
        {% endfor %}
      </ul>
    </div>
    {% endif %}

    <h2>6.2 重要性趋势</h2>
    {{ chart_placeholder(id="importance_timeline", width=700, height=350, title="高重要性资讯数量趋势") }}
  </div>
</div>

{{ page_break() }}

{# ═══ 9. 地域分布分析 ═══ #}
<div class="page">
  <div class="section">
    <h1>七、地域分布分析</h1>

    {{ chart_placeholder(id="regional_heatmap", width=700, height=500, title="全国地域分布热力图") }}

    {% if regional.items and regional.items | length > 0 %}
    <h2>地域分布详表</h2>
    <table>
      <thead>
        <tr><th>排名</th><th>地区</th><th>资讯数量</th><th>占比</th></tr>
      </thead>
      <tbody>
        {% for item in regional.items %}
        <tr>
          <td>{{ loop.index }}</td>
          <td>{{ item.region_name }}</td>
          <td>{{ item.count | number_comma }}</td>
          <td>{{ item.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    <p class="no-indent" style="font-size:9pt;color:var(--color-text-muted);">
      * 共覆盖 {{ regional.items | length }} 个省级行政区
      | 地域覆盖率：{{ regional.coverage_rate | percentage }}
    </p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 10. 行业分布分析 ═══ #}
<div class="page">
  <div class="section">
    <h1>八、行业分布分析</h1>

    {{ chart_placeholder(id="industry_distribution", width=700, height=400, title="法律领域分布") }}

    {% if industry.items and industry.items | length > 0 %}
    <table>
      <thead>
        <tr><th>法律领域</th><th>资讯数量</th><th>占比</th></tr>
      </thead>
      <tbody>
        {% for item in industry.items %}
        <tr>
          <td>{{ item.label }}</td>
          <td>{{ item.count | number_comma }}</td>
          <td>{{ item.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>

    {# 展示二级分类 #}
    {% for item in industry.items %}
    {% if item.sub_domains and item.sub_domains | length > 0 %}
    <h3>{{ item.label }}细分领域</h3>
    <table>
      <thead><tr><th>细分领域</th><th>数量</th></tr></thead>
      <tbody>
        {% for sub in item.sub_domains %}
        <tr><td>{{ sub.domain_sub }}</td><td>{{ sub.count | number_comma }}</td></tr>
        {% endfor %}
      </tbody>
    </table>
    {% endif %}
    {% endfor %}
    {% endif %}

    {# 权威等级 #}
    <h2>权威等级分布</h2>
    {{ chart_placeholder(id="authority_distribution", width=700, height=350, title="法律权威等级分布") }}

    {% if authority.levels and authority.levels | length > 0 %}
    <table>
      <thead><tr><th>权威等级</th><th>数量</th><th>占比</th></tr></thead>
      <tbody>
        {% for lvl in authority.levels %}
        <tr>
          <td>{{ lvl.label }}</td>
          <td>{{ lvl.count | number_comma }}</td>
          <td>{{ lvl.percentage | percentage }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 11. 风险评估与预警 ═══ #}
<div class="page">
  <div class="section">
    <h1>九、风险评估与预警</h1>

    {{ chart_placeholder(id="importance_distribution", width=700, height=350, title="重要性等级分布") }}

    {% if high_risk_articles and high_risk_articles | length > 0 %}
    <h2>高风险事项清单</h2>
    <p class="no-indent">本月共识别 <strong>{{ high_risk_articles | length }}</strong> 项高风险事项：</p>

    {% for article in high_risk_articles %}
    <div class="risk-alert">
      <div class="risk-alert-header">[风险评分: {{ article.risk_score }}] {{ article.title }}</div>
      <div class="article-card-meta">
        {% if article.issuer %}<span>{{ article.issuer }}</span>{% endif %}
        {% if article.published_at %}<span>{{ article.published_at | date_cn }}</span>{% endif %}
        {% if article.domain_root %}<span>{{ article.domain_root | domain_label }}</span>{% endif %}
      </div>
      {% if article.summary %}
      <p class="no-indent" style="margin-top:8px;font-size:11pt;">{{ article.summary }}</p>
      {% endif %}
    </div>
    {% endfor %}
    {% else %}
    <p>本月未发现高风险预警事项。</p>
    {% endif %}

    {% if ai.risk_analysis %}
    <h2>风险深度分析</h2>
    <div>{{ ai.risk_analysis | safe }}</div>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 12. 合规建议 ═══ #}
<div class="page">
  <div class="section">
    <h1>十、合规建议</h1>
    {% if ai.recommendations %}
    <div>{{ ai.recommendations | safe }}</div>
    {% else %}
    <p>暂无 AI 生成的合规建议。</p>
    {% endif %}
  </div>
</div>

{{ page_break() }}

{# ═══ 13. 附录 ═══ #}
<div class="page">
  <div class="section">
    <h1>附录</h1>

    <h2>A. 重要性评分说明</h2>
    <table>
      <thead><tr><th>等级</th><th>星级</th><th>含义</th></tr></thead>
      <tbody>
        <tr><td>5</td><td>★★★★★</td><td>重大影响 — 直接影响业务运营或合规策略</td></tr>
        <tr><td>4</td><td>★★★★☆</td><td>较大影响 — 需要关注并可能需要调整</td></tr>
        <tr><td>3</td><td>★★★☆☆</td><td>一般关注 — 需持续跟踪</td></tr>
        <tr><td>2</td><td>★★☆☆☆</td><td>参考了解 — 一般性信息</td></tr>
        <tr><td>1</td><td>★☆☆☆☆</td><td>低关注 — 背景信息</td></tr>
      </tbody>
    </table>

    <h2>B. 风险评分说明</h2>
    <table>
      <thead><tr><th>分值范围</th><th>风险等级</th><th>建议行动</th></tr></thead>
      <tbody>
        <tr><td>70-100</td><td><span class="badge badge-risk-high">高风险</span></td><td>立即关注，评估影响，制定应对方案</td></tr>
        <tr><td>40-69</td><td><span class="badge badge-risk-medium">中风险</span></td><td>持续跟踪，评估潜在影响</td></tr>
        <tr><td>1-39</td><td><span class="badge badge-risk-low">低风险</span></td><td>常规关注</td></tr>
      </tbody>
    </table>

    <h2>C. 权威等级说明</h2>
    <table>
      <thead><tr><th>等级</th><th>名称</th><th>说明</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>宪法</td><td>国家根本大法</td></tr>
        <tr><td>2</td><td>法律</td><td>全国人大及其常委会制定</td></tr>
        <tr><td>3</td><td>行政法规</td><td>国务院制定</td></tr>
        <tr><td>4</td><td>部门规章</td><td>国务院各部委制定</td></tr>
        <tr><td>5</td><td>地方性法规</td><td>地方人大及其常委会制定</td></tr>
        <tr><td>6</td><td>地方政府规章</td><td>省、市级人民政府制定</td></tr>
        <tr><td>7</td><td>司法解释</td><td>最高人民法院、最高人民检察院</td></tr>
        <tr><td>8</td><td>规范性文件</td><td>行政机关发布的非立法性文件</td></tr>
        <tr><td>9</td><td>行业标准</td><td>行业协会、标准化组织</td></tr>
        <tr><td>10</td><td>非正式</td><td>新闻报道、评论文章等</td></tr>
      </tbody>
    </table>
  </div>
</div>

{{ page_break() }}

{# ═══ 14. 免责声明 ═══ #}
<div class="page">
  <div class="disclaimer">
    <h3 style="margin-bottom:12px;font-size:12pt;color:var(--color-text);">免责声明</h3>
    <p>1. 本报告所载信息仅供参考，不构成任何法律意见或法律服务。</p>
    <p>2. 本报告中的资讯内容来源于公开渠道，我们已尽合理努力确保信息的准确性，但不对其完整性、准确性或时效性作任何保证。</p>
    <p>3. 阅读者不应仅依赖本报告中的信息做出法律决策。如需法律建议，请咨询具有执业资格的专业律师。</p>
    <p>4. 本报告中的风险评分和重要性评级由人工智能模型生成，仅作为参考指标，不代表最终法律判断。</p>
    <p>5. 未经书面授权，禁止以任何形式复制、转发或公开本报告的全部或部分内容。</p>
    <p>6. 本报告为{{ style.header.classification | default(value="内部资料") }}，仅限授权人员查阅。</p>
    <p style="margin-top:16px;text-align:right;">
      {{ org.name | default(value="LawSaw") }} | {{ report.created_at | date_cn }}
    </p>
  </div>
</div>

</body>
</html>
```

---

## 五、样式系统设计

### 5.1 基础 CSS 样式架构

样式系统采用 CSS 变量（Custom Properties）实现主题化，同时保证 HTML 渲染和 PDF 导出的一致性。

**设计原则：**
- 所有样式内联在 `<style>` 标签中（PDF 渲染不支持外部 CSS 引用）
- 使用 CSS 变量实现主题切换
- 严格区分屏幕样式和打印样式
- 字体回退链确保跨平台一致

```css
/* ── 中文字体回退方案 ──────────────────────────────── */

/* 正文字体（宋体系列 — 适合正式法律文书） */
--font-serif: "SimSun", "Songti SC", "Noto Serif CJK SC",
              "FangSong", "STFangsong", serif;

/* 标题/UI字体（黑体系列 — 清晰易读） */
--font-sans: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC",
             "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif;

/* 等宽字体（代码/编号） */
--font-mono: "Consolas", "Source Code Pro", "Noto Sans Mono CJK SC", monospace;

/*
 * 字体适配说明：
 * - Windows: SimSun (宋体), Microsoft YaHei (微软雅黑)
 * - macOS: Songti SC (宋体-简), PingFang SC (苹方)
 * - Linux: Noto Serif/Sans CJK SC (思源字体)
 * - PDF (browserless/Chrome): 需在容器中预装中文字体
 *   推荐在 Dockerfile 中安装 fonts-noto-cjk:
 *   RUN apt-get install -y fonts-noto-cjk fonts-noto-cjk-extra
 */
```

### 5.2 PDF 打印优化样式

```css
@media print {
  /* ── 页面基础 ───────────────────────────────── */
  @page {
    size: A4 portrait;
    margin: 25mm 25mm 25mm 30mm;
  }

  @page :first {
    margin: 0;  /* 封面页无边距 */
  }

  body {
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 12pt;
  }

  /* ── 分页控制 ───────────────────────────────── */
  .page-break {
    page-break-after: always;
    break-after: page;
    height: 0;
    overflow: hidden;
  }

  .cover {
    page-break-after: always;
    break-after: page;
    min-height: auto;
    height: auto;
    padding: 60mm 25mm 40mm 25mm;
  }

  h1, h2, h3 {
    page-break-after: avoid;
    break-after: avoid;
  }

  .article-card,
  .risk-alert,
  .calendar-item,
  .stat-card,
  table {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* 避免表头与表体分离 */
  thead {
    display: table-header-group;
  }
  tbody tr {
    page-break-inside: avoid;
  }

  /* ── 打印颜色保留 ──────────────────────────── */
  .stat-card,
  .badge,
  .risk-alert,
  thead th,
  .cover,
  .calendar-date {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── 链接去除下划线 ────────────────────────── */
  a {
    color: var(--color-text) !important;
    text-decoration: none !important;
  }

  /* ── 隐藏非打印元素 ────────────────────────── */
  .no-print {
    display: none !important;
  }
}
```

### 5.3 页眉 HTML 模板

```html
<!-- 传给 Browserless PDF API 的 header_template -->
<div style="
  width: 100%;
  font-size: 8pt;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  padding: 0 30mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #718096;
  border-bottom: 0.5pt solid #e2e8f0;
  padding-bottom: 4px;
">
  <span>{{ style.header.text | default(value="法眼合规报告") }}</span>
  <span>{{ report.report_number }}</span>
  {% if style.header.classification %}
  <span style="
    color: #c53030;
    font-weight: bold;
    border: 1px solid #c53030;
    padding: 0 6px;
    font-size: 7pt;
  ">{{ style.header.classification }}</span>
  {% endif %}
</div>
```

### 5.4 页脚 HTML 模板

```html
<!-- 传给 Browserless PDF API 的 footer_template -->
<div style="
  width: 100%;
  font-size: 8pt;
  font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
  padding: 0 30mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #a0aec0;
  border-top: 0.5pt solid #e2e8f0;
  padding-top: 4px;
">
  <span>{{ style.footer.text | default(value="仅供内部参考") }}</span>
  <span>
    {% if style.footer.show_date %}{{ report.created_at | date_cn }} | {% endif %}
    {% if style.footer.show_page_number %}
    第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页
    {% endif %}
  </span>
</div>
```

### 5.5 Browserless PDF 调用参数

```rust
// crates/law-eye-core/src/report/exporter/pdf.rs

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BrowserlessPdfRequest {
    pub html: String,
    pub options: BrowserlessPdfOptions,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserlessPdfOptions {
    /// 纸张大小: "A4"
    pub format: String,
    /// 页边距
    pub margin: PdfMargin,
    /// 显示页眉页脚
    pub display_header_footer: bool,
    /// 页眉 HTML 模板
    pub header_template: String,
    /// 页脚 HTML 模板
    pub footer_template: String,
    /// 保留背景色和图片
    pub print_background: bool,
    /// 使用 CSS @page 尺寸
    pub prefer_css_page_size: bool,
    /// 等待网络空闲
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wait_for_network_idle: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct PdfMargin {
    pub top: String,    // "25mm"
    pub bottom: String, // "25mm"
    pub left: String,   // "30mm"
    pub right: String,  // "25mm"
}

impl Default for BrowserlessPdfOptions {
    fn default() -> Self {
        Self {
            format: "A4".to_string(),
            margin: PdfMargin {
                top: "25mm".to_string(),
                bottom: "25mm".to_string(),
                left: "30mm".to_string(),
                right: "25mm".to_string(),
            },
            display_header_footer: true,
            header_template: String::new(),
            footer_template: String::new(),
            print_background: true,
            prefer_css_page_size: false,
            wait_for_network_idle: Some(true),
        }
    }
}
```

---

## 六、图表嵌入方案

### 6.1 整体流程

```
报告渲染流程:
                                  ┌─────────────────┐
                                  │ StatisticsService│
                                  │  (聚合查询)      │
                                  └────────┬────────┘
                                           │ 统计数据
                                           ▼
┌──────────┐    Tera 渲染    ┌──────────────────────┐    SVG 注入    ┌───────────┐
│ 模板 HTML ├───────────────►│ HTML (含占位符)        ├──────────────►│ 完整 HTML  │
│ (Tera)   │                │ <div data-chart-id>  │              │ (含 SVG)  │
└──────────┘                └──────────────────────┘              └─────┬─────┘
                                                                       │
                                                              Browserless
                                                                       ▼
                                                                ┌───────────┐
                                                                │   PDF     │
                                                                └───────────┘
```

### 6.2 SVG 内联嵌入方案

**为何选择 SVG 内联而非图片引用：**
1. Browserless 渲染 HTML 时无法访问外部图片 URL（内网隔离）
2. SVG 是矢量格式，PDF 缩放不失真
3. 内联 SVG 无需额外 HTTP 请求

```rust
// crates/law-eye-core/src/report/exporter/chart.rs

use plotters::prelude::*;
use plotters_svg::SVGBackend;

/// 图表生成器 — 使用 plotters 生成 SVG
pub struct ChartGenerator;

impl ChartGenerator {
    /// 生成行业分布饼图 SVG
    pub fn industry_pie_chart(data: &IndustryDistribution) -> Result<String, Box<dyn std::error::Error>> {
        let mut svg_buf = String::new();
        {
            let backend = SVGBackend::with_string(&mut svg_buf, (700, 400));
            let root = backend.into_drawing_area();
            root.fill(&WHITE)?;

            // ... plotters 绑图逻辑 ...
        }
        Ok(svg_buf)
    }

    /// 生成地域分布条形图 SVG (热力图由前端 echarts 生成)
    pub fn regional_bar_chart(data: &RegionalDistribution) -> Result<String, Box<dyn std::error::Error>> {
        let mut svg_buf = String::new();
        {
            let backend = SVGBackend::with_string(&mut svg_buf, (700, 500));
            let root = backend.into_drawing_area();
            root.fill(&WHITE)?;

            // ... plotters 绑图逻辑 ...
        }
        Ok(svg_buf)
    }

    /// 生成重要性分布条形图 SVG
    pub fn importance_bar_chart(data: &ImportanceDistribution) -> Result<String, Box<dyn std::error::Error>> {
        let mut svg_buf = String::new();
        {
            let backend = SVGBackend::with_string(&mut svg_buf, (700, 350));
            let root = backend.into_drawing_area();
            root.fill(&WHITE)?;

            // ... plotters 绑图逻辑 ...
        }
        Ok(svg_buf)
    }
}
```

### 6.3 图表占位符语法

在 Tera 模板中使用自定义函数生成占位符：

```html
{# 模板中使用 #}
{{ chart_placeholder(id="regional_heatmap", width=700, height=500, title="地域分布热力图") }}

{# 渲染输出 #}
<div class="chart-container" data-chart-id="regional_heatmap" style="width:700px;height:500px;">
  <div class="chart-title">地域分布热力图</div>
  <div class="chart-content" id="chart-regional_heatmap">
    <!-- SVG 将在导出阶段注入 -->
  </div>
</div>
```

### 6.4 SVG 注入后处理

```rust
// crates/law-eye-core/src/report/exporter/html.rs

/// HTML 后处理器 — 将生成的 SVG 注入到占位符中
pub struct HtmlPostProcessor;

impl HtmlPostProcessor {
    /// 将 SVG 图表注入到 HTML 占位符中
    ///
    /// 扫描 `data-chart-id` 属性的 div，将对应 SVG 内容注入到 `.chart-content` 子元素中。
    pub fn inject_charts(
        html: &str,
        charts: &HashMap<String, String>,  // chart_id -> SVG string
    ) -> String {
        let mut result = html.to_string();

        for (chart_id, svg_content) in charts {
            let placeholder = format!(
                r#"<div class="chart-content" id="chart-{}">"#,
                chart_id
            );
            let replacement = format!(
                r#"<div class="chart-content" id="chart-{}">{}"#,
                chart_id, svg_content
            );
            result = result.replace(&placeholder, &replacement);
        }

        result
    }
}
```

### 6.5 支持的图表类型

| 图表 ID | 类型 | 数据源 | 生成方式 |
|:--------|:-----|:-------|:---------|
| `regional_heatmap` | 地图/条形图 | `RegionalDistribution` | plotters SVG |
| `industry_distribution` | 饼图 | `IndustryDistribution` | plotters SVG |
| `importance_distribution` | 条形图 | `ImportanceDistribution` | plotters SVG |
| `authority_distribution` | 条形图 | `AuthorityDistribution` | plotters SVG |
| `domain_timeline` | 折线图 | `TimelineByDimension` | plotters SVG |
| `importance_timeline` | 折线图 | `TimelineByDimension` | plotters SVG |
| `issuer_bar` | 水平条形图 | `IssuerDistribution` | plotters SVG |

---

## 七、法律行业排版规范

### 7.1 页面设置

| 参数 | 值 | 说明 |
|:-----|:---|:-----|
| 纸张大小 | A4 (210mm x 297mm) | 国际标准 |
| 上边距 | 25mm | 预留页眉空间 |
| 下边距 | 25mm | 预留页脚空间 |
| 左边距 | 30mm | 装订侧留宽 |
| 右边距 | 25mm | 标准 |
| 页眉距 | 15mm | 页眉与正文间距 |
| 页脚距 | 15mm | 页脚与正文间距 |

### 7.2 字体规范

| 用途 | 字体 | 字号 | 字重 | 行距 |
|:-----|:-----|:-----|:-----|:-----|
| 报告标题 (封面) | 宋体 (SimSun) | 三号 (22pt - 周报) / 小二 (24pt - 月报) | Bold | 1.5 |
| 一级标题 (h1) | 宋体 | 小三 (18pt) | Bold | 1.5 |
| 二级标题 (h2) | 宋体 | 四号 (16pt) | Bold | 1.5 |
| 三级标题 (h3) | 黑体 (Microsoft YaHei) | 小四 (14pt) | Bold | 1.5 |
| 正文 | 黑体 | 五号 (12pt) | Normal | 1.8 |
| 表格内容 | 黑体 | 小五 (11pt) | Normal | 1.4 |
| 注释/脚注 | 黑体 | 六号 (9pt) | Normal | 1.4 |
| 页眉/页脚 | 黑体 | 小六 (8pt) | Normal | 1.0 |

### 7.3 标题层级样式

```
一级标题 ─── 宋体 18pt 加粗，底部 2px 实线 (主色)，上方分页
  二级标题 ── 宋体 16pt 加粗，无装饰线
    三级标题 ─ 黑体 14pt 加粗
```

**编号规则：**
- 一级标题：中文数字 "一、二、三..."
- 二级标题：阿拉伯数字 "1.1, 1.2, 2.1..."
- 三级标题：阿拉伯数字 "1.1.1, 1.1.2..."

### 7.4 表格样式

```
┌────────────────────────────────────────────┐
│ 表头 — 主色背景 (#1a365d)，白色文字        │
│ 左对齐，10pt，加粗                          │
├────────────────────────────────────────────┤
│ 奇数行 — 白色背景                           │
│ 偶数行 — 浅灰背景 (#f7fafc)                │
│ 左对齐，11pt，常规                          │
│ 底部 1px 浅灰色 (#e2e8f0) 分隔线           │
├────────────────────────────────────────────┤
│ 最后一行底部无额外分隔线                    │
└────────────────────────────────────────────┘
```

- 表格宽度：100% 容器宽度
- 单元格内边距：8px 12px
- 数字右对齐，文本左对齐
- 表格不跨页（`page-break-inside: avoid`）

### 7.5 法规引用格式

法律文件引用应遵循以下格式：

```
《中华人民共和国个人信息保护法》（2021年11月1日施行）
《数据安全法实施条例》（征求意见稿，2024年3月发布）
```

在模板中的表现：

```html
{# 法规引用样式 #}
<cite class="law-reference">
  《{{ article.title }}》
  {% if article.effective_date %}
  <span class="law-date">（{{ article.effective_date | date_cn }}施行）</span>
  {% endif %}
</cite>
```

对应 CSS：

```css
.law-reference {
  font-style: normal;       /* 中文不使用斜体 */
  font-family: var(--font-serif);
  color: var(--color-primary);
}
.law-date {
  font-size: 10pt;
  color: var(--color-text-muted);
}
```

---

## 八、模板版本管理

### 8.1 版本管理策略

```
report_templates 表:
┌─────────────────────────────────────────────────┐
│ id            │ UUID (不变)                       │
│ version       │ 自增版本号 (触发器 bump)          │
│ body_template │ 最新 Tera HTML 模板内容           │
│ updated_at    │ 最后更新时间                      │
└─────────────────────────────────────────────────┘

reports 表:
┌─────────────────────────────────────────────────┐
│ template_id   │ 引用模板 (外键)                   │
│ content       │ JSONB (报告渲染后的结构化内容)    │
│ html_object_key │ 已导出的 HTML 文件 (MinIO)      │
└─────────────────────────────────────────────────┘
```

**核心原则：**

| 原则 | 说明 |
|:-----|:-----|
| **渲染时绑定** | 报告在渲染/导出时使用当时的模板版本 |
| **已导出不变** | 已导出的 PDF/HTML 文件不受模板更新影响 |
| **可追溯** | 通过 `report_snapshots` 表可追溯每次内容变更 |
| **惰性更新** | 模板更新后，已有报告不自动重新渲染 |

### 8.2 模板更新对已有报告的影响

```
场景分析:

1. 模板更新 → 已发布的报告
   ├── PDF/HTML 文件: 不受影响 (已存储在 MinIO)
   ├── content JSONB: 不受影响 (独立于模板)
   └── 结论: 零影响

2. 模板更新 → 草稿中的报告
   ├── 下次"预览"或"导出"时使用新模板渲染
   ├── content JSONB 数据不变，仅渲染层变化
   └── 结论: 自动使用新模板

3. 模板更新 → 用户请求"重新导出"
   ├── 使用最新模板重新渲染 HTML
   ├── 生成新的 PDF 文件
   ├── 更新 reports.pdf_object_key (旧文件保留)
   └── 结论: 主动更新

4. 模板更新 → 用户请求"使用旧模板重新导出"
   ├── 从 report_snapshots 获取指定版本的 content
   ├── 需要模板版本回退机制
   └── 见 8.3 节
```

### 8.3 模板回退策略

```rust
// crates/law-eye-core/src/report/template_service.rs

impl ReportTemplateService {
    /// 获取模板的指定版本
    ///
    /// 方案: 利用 report_snapshots 存储模板快照
    /// 当模板更新时，在 report_snapshots 中记录模板的 body_template 变更
    pub async fn get_template_at_version(
        &self,
        template_id: Uuid,
        tenant_id: Uuid,
        version: i64,
    ) -> Result<ReportTemplate> {
        // 如果请求的是当前版本，直接返回
        let current = self.get_template(template_id, tenant_id).await?;
        if current.version == version {
            return Ok(current);
        }

        // 否则从审计日志重建
        // report_templates 的每次 UPDATE 都会被 bump_version_column 触发器记录
        let template_snapshot: Option<(String, serde_json::Value)> = sqlx::query_as(
            r#"
            SELECT
                COALESCE(old_value->>'body_template', '') AS body_template,
                COALESCE(old_value->'style_config', '{}'::jsonb) AS style_config
            FROM audit_logs
            WHERE resource = 'report_template'
              AND resource_id = $1
              AND action = 'report_template.update'
              AND (new_value->>'version')::bigint > $2
            ORDER BY created_at ASC
            LIMIT 1
            "#,
        )
        .bind(template_id)
        .bind(version)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| Error::Database(e.to_string()))?;

        match template_snapshot {
            Some((body, style)) => {
                let mut restored = current;
                restored.body_template = Some(body);
                restored.style_config = style;
                restored.version = version;
                Ok(restored)
            }
            None => Err(Error::NotFound(format!(
                "模板版本 {} 不存在",
                version
            ))),
        }
    }
}
```

### 8.4 模板变更审计

每次模板更新时，自动记录到 `audit_logs` 表：

```rust
// 模板更新时的审计记录
audit_service.log(CreateAuditLog {
    user_id: Some(current_user_id),
    action: "report_template.update".to_string(),
    resource: "report_template".to_string(),
    resource_id: Some(template_id),
    old_value: Some(serde_json::json!({
        "body_template": old_template.body_template,
        "style_config": old_template.style_config,
        "sections": old_template.sections,
        "version": old_template.version,
    })),
    new_value: Some(serde_json::json!({
        "body_template": new_body_template,
        "style_config": new_style_config,
        "sections": new_sections,
        "version": old_template.version + 1,
    })),
    ip_address: request_ip,
    user_agent: request_ua,
}).await?;
```

### 8.5 模板版本兼容性矩阵

| 操作 | 旧模板报告 | 新模板报告 | 说明 |
|:-----|:-----------|:-----------|:-----|
| 查看 HTML 预览 | 使用新模板渲染 | 使用新模板渲染 | 预览始终最新 |
| 下载已导出 PDF | 返回已存储文件 | 返回已存储文件 | 不受模板变更影响 |
| 重新导出 PDF | 使用新模板重新渲染 | 使用新模板渲染 | 主动触发 |
| 回退导出 | 从审计日志恢复旧模板 | N/A | 需指定版本号 |
| 编辑报告内容 | 内容不变，仅渲染变 | 内容不变 | 数据与展示分离 |

---

## 附录：完整渲染流程伪代码

```rust
/// 报告渲染完整流程
pub async fn render_report_to_pdf(
    report_id: Uuid,
    tenant_id: Uuid,
    services: &AppServices,
) -> Result<Vec<u8>> {
    // 1. 加载报告和模板
    let report = services.report.get(report_id, tenant_id).await?;
    let template = services.report_template.get(report.template_id, tenant_id).await?;
    let tenant = services.tenant.get(tenant_id).await?;
    let author = services.user.get(report.author_id, tenant_id).await?;

    // 2. 聚合统计数据
    let query = StatisticsQuery {
        date_from: Some(report.period_start),
        date_to: Some(report.period_end),
    };
    let overview = services.statistics.overview(tenant_id).await?;
    let regional = services.statistics.regional_distribution(tenant_id, &query).await?;
    let industry = services.statistics.industry_distribution(tenant_id, &query, true).await?;
    let importance = services.statistics.importance_distribution(tenant_id, &query).await?;
    let authority = services.statistics.authority_distribution(tenant_id, &query).await?;
    let issuers = services.statistics.issuer_distribution(tenant_id, &query, 20).await?;

    // 3. 查询资讯列表 (按领域分组)
    let articles_by_domain = services.report_aggregator
        .articles_by_domain(tenant_id, report.period_start, report.period_end)
        .await?;
    let high_risk = services.report_aggregator
        .high_risk_articles(tenant_id, report.period_start, report.period_end, 70)
        .await?;

    // 4. 构建 Tera Context
    let context = ReportContextBuilder::new()
        .with_report(&report, &tenant, &author)
        .with_statistics(&overview, &regional, &industry, &importance, &authority, &issuers)
        .with_articles(&articles_by_domain, &high_risk)
        .with_ai_content(
            &report.content["sections"]["executive_summary"]["html"],
            &report.content["sections"]["recommendations"]["html"],
            &report.content["sections"]["risk_assessment"]["html"],
        )
        .with_style(&template.style_config)
        .build();

    // 5. Tera 模板渲染 → HTML (含占位符)
    let engine = ReportTemplateEngine::new()?;
    let body = template.body_template.as_deref()
        .ok_or_else(|| Error::Validation("模板未配置 body_template".into()))?;
    let html_with_placeholders = engine.render(
        &template.slug,
        body,
        &context,
    )?;

    // 6. 生成 SVG 图表
    let mut charts = HashMap::new();
    charts.insert(
        "industry_distribution".to_string(),
        ChartGenerator::industry_pie_chart(&industry)?,
    );
    charts.insert(
        "regional_heatmap".to_string(),
        ChartGenerator::regional_bar_chart(&regional)?,
    );
    charts.insert(
        "importance_distribution".to_string(),
        ChartGenerator::importance_bar_chart(&importance)?,
    );

    // 7. 注入 SVG → 完整 HTML
    let final_html = HtmlPostProcessor::inject_charts(&html_with_placeholders, &charts);

    // 8. Browserless HTML → PDF
    let pdf_bytes = services.browserless.render_pdf(BrowserlessPdfRequest {
        html: final_html,
        options: BrowserlessPdfOptions {
            header_template: render_header_template(&template, &report),
            footer_template: render_footer_template(&template, &report),
            ..Default::default()
        },
    }).await?;

    // 9. 上传 PDF 到 MinIO
    let object_key = format!(
        "reports/{}/{}/v{}.pdf",
        tenant_id, report_id, report.version
    );
    services.object_storage.put(&object_key, &pdf_bytes, "application/pdf").await?;

    // 10. 更新报告记录
    services.report.update_export_key(
        report_id, tenant_id,
        ExportFormat::Pdf, &object_key,
    ).await?;

    Ok(pdf_bytes)
}
```
