# 命题四：现状审计报告 — 报告生成功能

> 审计日期: 2026-02-13
> 审计范围: LawSaw (法眼) 报告生成功能所涉及的全部系统组件
> 技术栈: Rust (axum 0.8) + Next.js (React 19) + PostgreSQL + Redis + MinIO

---

## 一、审计范围

本次审计聚焦于「报告生成」功能实现所需的全部现有系统组件，评估其可复用性、技术债务和差距。

| 层级 | 组件 | 源文件 | 审计目标 |
|------|------|--------|----------|
| 模板渲染 | EmailTemplateEngine | `crates/law-eye-core/src/email/template.rs` | 现有模板引擎能力 |
| 数据聚合 | StatisticsService | `crates/law-eye-core/src/statistics.rs` | 统计数据与报告变量映射 |
| API 层 | statistics routes | `crates/law-eye-api/src/routes/statistics/` | 端点可复用性 |
| 数据库 | migrations 001-031 | `crates/law-eye-db/migrations/` | 表结构对报告的支持 |
| 前端 | analytics page + statistics | `apps/web/src/app/analytics/` | 图表组件可复用性 |
| 基础设施 | docker-compose.yml | `docker-compose.yml` | 基础设施就绪度 |

---

## 二、现有能力详细评估

### 2.1 邮件模板引擎 (EmailTemplateEngine)

#### 源文件: `crates/law-eye-core/src/email/template.rs`

**当前能力:**

1. **数据模型** (第 4-31 行): 定义了 `DailyDigest`、`CategorySection`、`DigestArticle` 三个结构体，支持日期、总数、分类列表、高亮文章等字段。其中 `DigestArticle` 已包含 `risk_score: Option<i32>` 和 `importance: Option<i32>` 字段 (第 12-13 行)，证明数据模型已预留了部分报告维度。

2. **渲染入口** (第 40-53 行): `render_daily_digest()` 是唯一的公开渲染方法，串联 header -> highlights -> categories -> footer -> layout 五个阶段。

3. **HTML 布局** (第 55-185 行): `wrap_in_layout()` 使用 `format!()` 宏内嵌了完整的 HTML 文档，包含 inline CSS (约 120 行)。最大宽度 680px，适配邮件客户端。

4. **风险徽章** (第 273-295 行): `render_risk_badge()` 实现了三级风险着色 (high >= 70, medium >= 40, low > 0)。

5. **测试覆盖** (第 314-387 行): 4 个单元测试覆盖了核心渲染路径。

**架构问题:**

| 编号 | 问题 | 位置 | 严重度 |
|------|------|------|--------|
| T-2.1.1 | **`format!()` 硬编码 HTML**: 所有 HTML 模板以 Rust 原始字符串形式硬编码在源代码中 (第 56-184 行)。修改样式需要重新编译整个 crate。无法支持租户自定义模板。 | template.rs:56-184 | 高 |
| T-2.1.2 | **无模板引擎抽象**: `EmailTemplate` trait (第 33-35 行) 仅定义了 `render(&self) -> String` 签名，但 `EmailTemplateEngine` 并未实现该 trait，而是使用静态方法。trait 形同虚设。 | template.rs:33-37 | 中 |
| T-2.1.3 | **XSS 风险**: `render_article()` (第 241-271 行) 将 `article.title`、`article.link`、`article.summary` 直接拼入 HTML，未做 HTML 实体转义。如果文章标题包含 `<script>` 标签，将直接注入邮件 HTML。 | template.rs:250-270 | 高 |
| T-2.1.4 | **Footer 占位符未实现**: `render_footer()` (第 297-311 行) 包含 `{{unsubscribe_url}}`、`{{preferences_url}}`、`{{web_version_url}}` 三个占位符，但没有任何代码替换它们。最终 HTML 中会包含字面量 `{{unsubscribe_url}}`。 | template.rs:303-305 | 中 |
| T-2.1.5 | **仅支持日报格式**: 当前仅有 `render_daily_digest` 一个入口，无法生成周报、月报、自定义报告等格式。 | template.rs:40 | 中 |

**可复用部分:**

- `DigestArticle` 结构体可作为报告中「文章摘要卡片」的数据源，但需扩展字段 (如 `domain_root`、`authority_level`、`region_code`)。
- CSS 样式系统 (蓝色主色调、卡片布局) 可作为报告模板的基础。
- `render_risk_badge()` 的三级着色逻辑可直接复用。

**需重构部分:**

- 必须引入真正的模板引擎 (如 `tera`、`askama` 或 `minijinja`)，将 HTML 模板从 Rust 代码中分离。
- 需要实现模板变量注入系统，支持统计数据、图表占位符、自定义片段。
- 必须为所有用户输入内容添加 HTML 实体转义。
- 需要设计多报告类型的模板继承/组合机制。

---

### 2.2 统计服务 (StatisticsService)

#### 源文件: `crates/law-eye-core/src/statistics.rs`

**7 个聚合维度的完整性评估:**

| 聚合方法 | 行号 | 数据完整性 | 报告适用性 | 评估 |
|----------|------|-----------|-----------|------|
| `regional_distribution()` | 243-318 | 完整: items + total + coverage_rate | 适合地域分析章节 | 可复用 |
| `industry_distribution()` | 320-434 | 完整: 含可选 sub_domains 下钻 | 适合行业分析章节 | 可复用 |
| `importance_distribution()` | 436-501 | 完整: 5 级 levels 数组 + average + coverage_rate | 适合重要性分析章节 | 可复用 |
| `authority_distribution()` | 503-578 | 完整: 按权威等级聚合 | 适合权威来源分析章节 | 可复用 |
| `issuer_distribution()` | 580-650 | 完整: top N + unique_issuers | 适合发布机构分析章节 | 可复用 |
| `cross_dimensional()` | 652-704 | 完整: 动态列名白名单 + LIMIT | 适合交叉分析章节 | 可复用 |
| `timeline_by_dimension()` | 706-824 | 完整: date_series + top N 系列 | 适合趋势分析章节 | 可复用 |
| `overview()` | 826-853 | 完整: 6 维度覆盖率统计 | 适合报告概览摘要 | 可复用 |

**数据模型与报告变量的映射关系:**

现有的数据结构可以直接映射到报告模板变量：

```
StatisticsOverview -> 报告封面: 总文章数、各维度覆盖率
RegionalDistribution -> 地域分布章节: 省份排名、覆盖率
IndustryDistribution -> 行业分析章节: 领域饼图数据
ImportanceDistribution -> 重要性评估章节: 5级分布、均值
AuthorityDistribution -> 权威来源章节: 10级金字塔
IssuerDistribution -> 发布机构章节: 机构 TOP N 排名
CrossDimensionalResult -> 交叉分析章节: 热力图矩阵
TimelineByDimension -> 趋势分析章节: 多系列折线图
```

**关键设计良好之处:**

1. **SQL 注入防护** (第 856-870 行): `dimension_to_column()` 使用白名单映射，防止了 `cross_dimensional()` 和 `timeline_by_dimension()` 中动态列名拼接的 SQL 注入风险。
2. **租户隔离**: 所有 7 个查询方法都接受 `tenant_id: Uuid` 参数，且 SQL 均含 `WHERE tenant_id = $1 AND deleted_at IS NULL`。
3. **日期过滤**: 所有查询均支持 `date_from` / `date_to` 可选参数，适合报告的时间范围筛选。

**缺失的报告专用聚合能力:**

| 编号 | 缺失能力 | 影响 |
|------|---------|------|
| G-2.2.1 | **单次批量查询**: 报告生成需要同时获取所有 7 个维度的数据，当前需要 8 次独立数据库调用 (7 个聚合 + 1 个 overview)。缺少 `generate_report_data()` 批量方法。 | 性能瓶颈 |
| G-2.2.2 | **同比/环比计算**: 缺少上一周期对比数据 (如本月 vs 上月)，报告中的「趋势变化」需手动计算。 | 功能缺失 |
| G-2.2.3 | **TOP N 文章列表**: 统计服务只返回聚合计数，不返回具体文章。报告需要「本期最重要的 10 篇文章」等列表。 | 功能缺失 |
| G-2.2.4 | **地域名称映射线性查找**: `region_code_to_name()` (第 46-52 行) 使用 `REGION_MAP` 线性遍历 (`O(n)`)，34 个省份虽然数量不大，但在批量处理时仍不高效。应使用 `HashMap` 或 `phf::Map`。 | 性能优化 |
| G-2.2.5 | **缺乏缓存层**: 统计数据每次都直接查库，对于报告生成场景 (同一时间范围多次渲染) 会造成重复查询。 | 性能瓶颈 |

---

### 2.3 数据库架构

#### 源文件: `crates/law-eye-db/migrations/001_initial.sql`, `006_tenants.sql`, `015_articles_version_soft_delete.sql`, `030_crawler_enhancement.sql`

**现有表结构对报告功能的支持程度:**

**articles 表 (核心数据源):**

| 字段 | 来源 | 报告用途 | 就绪状态 |
|------|------|---------|---------|
| `title`, `link`, `content`, `summary` | 001_initial.sql:54-61 | 文章列表、摘要展示 | 已就绪 |
| `risk_score` (0-100) | 001_initial.sql:64 | 风险分布图 | 已就绪 |
| `importance` (1-5) | 001_initial.sql:65 | 重要性分布图 | 已就绪 |
| `sentiment` (positive/negative/neutral/mixed) | 001_initial.sql:66 | 情绪分析图 | 已就绪 |
| `domain_root`, `domain_sub` | 030_crawler_enhancement.sql:21-27 | 行业分布图 | 已就绪 |
| `authority_level` (1-10) | 030_crawler_enhancement.sql:31 | 权威等级图 | 已就绪 |
| `issuer` | 030_crawler_enhancement.sql:35 | 发布机构排名 | 已就绪 |
| `region_code` | 030_crawler_enhancement.sql:47 | 地域热力图 | 已就绪 |
| `effective_date` | 030_crawler_enhancement.sql:43 | 生效日期时间轴 | 已就绪 |
| `tenant_id` | 006_tenants.sql:53-68 | 租户隔离 | 已就绪 |
| `deleted_at` | 015_articles_version_soft_delete.sql:8 | 软删除过滤 | 已就绪 |
| `version` | 015_articles_version_soft_delete.sql:5 | 乐观锁 | 已就绪 |

**现有条件索引 (报告查询友好):**

| 索引名 | 位置 | 作用 |
|--------|------|------|
| `idx_articles_domain` | 030:152-154 | 按 `(tenant_id, domain_root, domain_sub)` 索引，`WHERE deleted_at IS NULL` |
| `idx_articles_authority` | 030:157-159 | 按 `(tenant_id, authority_level)` 索引 |
| `idx_articles_region` | 030:162-164 | 按 `(tenant_id, region_code)` 索引 |
| `idx_articles_effective_date` | 030:167-169 | 按 `(tenant_id, effective_date DESC)` 索引 |
| `idx_articles_tenant_deleted_at` | 015:11-12 | 按 `(tenant_id, deleted_at)` 索引 |

**缺失的报告相关表:**

| 编号 | 缺失表/字段 | 用途 | 优先级 |
|------|------------|------|--------|
| D-2.3.1 | `reports` 表 | 存储报告元数据 (id, tenant_id, title, type, date_range, status, file_url, created_by, created_at) | 必须 |
| D-2.3.2 | `report_templates` 表 | 存储自定义报告模板 (id, tenant_id, name, body_html, variables_schema) | 建议 |
| D-2.3.3 | `report_schedules` 表 | 定时报告调度 (id, tenant_id, template_id, cron_expr, recipients) | 建议 |
| D-2.3.4 | `report_snapshots` 表 | 报告生成时的统计数据快照 (避免历史报告数据漂移) | 建议 |

**索引优化建议:**

- 报告生成涉及大范围 `created_at` 扫描。当前 `idx_articles_created` (001:78) 按 `created_at DESC` 索引但不含 `tenant_id` 前缀。建议为报告场景添加 `(tenant_id, created_at DESC) WHERE deleted_at IS NULL` 复合索引。
- `importance` 字段缺少独立条件索引 (`idx_articles_authority` 存在但 `idx_articles_importance` 不存在)，影响重要性分布查询性能。

---

### 2.4 API 层

#### 源文件: `crates/law-eye-api/src/routes/statistics/mod.rs`, `handlers.rs`, `dto.rs`

**现有端点的可复用性:**

| 端点 | 路径 | HTTP 方法 | 报告用途 | 可复用 |
|------|------|----------|---------|--------|
| `get_regional` | `/api/v1/statistics/regional` | GET | 地域章节数据 | 是 |
| `get_industry` | `/api/v1/statistics/industry` | GET | 行业章节数据 | 是 |
| `get_importance` | `/api/v1/statistics/importance` | GET | 重要性章节数据 | 是 |
| `get_authority` | `/api/v1/statistics/authority` | GET | 权威等级章节数据 | 是 |
| `get_issuer` | `/api/v1/statistics/issuer` | GET | 发布机构章节数据 | 是 |
| `get_cross_dimensional` | `/api/v1/statistics/cross` | GET | 交叉分析章节 | 是 |
| `get_timeline` | `/api/v1/statistics/timeline` | GET | 趋势章节数据 | 是 |
| `get_overview` | `/api/v1/statistics/overview` | GET | 报告封面概览 | 是 |

**架构验证 (良好实践):**

1. **DTO 分离** (dto.rs): 请求参数和响应各有独立的 DTO 结构体，且带 `#[serde(deny_unknown_fields)]` 防止前端传递未知参数。
2. **OpenAPI 注册** (mod.rs:28-214): 所有 8 个端点都有 `#[utoipa::path]` 注解，已注册到 `openapi.rs` (第 117-124 行)。
3. **权限控制** (routes/mod.rs:354-355): statistics 路由挂载在 `require_permission(..., "articles:read")` 下，与文章查看权限一致。
4. **AppState 集成** (state.rs:59): `statistics_service: Arc<StatisticsService>` 已集成到 `AppState`，初始化于 `from_deps()` (第 121 行)。

**缺失的报告相关端点:**

| 编号 | 缺失端点 | 方法 | 用途 |
|------|---------|------|------|
| A-2.4.1 | `/api/v1/reports` | GET | 列出当前租户的报告列表 |
| A-2.4.2 | `/api/v1/reports` | POST | 创建/生成新报告 (触发异步任务) |
| A-2.4.3 | `/api/v1/reports/{id}` | GET | 获取单个报告详情 |
| A-2.4.4 | `/api/v1/reports/{id}/download` | GET | 下载报告 PDF/HTML |
| A-2.4.5 | `/api/v1/reports/{id}` | DELETE | 删除报告 |
| A-2.4.6 | `/api/v1/reports/preview` | POST | 预览报告 (返回 HTML 片段) |
| A-2.4.7 | `/api/v1/report-templates` | CRUD | 报告模板管理 |
| A-2.4.8 | `/api/v1/report-schedules` | CRUD | 定时报告调度管理 |

---

### 2.5 前端组件

#### 源文件: `apps/web/src/app/analytics/page.tsx`, `apps/web/src/components/statistics/`

**analytics 页面的图表组件可复用评估:**

当前前端统计体系已相当完整：

| 组件 | 路径 | 图表库 | 报告复用评估 |
|------|------|--------|------------|
| `ChinaMap` | `statistics/regional/china-map.tsx` | echarts (动态 import) | 仅浏览器端渲染，无法直接用于 PDF 生成 |
| `RegionalPanel` | `statistics/regional/regional-panel.tsx` | - | Tab 面板组件，可参考布局 |
| `RegionRankingTable` | `statistics/regional/region-ranking-table.tsx` | 原生 HTML | 表格可复用 |
| `DomainPieChart` | `statistics/industry/domain-pie-chart.tsx` | recharts | 可复用 |
| `DomainBarChart` | `statistics/industry/domain-bar-chart.tsx` | recharts | 可复用 |
| `ImportanceBarChart` | `statistics/importance/importance-bar-chart.tsx` | recharts | 可复用 |
| `AuthorityChart` | `statistics/importance/authority-chart.tsx` | recharts | 可复用 |
| `IssuerRanking` | `statistics/importance/issuer-ranking.tsx` | recharts | 可复用 |
| `CrossHeatmap` | `statistics/cross/cross-heatmap.tsx` | echarts | 仅浏览器端 |
| `TimelineChart` | `statistics/cross/timeline-chart.tsx` | recharts | 可复用 |
| `RiskDistributionChart` | `statistics/overview/risk-distribution-chart.tsx` | recharts | 可复用 |
| `SentimentChart` | `statistics/overview/sentiment-chart.tsx` | recharts | 可复用 |
| `TrendChart` | `statistics/overview/trend-chart.tsx` | recharts | 可复用 |
| `AnalyticsTabs` | `statistics/analytics-tabs.tsx` | 原生 UI | Tab 导航，报告管理页参考 |

**Tab 布局** (page.tsx:66-105): 使用 `useState<AnalyticsTab>` 管理 5 个 Tab (overview / regional / industry / importance / cross)。布局模式可复用。

**Hooks** (`use-statistics.ts`): 7 个数据获取 hooks 已就绪:
- `useRegionalStats` (第 138-152 行)
- `useIndustryStats` (第 154-165 行)
- `useImportanceStats` (第 167-176 行)
- `useAuthorityStats` (第 179-187 行)
- `useIssuerStats` (第 189-200 行)
- `useCrossDimensional` (第 202-212 行)
- `useTimelineByDimension` (第 214-236 行)

**常量系统** (`statistics/constants.ts`): 完整定义了 `DOMAIN_LABELS`、`IMPORTANCE_LABELS`、`IMPORTANCE_COLORS`、`AUTHORITY_LABELS`、`RISK_COLORS`、`SENTIMENT_COLORS`、`DIMENSION_COLORS`、`DOMAIN_COLORS`。

**缺失的报告相关组件:**

| 编号 | 缺失组件 | 用途 |
|------|---------|------|
| F-2.5.1 | `ReportListPage` | 报告列表管理页面 (CRUD) |
| F-2.5.2 | `ReportEditor` | 报告编辑器 (选择时间范围、模板、章节) |
| F-2.5.3 | `ReportPreview` | 报告预览组件 (iframe 嵌入 HTML) |
| F-2.5.4 | `ReportTemplateEditor` | 模板编辑器 (可视化拖拽) |
| F-2.5.5 | `ReportDownloadButton` | 下载按钮 (PDF/HTML 格式选择) |
| F-2.5.6 | `ReportScheduleForm` | 定时报告调度配置表单 |
| F-2.5.7 | 服务端图表渲染方案 | echarts/recharts 图表无法直接在 Rust PDF 渲染中使用 |

---

### 2.6 基础设施

#### 源文件: `docker-compose.yml`

**各基础设施的就绪程度评估:**

| 基础设施 | docker-compose 位置 | 报告功能用途 | 就绪状态 | 说明 |
|----------|-------------------|------------|---------|------|
| **PostgreSQL** | 第 2-29 行 | 报告元数据存储、统计数据查询 | **已就绪** | pgvector 扩展已包含，自定义 Dockerfile 构建 |
| **Redis** | 第 68-89 行 | 报告生成任务队列、缓存 | **已就绪** | AOF 持久化已配置，密码保护 |
| **MinIO** | 第 109-131 行 | 报告文件 (PDF/HTML) 存储 | **已就绪** | S3 兼容 API，API 已有 ObjectService 集成 |
| **browserless** | 第 302-320 行 | HTML -> PDF 渲染 | **有条件就绪** | 已配置但在 `profiles: ["crawler"]` 下，非默认启动；Worker 中已有 `LAW_EYE__BROWSERLESS__URL` 环境变量 (第 228 行) |
| **n8n** | 第 278-300 行 | 工作流自动化/定时触发报告 | **有条件就绪** | `profiles: ["n8n"]`，非默认启动；已配置 `LAW_EYE_API_URL` |

**详细分析:**

1. **MinIO -> 报告文件存储:**
   - API 服务已配置完整的 MinIO 连接 (docker-compose.yml:175-181)
   - `ObjectService` 已在 `AppState` 中注册 (state.rs:49)
   - SSE 加密已启用 (`LAW_EYE__OBJECT_STORAGE__SSE_ENABLED: true`, 第 182 行)
   - 报告 PDF 可直接存入 MinIO bucket，通过已有的 `objects` API 路由下载
   - **缺失**: 需要为报告创建专用 bucket 或使用键前缀隔离

2. **browserless -> PDF 渲染:**
   - Chromium 版本 v2.24.2 (第 303 行)
   - 已配置并发限制 (`MAX_CONCURRENT_SESSIONS`, 第 307 行) 和超时 (`CONNECTION_TIMEOUT`, 第 308 行)
   - Worker 服务已引用 browserless URL (第 228 行)
   - **关键限制**: 当前在 `profiles: ["crawler"]` 中，报告功能需要将其提升为默认启动，或创建单独的 profile
   - **Rust 端集成**: `law-eye-worker/Cargo.toml` 中应有 HTTP 客户端可调用 browserless API
   - **备选方案**: 考虑使用 `wkhtmltopdf` 或 `weasyprint` 等无头渲染工具，避免对 browserless 的重度依赖

3. **Redis -> 异步任务队列:**
   - `TaskQueue` 已在 `AppState` 中 (state.rs:50)
   - Worker 服务已配置完整的 Redis 连接 (docker-compose.yml:214)
   - 报告生成可作为异步任务推入队列，Worker 消费执行
   - **缺失**: 需要定义报告生成的任务类型和 payload schema

4. **n8n -> 定时报告触发:**
   - 已配置 `LAW_EYE_API_URL=http://api:3001` (第 288 行)
   - 可通过 n8n Webhook 节点触发报告生成 API
   - 可通过 n8n Email 节点发送报告邮件
   - **限制**: 依赖外部 Docker 镜像拉取，在受限网络环境可能不可用

---

## 三、技术债清单

| 编号 | 技术债描述 | 影响范围 | 严重等级 | 建议处理方式 |
|------|-----------|---------|---------|------------|
| TD-001 | `EmailTemplateEngine` 使用 `format!()` 硬编码 HTML (template.rs:56-184)，无法动态更新模板 | 邮件/报告渲染 | **高** | 引入 `tera` 或 `minijinja` 模板引擎，将 HTML 模板分离为独立文件 |
| TD-002 | `render_article()` 无 HTML 实体转义 (template.rs:250-270)，存在 XSS 注入风险 | 安全性 | **高** | 对所有用户输入内容使用 `html_escape::encode_safe()` |
| TD-003 | Footer 占位符 `{{unsubscribe_url}}` 等未被替换 (template.rs:303-305) | 邮件功能 | **中** | 在渲染流程中添加占位符替换步骤 |
| TD-004 | `EmailTemplate` trait 未被实现 (template.rs:33-35)，设计意图未完成 | 架构完整性 | **低** | 实现 trait 或移除；在报告引擎设计中统一 |
| TD-005 | `useCrossDimensional` hook 使用 `dim_x`/`dim_y` 参数名 (use-statistics.ts:207)，但后端 DTO 期望 `dimension_x`/`dimension_y` (dto.rs:33-34)，请求将返回 400 | 前端功能 | **高** | 修正 query string 参数名为 `dimension_x` 和 `dimension_y` |
| TD-006 | `CrossPanel` 组件的 `DimensionKey` 使用数据库列名 `domain_root`/`authority_level`/`region_code` (cross-panel.tsx:17)，但后端 `dimension_to_column()` 期望 `domain`/`authority`/`region` (statistics.rs:857-864) | 前端功能 | **高** | 前端 DimensionKey 应映射为后端 dimension 名称 |
| TD-007 | `SubDomainCount` 前端类型包含不存在的 `label` 字段 (use-statistics.ts:29)，后端 `SubDomainCountDto` 仅有 `domain_sub` + `count` (dto.rs:84-87) | 类型安全 | **低** | 移除前端 `SubDomainCount.label` 字段 |
| TD-008 | `DomainCount` 前端类型包含不存在的 `domain_sub` 字段 (use-statistics.ts:34)，后端 `DomainCountDto` 无此字段 | 类型安全 | **低** | 移除前端 `DomainCount.domain_sub` 字段 |
| TD-009 | `region_code_to_name()` 使用线性遍历 (statistics.rs:47-51)，34 省份虽少但在批量场景下不高效 | 性能 | **低** | 改为 `phf::Map` 或 `HashMap::from(...)` |
| TD-010 | 统计服务每个查询方法都执行 2 次 SQL (一次聚合 + 一次总计)，报告生成时共需 16+ 次查询 | 性能 | **中** | 合并为单次 CTE 查询；或提供批量接口 |
| TD-011 | `ChinaMap` 组件运行时从 `geo.datav.aliyun.com` 拉取 GeoJSON (china-map.tsx:29)，无本地回退 | 可用性 | **中** | 将 GeoJSON 打包为本地静态资源 |
| TD-012 | `AppState::new()` 参数超过 14 个 (state.rs:135-168)，已有 `#[allow(clippy::too_many_arguments)]` 抑制 | 架构可维护性 | **低** | 已通过 `from_deps(AppBootstrapDeps)` 缓解 (state.rs:72) |

---

## 四、关键差距分析 (Gap Analysis)

| 能力维度 | 现有能力 | 目标能力 | 差距等级 |
|---------|---------|---------|---------|
| **模板引擎** | `format!()` 硬编码日报 HTML | 可配置模板、支持多报告类型、租户自定义 | **大** |
| **统计数据** | 7 个维度聚合 + overview | 批量数据获取、同比/环比、TOP N 文章 | **小** |
| **API 端点** | 8 个统计 GET 端点 | 报告 CRUD + 模板管理 + 调度管理 (~10 新端点) | **大** |
| **数据库** | articles 表含所有统计字段 | 缺少 reports/templates/schedules 3 张表 | **中** |
| **前端图表** | 13 个图表组件 (recharts + echarts) | 服务端可渲染图表、报告编辑器、报告列表页 | **大** |
| **PDF 渲染** | browserless 已配置 (crawler profile) | 集成到报告生成流程、默认启动 | **中** |
| **文件存储** | MinIO + ObjectService 已就绪 | 报告专用 bucket/prefix、签名下载 URL | **小** |
| **异步任务** | Redis + TaskQueue 已就绪 | 报告生成任务类型定义、进度回调 | **小** |
| **定时调度** | n8n 可选配置 | 内置 cron 调度或 n8n 工作流模板 | **中** |
| **邮件发送** | 模板渲染能力存在 (有 bug) | 报告完成后邮件通知、附件或链接 | **中** |
| **权限控制** | `articles:read` 权限已绑定统计路由 | 需要独立 `reports:read`/`reports:write` 权限 | **小** |
| **HTML 转义** | 无 | 所有用户输入内容必须转义 | **小** (实现简单但影响重大) |

---

## 五、依赖风险评估

### 5.1 Rust 后端依赖

| 依赖 | 版本 | 用途 | 风险评估 |
|------|------|------|---------|
| `axum` | 0.8 | Web 框架 | **低风险**: 活跃维护，tokio 生态核心 |
| `sqlx` | 0.8 | 数据库 | **低风险**: 编译期查询检查 |
| `utoipa` | 5 | OpenAPI | **低风险**: 与 axum 0.8 兼容 |
| `chrono` | 0.4 | 日期处理 | **低风险**: 成熟稳定 |
| `serde` / `serde_json` | 1.0 | 序列化 | **低风险**: Rust 生态标准 |
| `aws-sdk-s3` | 1.121.0 | MinIO 存储 | **低风险**: AWS 官方 SDK |
| `async-openai` | 0.27 | LLM 调用 | **中风险**: 社区维护，OpenAI API 变更频繁 |
| **需新增**: `tera` / `minijinja` | - | 模板引擎 | `tera` (0.19) 成熟稳定；`minijinja` (2.x) 更轻量、Jinja2 兼容 |
| **需新增**: `html-escape` | - | HTML 转义 | 轻量级，无额外依赖 |

### 5.2 前端依赖

| 依赖 | 版本 | 用途 | 风险评估 |
|------|------|------|---------|
| `next` | ^16.1.6 | SSR 框架 | **低风险**: Vercel 维护 |
| `react` | ^19.0.0 | UI 框架 | **低风险**: React 19 稳定版 |
| `echarts` | ^6.0.0 | 地图/热力图 | **低风险**: Apache 基金会维护 |
| `echarts-for-react` | ^3.0.6 | React 封装 | **中风险**: 社区维护，需验证与 echarts 6 的兼容性 |
| `recharts` | ^2.15.0 | 图表库 | **低风险**: 活跃维护，React 19 兼容 |
| `@tanstack/react-query` | ^5.62.11 | 数据获取 | **低风险**: TanStack 生态核心 |
| `zustand` | ^5.0.2 | 状态管理 | **低风险**: 轻量级，TypeScript 优先 |
| **需新增**: 富文本编辑器 (如 `tiptap` / `lexical`) | - | 报告模板编辑 | `tiptap` 成熟但依赖较重；`lexical` (Meta) 更轻量 |

### 5.3 基础设施依赖

| 组件 | 版本/镜像 | 风险评估 |
|------|----------|---------|
| PostgreSQL | 自定义构建 (pgvector + pgcrypto) | **低风险** |
| Redis | 自定义 Dockerfile | **低风险** |
| MinIO | `alpine/minio:RELEASE.2025-10-15...` | **低风险**: 固定版本 + SHA256 锁定 (docker-compose.yml:110) |
| browserless | `ghcr.io/browserless/chromium:v2.24.2` | **中风险**: 版本较旧，Chromium 安全更新频繁；无 SHA256 锁定 |
| n8n | `docker.n8n.io/n8nio/n8n:2.4.7` | **中风险**: 外部 registry，受限网络不可拉取；已有 SHA256 锁定 |

---

## 六、批判性审查：之前实现可能遗漏的问题

### 6.1 `useCrossDimensional` 参数名不匹配导致功能完全不可用

**严重度: 高 | 影响: 交叉维度分析面板无法工作**

在 `apps/web/src/hooks/use-statistics.ts` 第 207 行:

```typescript
apiClient.get<CrossDimensionalResult>(
    `/api/v1/statistics/cross?dim_x=${encodeURIComponent(dimX)}&dim_y=${encodeURIComponent(dimY)}`,
)
```

后端 `CrossDimensionalQueryParams` (dto.rs:32-38) 使用 `#[serde(deny_unknown_fields)]` 且字段名为 `dimension_x` / `dimension_y`。前端传递 `dim_x` / `dim_y` 将触发 400 Bad Request。

**同时**, `CrossPanel` 组件 (cross-panel.tsx:17-27) 定义的 `DimensionKey` 使用数据库列名 (`domain_root`, `authority_level`, `region_code`)，而后端 `dimension_to_column()` (statistics.rs:857-864) 期望的维度名称是 `domain`, `authority`, `region`。即使修复了参数名，维度值也不匹配。

**结论**: 交叉维度分析面板目前存在双重 bug，前后端联调必然失败。

### 6.2 统计数据安全边界：SQL 注入防护不完整

**严重度: 中 | 影响: timeline_by_dimension 的 interval 拼接**

`timeline_by_dimension()` (statistics.rs:716-719) 中:

```rust
let interval = match granularity {
    "weekly" => "7 days",
    "monthly" => "1 month",
    _ => "1 day",
};
```

虽然 `interval` 值来自白名单匹配 (安全)，但随后通过 `format!()` 拼入 SQL:

```rust
let timeline_sql = format!(
    r#"WITH date_series AS (
        SELECT generate_series(..., '{interval}'::interval)
    ...
    AND a.created_at < (ds.date::timestamptz + '{interval}'::interval)
    "#,
);
```

当前实现是安全的 (因为 interval 值仅来自 3 个硬编码字符串)，但这种模式容易在后续扩展时引入问题。建议将 interval 改为参数化绑定。

### 6.3 `EmailTemplateEngine` 中 format!() 的双大括号问题

**严重度: 低 | 影响: 模板可维护性**

在 `wrap_in_layout()` (template.rs:56-184) 中，所有 CSS 的 `{` 和 `}` 都必须写成 `{{` 和 `}}`，因为 Rust `format!()` 宏使用单大括号作为占位符。这导致约 120 行 CSS 代码可读性极差，任何人修改样式都必须小心避免破坏 Rust 格式化语法。

### 6.4 Timeline 查询中 `$3` 参数类型不明确

**严重度: 中 | 影响: 数据库兼容性**

`timeline_by_dimension()` (statistics.rs:774-780) 中:

```rust
let rows: Vec<(NaiveDate, String, i64)> = sqlx::query_as(&timeline_sql)
    .bind(tenant_id)   // $1: UUID
    .bind(days)         // $2: i32
    .bind(&top_dim_values)  // $3: &Vec<String>
```

SQL 中使用 `a.{dim_col}::text = ANY($3)`，`$3` 绑定为 `&Vec<String>`。sqlx 会将其映射为 PostgreSQL 的 `text[]` 数组。但 `dim_col` 的类型可能不是 `text` (如 `importance` 是 `INT`，`authority_level` 是 `INT`)。虽然 `::text` 强制转换应该能工作，但如果索引仅存在于原始类型上，这种类型转换会导致索引失效、全表扫描。

### 6.5 前端地图数据外部依赖无回退

**严重度: 中 | 影响: 离线/内网环境不可用**

`ChinaMap` 组件 (china-map.tsx:28-29) 运行时从 `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json` 拉取中国地图 GeoJSON 数据。在内网部署、CDN 不可达或阿里云服务变更时，地图将完全无法渲染。对于报告生成场景 (尤其是服务端渲染 PDF)，这个外部依赖更为致命。

### 6.6 browserless 缺乏 Token 保护的默认行为

**严重度: 中 | 影响: 安全性**

docker-compose.yml 第 309 行:

```yaml
TOKEN: ${BROWSERLESS_TOKEN:-}
```

`BROWSERLESS_TOKEN` 默认为空字符串，意味着任何能访问 browserless 端口的进程都可以使用其 API 执行任意网页渲染。虽然端口绑定了 `127.0.0.1` (第 311 行)，但在 Docker 网络内部 (`law-eye-network`)，其他容器可通过 `browserless:3000` 无认证访问。

### 6.7 Worker 与 API 共享数据库连接但无独立连接池管控

**严重度: 低 | 影响: 报告生成场景的资源竞争**

Worker (docker-compose.yml:211) 和 API (docker-compose.yml:167) 共享同一 PostgreSQL 实例，各配置 `MAX_CONNECTIONS: 10`。报告生成涉及大量聚合查询 (可能持续数秒)，可能占用 Worker 连接池导致爬虫任务阻塞。建议为报告生成使用独立的 statement timeout 或连接优先级。

### 6.8 模板引擎与统计服务之间缺少"报告上下文"中间层

**严重度: 中 | 影响: 架构可扩展性**

当前架构中:
- `StatisticsService` 返回的是原始统计数据 (counts, percentages)
- `EmailTemplateEngine` 直接消费 `DailyDigest` 结构体

两者之间缺少一个"报告上下文" (ReportContext) 层，负责:
1. 将多个统计维度的数据聚合为一个统一的报告变量集
2. 生成文案 (如 "本月北京地区法规数量同比增长 15%")
3. 决定哪些章节需要包含 (如某维度覆盖率过低则跳过)
4. 预渲染图表为静态图片 (SVG/PNG)

没有这一层，报告生成逻辑将分散在 API handler 中，难以维护和测试。

---

> **审计结论**: 现有系统在数据采集和统计分析层已具备较好的基础 (7 个维度聚合、完整的数据库字段和索引、13 个前端图表组件)。报告生成功能的主要差距集中在 **模板引擎** (从 `format!()` 升级为真正的模板系统)、**报告管理全链路** (CRUD API + 前端页面)、**PDF 渲染集成** (browserless 从 crawler profile 提升到标准启动) 三个领域。同时存在 2 个高优先级 bug (交叉维度前后端参数不匹配、HTML 转义缺失) 需要在启动报告功能开发前优先修复。
