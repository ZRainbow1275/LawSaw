# 命题四：周报生成功能 — API 设计文档

> 文档编号: RPT-API-004
> 版本: 1.0
> 更新日期: 2026-02-13
> 状态: 设计评审中
> 依赖: [02-architecture-design.md](./02-architecture-design.md)

---

## 目录

1. [设计原则与约定](#一设计原则与约定)
2. [报告 API (/api/v1/reports)](#二报告-api-apiv1reports)
3. [模板 API (/api/v1/report-templates)](#三模板-api-apiv1report-templates)
4. [权限矩阵](#四权限矩阵)
5. [前端 TypeScript 类型定义](#五前端-typescript-类型定义)
6. [OpenAPI 路由注册代码](#六openapi-路由注册代码)
7. [错误响应规范](#七错误响应规范)

---

## 一、设计原则与约定

### 1.1 遵循项目已有模式

| 约定 | 说明 | 参考来源 |
|:-----|:-----|:---------|
| 认证提取 | `AuthSession` extractor，通过 `auth_session.user.ok_or_else(...)` 获取用户 | `statistics/handlers.rs` |
| 查询参数 | 使用 `ApiQuery<T>` wrapper | `statistics/mod.rs` |
| JSON Body | 使用 `ApiJson<T>` wrapper | `articles.rs` |
| 返回类型 | `ApiResult<Json<T>>` 或 `ApiResult<Response>` | 全局约定 |
| 分页 | `offset/limit` 模式，返回 `{ data, total, limit, offset }` | `ArticleListResponse` |
| 乐观并发 | `If-Match: "v{version}"` 头部 + `ETag` 响应 | `articles.rs` (etag_for_version) |
| 租户隔离 | `user.tenant_id` 传入 Service 层 | `statistics/handlers.rs` |
| 软删除 | `DELETE` 端点执行软删除（设置 `deleted_at`） | 全局约定 |
| DTO 命名 | Request: `XxxRequest`，Response: `XxxResponse` | `feedbacks.rs`, `webhooks.rs` |
| 路径参数 | `/{id}` 风格（axum 0.8） | `sources.rs` |

### 1.2 通用查询参数

```rust
/// 报告列表通用分页 + 过滤参数
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReportListQueryParams {
    pub offset: Option<i64>,     // 默认 0
    pub limit: Option<i64>,      // 默认 20, 最大 100
    pub status: Option<String>,  // draft|generating|review|approved|published|archived
    pub period_type: Option<String>,  // weekly|monthly|quarterly|custom
    pub date_from: Option<NaiveDate>, // period_start >= date_from
    pub date_to: Option<NaiveDate>,   // period_end <= date_to
    pub search: Option<String>,       // 模糊搜索 title
    pub sort_by: Option<String>,      // created_at|updated_at|period_start (默认 created_at)
    pub sort_order: Option<String>,   // asc|desc (默认 desc)
}
```

```typescript
interface ReportListQuery {
  offset?: number;
  limit?: number;
  status?: ReportStatus;
  period_type?: ReportPeriodType;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;
  search?: string;
  sort_by?: "created_at" | "updated_at" | "period_start";
  sort_order?: "asc" | "desc";
}
```

---

## 二、报告 API (/api/v1/reports)

### 2.1 GET /api/v1/reports — 报告列表

**描述**：获取当前租户的报告列表，支持分页、过滤和排序。

**权限要求**：`reports:read`

#### 请求

```
GET /api/v1/reports?offset=0&limit=20&status=draft&period_type=weekly
```

Query Parameters: 参见 [1.2 通用查询参数](#12-通用查询参数)

#### Rust DTO

```rust
// 已在 1.2 定义: ReportListQueryParams

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportListResponse {
    pub data: Vec<ReportSummaryDto>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportSummaryDto {
    pub id: Uuid,
    pub title: String,
    pub report_number: Option<String>,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub status: String,
    pub author_id: Uuid,
    pub author_name: Option<String>,
    pub reviewer_id: Option<Uuid>,
    pub reviewer_name: Option<String>,
    pub template_id: Option<Uuid>,
    pub template_name: Option<String>,
    pub has_pdf: bool,
    pub has_docx: bool,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

#### TypeScript

```typescript
interface ReportListResponse {
  data: ReportSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface ReportSummary {
  id: string;
  title: string;
  report_number: string | null;
  period_type: ReportPeriodType;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  author_id: string;
  author_name: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  template_id: string | null;
  template_name: string | null;
  has_pdf: boolean;
  has_docx: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    get,
    path = "/api/v1/reports",
    params(
        ("offset" = Option<i64>, Query, description = "Pagination offset (default 0)"),
        ("limit" = Option<i64>, Query, description = "Pagination limit (default 20, max 100)"),
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("period_type" = Option<String>, Query, description = "Filter by period type"),
        ("date_from" = Option<String>, Query, description = "Period start >= date (YYYY-MM-DD)"),
        ("date_to" = Option<String>, Query, description = "Period end <= date (YYYY-MM-DD)"),
        ("search" = Option<String>, Query, description = "Search by title"),
        ("sort_by" = Option<String>, Query, description = "Sort field: created_at|updated_at|period_start"),
        ("sort_order" = Option<String>, Query, description = "Sort order: asc|desc")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report list", body = ReportListResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn list_reports(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<ReportListQueryParams>,
) -> ApiResult<Json<ReportListResponse>> { ... }
```

#### 示例响应

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "法律合规周报 2026年第7周",
      "report_number": "LAW-WR-2026-W07",
      "period_type": "weekly",
      "period_start": "2026-02-10",
      "period_end": "2026-02-16",
      "status": "draft",
      "author_id": "user-uuid-1",
      "author_name": "张三",
      "reviewer_id": null,
      "reviewer_name": null,
      "template_id": "tpl-uuid-1",
      "template_name": "法律合规周报",
      "has_pdf": false,
      "has_docx": false,
      "version": 1,
      "created_at": "2026-02-16T08:00:00Z",
      "updated_at": "2026-02-16T08:00:00Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

### 2.2 POST /api/v1/reports — 创建报告

**描述**：手动创建一份报告草稿。如果指定了 `template_id`，将从模板复制章节结构。

**权限要求**：`reports:write`

#### 请求

```
POST /api/v1/reports
Content-Type: application/json
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateReportRequest {
    /// 报告标题 (1-200 字符)
    pub title: String,
    /// 报告期间类型
    pub period_type: String, // weekly|monthly|quarterly|custom
    /// 期间起始日
    pub period_start: NaiveDate,
    /// 期间结束日
    pub period_end: NaiveDate,
    /// 关联模板 ID (可选)
    pub template_id: Option<Uuid>,
    /// 初始内容 (可选, 不提供则从模板填充或为空)
    pub content: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ReportDetailResponse {
    pub id: Uuid,
    pub title: String,
    pub report_number: Option<String>,
    pub period_type: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub template_id: Option<Uuid>,
    pub template_name: Option<String>,
    pub content: serde_json::Value,
    pub status: String,
    pub author_id: Uuid,
    pub author_name: Option<String>,
    pub reviewer_id: Option<Uuid>,
    pub reviewer_name: Option<String>,
    pub approved_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
    pub pdf_object_key: Option<String>,
    pub docx_object_key: Option<String>,
    pub html_object_key: Option<String>,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

#### TypeScript

```typescript
interface CreateReportRequest {
  title: string;
  period_type: ReportPeriodType;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  template_id?: string;
  content?: ReportContent;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    post,
    path = "/api/v1/reports",
    request_body = CreateReportRequest,
    security(("session" = [])),
    responses(
        (status = 201, description = "Report created", body = ReportDetailResponse),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn create_report(
    state: State<AppState>,
    auth_session: AuthSession,
    body: ApiJson<CreateReportRequest>,
) -> ApiResult<(StatusCode, Json<ReportDetailResponse>)> { ... }
```

#### 验证规则

| 字段 | 规则 |
|:-----|:-----|
| `title` | 非空, 1-200 字符, trim 后验证 |
| `period_type` | 必须为 `weekly\|monthly\|quarterly\|custom` |
| `period_start` | 合法日期 |
| `period_end` | 合法日期, `>= period_start` |
| `template_id` | 如果提供, 必须存在且对当前租户可见 (系统模板或本租户模板) |

#### 示例请求

```json
{
  "title": "法律合规周报 2026年第7周",
  "period_type": "weekly",
  "period_start": "2026-02-10",
  "period_end": "2026-02-16",
  "template_id": "tpl-uuid-1"
}
```

#### 示例响应 (201 Created)

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "title": "法律合规周报 2026年第7周",
  "report_number": "LAW-WR-2026-W07",
  "period_type": "weekly",
  "period_start": "2026-02-10",
  "period_end": "2026-02-16",
  "template_id": "tpl-uuid-1",
  "template_name": "法律合规周报",
  "content": {
    "sections": {},
    "metadata": { "generated_by": "user" }
  },
  "status": "draft",
  "author_id": "user-uuid-1",
  "author_name": "张三",
  "reviewer_id": null,
  "reviewer_name": null,
  "approved_at": null,
  "published_at": null,
  "pdf_object_key": null,
  "docx_object_key": null,
  "html_object_key": null,
  "version": 1,
  "created_at": "2026-02-16T08:00:00Z",
  "updated_at": "2026-02-16T08:00:00Z"
}
```

---

### 2.3 GET /api/v1/reports/:id — 报告详情

**描述**：获取单个报告的完整信息（含结构化内容）。响应携带 `ETag` 头部用于乐观并发控制。

**权限要求**：`reports:read`

#### 请求

```
GET /api/v1/reports/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

#### Rust DTO

Response 使用 `ReportDetailResponse`（同 2.2 节定义）。

#### utoipa 注解

```rust
#[utoipa::path(
    get,
    path = "/api/v1/reports/{id}",
    params(
        ("id" = Uuid, Path, description = "Report ID")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report detail", body = ReportDetailResponse,
         headers(
             ("ETag" = String, description = "Version tag for optimistic concurrency")
         )),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Report not found"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn get_report(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> { ... }
```

#### 响应头

```
HTTP/1.1 200 OK
ETag: "v3"
Content-Type: application/json
```

#### 示例响应

与 2.2 节的 `ReportDetailResponse` 结构相同。

---

### 2.4 PUT /api/v1/reports/:id — 更新报告内容

**描述**：更新报告的标题和/或结构化内容。需要 `If-Match` 头部进行乐观并发控制。更新成功后自动创建版本快照。

**权限要求**：`reports:write`

**前置条件**：报告状态必须为 `draft`。

#### 请求

```
PUT /api/v1/reports/a1b2c3d4-...
Content-Type: application/json
If-Match: "v3"
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateReportRequest {
    /// 更新标题 (可选)
    pub title: Option<String>,
    /// 更新结构化内容 (可选, 整体替换)
    pub content: Option<serde_json::Value>,
    /// 变更摘要 (可选, 用于快照)
    pub change_summary: Option<String>,
}
```

#### TypeScript

```typescript
interface UpdateReportRequest {
  title?: string;
  content?: ReportContent;
  change_summary?: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    put,
    path = "/api/v1/reports/{id}",
    params(
        ("id" = Uuid, Path, description = "Report ID")
    ),
    request_body = UpdateReportRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Report updated", body = ReportDetailResponse,
         headers(
             ("ETag" = String, description = "New version tag")
         )),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Report not found"),
        (status = 409, description = "Version conflict (stale If-Match)"),
        (status = 412, description = "Precondition required (missing If-Match)"),
        (status = 422, description = "Invalid status for update (not in draft)"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn update_report(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    body: ApiJson<UpdateReportRequest>,
) -> ApiResult<Response> { ... }
```

#### 验证规则

| 字段 | 规则 |
|:-----|:-----|
| `If-Match` | 必填, 格式 `"v{version}"` |
| `title` | 如果提供: 非空, 1-200 字符 |
| `content` | 如果提供: 合法 JSON object |
| `change_summary` | 如果提供: 最大 500 字符 |
| 状态检查 | 报告 `status` 必须为 `draft`, 否则返回 422 |

#### 示例请求

```json
{
  "content": {
    "sections": {
      "executive_summary": {
        "markdown": "## 本周要闻\n\n1. 新法规发布...",
        "html": "<h2>本周要闻</h2><ol><li>新法规发布...</li></ol>"
      }
    },
    "metadata": {
      "generated_by": "user"
    }
  },
  "change_summary": "更新执行摘要章节"
}
```

---

### 2.5 DELETE /api/v1/reports/:id — 软删除报告

**描述**：软删除报告（设置 `deleted_at` 时间戳）。

**权限要求**：`reports:write`

#### 请求

```
DELETE /api/v1/reports/a1b2c3d4-...
```

#### Rust DTO

```rust
#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteReportResponse {
    pub success: bool,
    pub message: String,
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    delete,
    path = "/api/v1/reports/{id}",
    params(
        ("id" = Uuid, Path, description = "Report ID")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Report deleted", body = DeleteReportResponse),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Report not found"),
        (status = 422, description = "Cannot delete published/archived report"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn delete_report(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteReportResponse>> { ... }
```

#### 业务规则

- `published` 和 `archived` 状态的报告不允许删除，返回 422
- 其他状态 (`draft`, `generating`, `review`, `approved`) 允许软删除

#### 示例响应

```json
{
  "success": true,
  "message": "Report deleted"
}
```

---

### 2.6 POST /api/v1/reports/:id/status — 状态变更

**描述**：执行报告状态流转。遵循架构设计中定义的状态机。

**权限要求**：变更到 `review` / `draft` 需要 `reports:write`；变更到 `approved` / `published` / `archived` 需要 `reports:publish`。

#### 请求

```
POST /api/v1/reports/a1b2c3d4-.../status
Content-Type: application/json
If-Match: "v5"
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ChangeStatusRequest {
    /// 目标状态
    pub status: String, // review|draft|approved|published|archived
    /// 变更原因 (退回/审批时可填写)
    pub reason: Option<String>,
    /// 审阅人 ID (提交审阅时指定)
    pub reviewer_id: Option<Uuid>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ChangeStatusResponse {
    pub id: Uuid,
    pub previous_status: String,
    pub current_status: String,
    pub changed_at: DateTime<Utc>,
    pub version: i64,
}
```

#### TypeScript

```typescript
interface ChangeStatusRequest {
  status: "review" | "draft" | "approved" | "published" | "archived";
  reason?: string;
  reviewer_id?: string;
}

interface ChangeStatusResponse {
  id: string;
  previous_status: ReportStatus;
  current_status: ReportStatus;
  changed_at: string;
  version: number;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    post,
    path = "/api/v1/reports/{id}/status",
    params(
        ("id" = Uuid, Path, description = "Report ID")
    ),
    request_body = ChangeStatusRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Status changed", body = ChangeStatusResponse,
         headers(
             ("ETag" = String, description = "New version tag")
         )),
        (status = 400, description = "Invalid status transition"),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Insufficient permission for target status"),
        (status = 404, description = "Report not found"),
        (status = 409, description = "Version conflict"),
        (status = 412, description = "Precondition required (missing If-Match)"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn change_report_status(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    body: ApiJson<ChangeStatusRequest>,
) -> ApiResult<Response> { ... }
```

#### 状态转换矩阵

| 当前状态 | 目标状态 | 所需权限 | 额外动作 |
|:---------|:---------|:---------|:---------|
| `draft` | `generating` | `reports:write` | 触发 AI 自动填充 (内部使用) |
| `generating` | `draft` | `reports:write` | AI 填充完成回调 (内部使用) |
| `draft` | `review` | `reports:write` | 设置 `reviewer_id` |
| `review` | `draft` | `reports:write` | 退回修改, `reason` 必填 |
| `review` | `approved` | `reports:publish` | 设置 `approved_at` |
| `approved` | `published` | `reports:publish` | 设置 `published_at` |
| `approved` | `draft` | `reports:publish` | 撤回修改 |
| `published` | `archived` | `reports:publish` | 归档 |

**注意**：`generating` 状态的转换仅供内部系统使用（AI Pipeline 回调），不通过此 API 暴露。

#### 示例请求（提交审阅）

```json
{
  "status": "review",
  "reviewer_id": "reviewer-uuid-1"
}
```

#### 示例响应

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "previous_status": "draft",
  "current_status": "review",
  "changed_at": "2026-02-16T10:00:00Z",
  "version": 6
}
```

---

### 2.7 POST /api/v1/reports/:id/export — 触发导出

**描述**：异步触发报告导出任务。报告状态不限（任何非 `generating` 状态均可导出）。返回任务 ID 用于轮询进度。

**权限要求**：`reports:export`

#### 请求

```
POST /api/v1/reports/a1b2c3d4-.../export
Content-Type: application/json
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ExportReportRequest {
    /// 导出格式
    pub format: String, // pdf|docx|html
    /// 是否强制重新生成 (覆盖已有导出文件)
    pub force: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct ExportReportResponse {
    /// 异步任务 ID (用于轮询进度)
    pub task_id: String,
    /// 导出格式
    pub format: String,
    /// 报告 ID
    pub report_id: Uuid,
    /// 当 force=false 且已有导出文件时, 直接返回下载信息
    pub already_exists: bool,
    pub message: String,
}
```

#### TypeScript

```typescript
interface ExportReportRequest {
  format: ExportFormat;
  force?: boolean;
}

interface ExportReportResponse {
  task_id: string;
  format: ExportFormat;
  report_id: string;
  already_exists: boolean;
  message: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    post,
    path = "/api/v1/reports/{id}/export",
    params(
        ("id" = Uuid, Path, description = "Report ID")
    ),
    request_body = ExportReportRequest,
    security(("session" = [])),
    responses(
        (status = 202, description = "Export task accepted", body = ExportReportResponse),
        (status = 200, description = "Export already exists (force=false)", body = ExportReportResponse),
        (status = 400, description = "Invalid format"),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Report not found"),
        (status = 422, description = "Report is in generating status"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn export_report(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    body: ApiJson<ExportReportRequest>,
) -> ApiResult<(StatusCode, Json<ExportReportResponse>)> { ... }
```

#### 验证规则

| 字段 | 规则 |
|:-----|:-----|
| `format` | 必须为 `pdf\|docx\|html` |
| `force` | 默认 `false` |
| 状态检查 | `generating` 状态下不允许触发导出 |

#### 示例请求

```json
{
  "format": "pdf",
  "force": false
}
```

#### 示例响应 (202 Accepted)

```json
{
  "task_id": "export-task-uuid-1",
  "format": "pdf",
  "report_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "already_exists": false,
  "message": "Export task queued"
}
```

---

### 2.8 GET /api/v1/reports/:id/download/:format — 下载导出文件

**描述**：下载已导出的报告文件。返回 302 重定向到 MinIO pre-signed URL。如果文件尚未生成，返回 404。

**权限要求**：`reports:read`

#### 请求

```
GET /api/v1/reports/a1b2c3d4-.../download/pdf
```

#### Rust DTO

无 Request Body。Response 为 302 重定向或错误。

```rust
#[derive(Debug, Serialize, ToSchema)]
pub struct DownloadNotReadyResponse {
    pub message: String,
    pub report_id: Uuid,
    pub format: String,
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    get,
    path = "/api/v1/reports/{id}/download/{format}",
    params(
        ("id" = Uuid, Path, description = "Report ID"),
        ("format" = String, Path, description = "Export format: pdf|docx|html")
    ),
    security(("session" = [])),
    responses(
        (status = 302, description = "Redirect to pre-signed download URL"),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Report or export not found", body = DownloadNotReadyResponse),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn download_report(
    state: State<AppState>,
    auth_session: AuthSession,
    Path((id, format)): Path<(Uuid, String)>,
) -> ApiResult<Response> { ... }
```

#### 响应说明

- **302 Found**: `Location` 头部指向 MinIO pre-signed URL（有效期 15 分钟）
- **404 Not Found**: 报告不存在，或请求的格式尚未生成

#### 示例响应 (302)

```
HTTP/1.1 302 Found
Location: https://minio.internal/reports/tenant-id/report-id/v3.pdf?X-Amz-Signature=...
```

---

### 2.9 POST /api/v1/reports/generate — 自动生成报告

**描述**：根据模板和时间范围，使用 AI + 统计数据自动生成完整报告。异步执行，先返回草稿，AI 后续填充内容。

**权限要求**：`reports:write`

#### 请求

```
POST /api/v1/reports/generate
Content-Type: application/json
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GenerateReportRequest {
    /// 关联模板 ID (必填)
    pub template_id: Uuid,
    /// 期间起始日
    pub period_start: NaiveDate,
    /// 期间结束日
    pub period_end: NaiveDate,
    /// 自定义标题 (可选, 不提供则根据模板自动生成)
    pub title: Option<String>,
    /// AI 生成参数 (可选覆盖)
    pub generation_params: Option<GenerationParams>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct GenerationParams {
    /// AI 摘要最大长度 (字符)
    pub summary_max_length: Option<i32>,
    /// 仅包含重要性 >= 此值的文章
    pub min_importance: Option<i32>,
    /// 仅包含指定领域的文章
    pub domain_filter: Option<Vec<String>>,
    /// 仅包含指定区域的文章
    pub region_filter: Option<Vec<String>>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct GenerateReportResponse {
    /// 新创建的报告
    pub report: ReportDetailResponse,
    /// 后台生成任务 ID
    pub task_id: String,
    /// 提示信息
    pub message: String,
}
```

#### TypeScript

```typescript
interface GenerateReportRequest {
  template_id: string;
  period_start: string;
  period_end: string;
  title?: string;
  generation_params?: GenerationParams;
}

interface GenerationParams {
  summary_max_length?: number;
  min_importance?: number;
  domain_filter?: string[];
  region_filter?: string[];
}

interface GenerateReportResponse {
  report: ReportDetail;
  task_id: string;
  message: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    post,
    path = "/api/v1/reports/generate",
    request_body = GenerateReportRequest,
    security(("session" = [])),
    responses(
        (status = 202, description = "Report generation started", body = GenerateReportResponse),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 404, description = "Template not found"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn generate_report(
    state: State<AppState>,
    auth_session: AuthSession,
    body: ApiJson<GenerateReportRequest>,
) -> ApiResult<(StatusCode, Json<GenerateReportResponse>)> { ... }
```

#### 验证规则

| 字段 | 规则 |
|:-----|:-----|
| `template_id` | 必填, 模板必须存在且对当前租户可见 |
| `period_start` | 合法日期 |
| `period_end` | 合法日期, `>= period_start`, 距 `period_start` 不超过 366 天 |
| `title` | 如果提供: 1-200 字符 |
| `generation_params.min_importance` | 如果提供: 1-5 |

#### 处理流程

1. 创建状态为 `draft` 的报告记录
2. 将报告状态设为 `generating`
3. 将 AI 生成任务入 Redis 队列
4. 返回 202（报告 + 任务 ID）
5. Worker 消费任务：聚合数据 -> AI 生成摘要 -> 填充章节 -> 状态改回 `draft`

#### 示例请求

```json
{
  "template_id": "tpl-uuid-1",
  "period_start": "2026-02-10",
  "period_end": "2026-02-16",
  "generation_params": {
    "min_importance": 3,
    "domain_filter": ["legislation", "regulation"]
  }
}
```

#### 示例响应 (202 Accepted)

```json
{
  "report": {
    "id": "new-report-uuid",
    "title": "法律合规周报 2026年第7周",
    "report_number": "LAW-WR-2026-W07",
    "period_type": "weekly",
    "period_start": "2026-02-10",
    "period_end": "2026-02-16",
    "template_id": "tpl-uuid-1",
    "template_name": "法律合规周报",
    "content": { "sections": {}, "metadata": { "generated_by": "system" } },
    "status": "generating",
    "author_id": "user-uuid-1",
    "author_name": "张三",
    "reviewer_id": null,
    "reviewer_name": null,
    "approved_at": null,
    "published_at": null,
    "pdf_object_key": null,
    "docx_object_key": null,
    "html_object_key": null,
    "version": 1,
    "created_at": "2026-02-16T08:00:00Z",
    "updated_at": "2026-02-16T08:00:00Z"
  },
  "task_id": "gen-task-uuid-1",
  "message": "Report generation started. Content will be populated asynchronously."
}
```

---

### 2.10 GET /api/v1/reports/:id/snapshots — 版本历史

**描述**：获取报告的版本快照列表。按版本号降序排列。

**权限要求**：`reports:read`

#### 请求

```
GET /api/v1/reports/a1b2c3d4-.../snapshots?offset=0&limit=20
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SnapshotListQueryParams {
    pub offset: Option<i64>,
    pub limit: Option<i64>, // 默认 20, 最大 50
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SnapshotListResponse {
    pub data: Vec<SnapshotSummaryDto>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SnapshotSummaryDto {
    pub id: Uuid,
    pub report_id: Uuid,
    pub snapshot_version: i64,
    pub changed_by: Uuid,
    pub changed_by_name: Option<String>,
    pub change_summary: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// 用于 GET /api/v1/reports/:id/snapshots/:version (获取特定版本快照完整内容)
#[derive(Debug, Serialize, ToSchema)]
pub struct SnapshotDetailResponse {
    pub id: Uuid,
    pub report_id: Uuid,
    pub snapshot_version: i64,
    pub content: serde_json::Value,
    pub changed_by: Uuid,
    pub changed_by_name: Option<String>,
    pub change_summary: Option<String>,
    pub created_at: DateTime<Utc>,
}
```

#### TypeScript

```typescript
interface SnapshotListResponse {
  data: SnapshotSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface SnapshotSummary {
  id: string;
  report_id: string;
  snapshot_version: number;
  changed_by: string;
  changed_by_name: string | null;
  change_summary: string | null;
  created_at: string;
}

interface SnapshotDetail {
  id: string;
  report_id: string;
  snapshot_version: number;
  content: ReportContent;
  changed_by: string;
  changed_by_name: string | null;
  change_summary: string | null;
  created_at: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    get,
    path = "/api/v1/reports/{id}/snapshots",
    params(
        ("id" = Uuid, Path, description = "Report ID"),
        ("offset" = Option<i64>, Query, description = "Pagination offset (default 0)"),
        ("limit" = Option<i64>, Query, description = "Pagination limit (default 20, max 50)")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Snapshot list", body = SnapshotListResponse),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Report not found"),
        (status = 500, description = "Server error"),
    ),
    tag = "reports"
)]
pub(crate) async fn list_snapshots(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    query: ApiQuery<SnapshotListQueryParams>,
) -> ApiResult<Json<SnapshotListResponse>> { ... }
```

#### 示例响应

```json
{
  "data": [
    {
      "id": "snap-uuid-3",
      "report_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "snapshot_version": 3,
      "changed_by": "user-uuid-1",
      "changed_by_name": "张三",
      "change_summary": "更新执行摘要章节",
      "created_at": "2026-02-16T10:30:00Z"
    },
    {
      "id": "snap-uuid-2",
      "report_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "snapshot_version": 2,
      "changed_by": "user-uuid-1",
      "changed_by_name": "张三",
      "change_summary": "AI 自动填充完成",
      "created_at": "2026-02-16T08:05:00Z"
    }
  ],
  "total": 3,
  "limit": 20,
  "offset": 0
}
```

---

## 三、模板 API (/api/v1/report-templates)

### 3.1 GET /api/v1/report-templates — 模板列表

**描述**：获取对当前租户可见的所有报告模板（系统模板 + 租户私有模板）。

**权限要求**：`reports:read`

#### 请求

```
GET /api/v1/report-templates?report_type=weekly
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TemplateListQueryParams {
    pub report_type: Option<String>,  // weekly|monthly|quarterly|custom
    pub audience: Option<String>,     // management|legal_team|external_client|internal
    pub search: Option<String>,       // 模糊搜索 name
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TemplateListResponse {
    pub data: Vec<TemplateSummaryDto>,
    pub total: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TemplateSummaryDto {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub report_type: String,
    pub audience: String,
    pub is_system: bool,
    pub section_count: i32,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

#### TypeScript

```typescript
interface TemplateListQuery {
  report_type?: ReportPeriodType;
  audience?: TemplateAudience;
  search?: string;
}

interface TemplateListResponse {
  data: TemplateSummary[];
  total: number;
}

interface TemplateSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  report_type: ReportPeriodType;
  audience: TemplateAudience;
  is_system: boolean;
  section_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    get,
    path = "/api/v1/report-templates",
    params(
        ("report_type" = Option<String>, Query, description = "Filter by report type"),
        ("audience" = Option<String>, Query, description = "Filter by audience"),
        ("search" = Option<String>, Query, description = "Search by name")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Template list", body = TemplateListResponse),
        (status = 401, description = "Not authenticated"),
        (status = 500, description = "Server error"),
    ),
    tag = "report-templates"
)]
pub(crate) async fn list_templates(
    state: State<AppState>,
    auth_session: AuthSession,
    query: ApiQuery<TemplateListQueryParams>,
) -> ApiResult<Json<TemplateListResponse>> { ... }
```

#### 示例响应

```json
{
  "data": [
    {
      "id": "tpl-uuid-1",
      "name": "法律合规周报",
      "slug": "weekly-compliance",
      "description": "标准法律合规周报模板，包含立法动态、监管动向等章节",
      "report_type": "weekly",
      "audience": "internal",
      "is_system": true,
      "section_count": 12,
      "version": 1,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 3
}
```

---

### 3.2 POST /api/v1/report-templates — 创建模板

**描述**：创建租户私有的报告模板。

**权限要求**：`reports:template`

#### 请求

```
POST /api/v1/report-templates
Content-Type: application/json
```

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateTemplateRequest {
    /// 模板名称 (1-100 字符)
    pub name: String,
    /// 模板 slug (用于标识, 1-50 字符, 仅允许 a-z, 0-9, -)
    pub slug: String,
    /// 模板描述 (可选, 最大 500 字符)
    pub description: Option<String>,
    /// 报告类型
    pub report_type: String, // weekly|monthly|quarterly|custom
    /// 目标受众
    pub audience: Option<String>, // management|legal_team|external_client|internal (默认 internal)
    /// 章节结构定义 (JSON 数组)
    pub sections: serde_json::Value,
    /// 样式配置 (可选, 不提供则使用默认)
    pub style_config: Option<serde_json::Value>,
    /// HTML 模板 (Tera 语法, 可选)
    pub body_template: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TemplateDetailResponse {
    pub id: Uuid,
    pub tenant_id: Option<Uuid>,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub report_type: String,
    pub audience: String,
    pub sections: serde_json::Value,
    pub style_config: serde_json::Value,
    pub body_template: Option<String>,
    pub is_system: bool,
    pub version: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

#### TypeScript

```typescript
interface CreateTemplateRequest {
  name: string;
  slug: string;
  description?: string;
  report_type: ReportPeriodType;
  audience?: TemplateAudience;
  sections: TemplateSectionDef[];
  style_config?: StyleConfig;
  body_template?: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    post,
    path = "/api/v1/report-templates",
    request_body = CreateTemplateRequest,
    security(("session" = [])),
    responses(
        (status = 201, description = "Template created", body = TemplateDetailResponse),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Forbidden"),
        (status = 409, description = "Slug already exists"),
        (status = 500, description = "Server error"),
    ),
    tag = "report-templates"
)]
pub(crate) async fn create_template(
    state: State<AppState>,
    auth_session: AuthSession,
    body: ApiJson<CreateTemplateRequest>,
) -> ApiResult<(StatusCode, Json<TemplateDetailResponse>)> { ... }
```

#### 验证规则

| 字段 | 规则 |
|:-----|:-----|
| `name` | 非空, 1-100 字符 |
| `slug` | 非空, 1-50 字符, 正则 `^[a-z0-9][a-z0-9-]*$` |
| `report_type` | 必须为 `weekly\|monthly\|quarterly\|custom` |
| `audience` | 如果提供, 必须为 `management\|legal_team\|external_client\|internal` |
| `sections` | 合法 JSON 数组, 每项必须包含 `id`, `type`, `title`, `order` |
| `sections[].type` | 必须为 `cover\|toc\|text\|articles\|charts\|calendar\|risk\|static` |
| `sections[].order` | 正整数, 数组内唯一 |

#### 示例请求

```json
{
  "name": "自定义合规速报",
  "slug": "custom-quick-report",
  "description": "简化版合规快报，仅包含核心章节",
  "report_type": "weekly",
  "audience": "internal",
  "sections": [
    { "id": "cover", "type": "cover", "title": "封面", "order": 1, "auto_fill": true, "data_source": "report_meta" },
    { "id": "summary", "type": "text", "title": "摘要", "order": 2, "auto_fill": true, "data_source": "ai_summary" },
    { "id": "highlights", "type": "articles", "title": "重点资讯", "order": 3, "auto_fill": true, "data_source": "domain:legislation:importance>=4" },
    { "id": "disclaimer", "type": "static", "title": "免责声明", "order": 4, "auto_fill": false, "content": "仅供内部参考。" }
  ]
}
```

---

### 3.3 GET /api/v1/report-templates/:id — 模板详情

**描述**：获取单个模板的完整信息。

**权限要求**：`reports:read`

#### utoipa 注解

```rust
#[utoipa::path(
    get,
    path = "/api/v1/report-templates/{id}",
    params(
        ("id" = Uuid, Path, description = "Template ID")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Template detail", body = TemplateDetailResponse,
         headers(
             ("ETag" = String, description = "Version tag")
         )),
        (status = 401, description = "Not authenticated"),
        (status = 404, description = "Template not found"),
        (status = 500, description = "Server error"),
    ),
    tag = "report-templates"
)]
pub(crate) async fn get_template(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> { ... }
```

---

### 3.4 PUT /api/v1/report-templates/:id — 更新模板

**描述**：更新租户私有模板。系统模板 (`is_system = true`) 不允许修改。需要 `If-Match` 头部。

**权限要求**：`reports:template`

#### Rust DTO

```rust
#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub audience: Option<String>,
    pub sections: Option<serde_json::Value>,
    pub style_config: Option<serde_json::Value>,
    pub body_template: Option<String>,
}
```

#### TypeScript

```typescript
interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  audience?: TemplateAudience;
  sections?: TemplateSectionDef[];
  style_config?: StyleConfig;
  body_template?: string;
}
```

#### utoipa 注解

```rust
#[utoipa::path(
    put,
    path = "/api/v1/report-templates/{id}",
    params(
        ("id" = Uuid, Path, description = "Template ID")
    ),
    request_body = UpdateTemplateRequest,
    security(("session" = [])),
    responses(
        (status = 200, description = "Template updated", body = TemplateDetailResponse,
         headers(
             ("ETag" = String, description = "New version tag")
         )),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Cannot modify system template"),
        (status = 404, description = "Template not found"),
        (status = 409, description = "Version conflict"),
        (status = 412, description = "Precondition required (missing If-Match)"),
        (status = 500, description = "Server error"),
    ),
    tag = "report-templates"
)]
pub(crate) async fn update_template(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    body: ApiJson<UpdateTemplateRequest>,
) -> ApiResult<Response> { ... }
```

---

### 3.5 DELETE /api/v1/report-templates/:id — 删除模板

**描述**：软删除租户私有模板。系统模板不允许删除。

**权限要求**：`reports:template`

#### utoipa 注解

```rust
#[utoipa::path(
    delete,
    path = "/api/v1/report-templates/{id}",
    params(
        ("id" = Uuid, Path, description = "Template ID")
    ),
    security(("session" = [])),
    responses(
        (status = 200, description = "Template deleted", body = DeleteReportResponse),
        (status = 401, description = "Not authenticated"),
        (status = 403, description = "Cannot delete system template"),
        (status = 404, description = "Template not found"),
        (status = 422, description = "Template is in use by active reports"),
        (status = 500, description = "Server error"),
    ),
    tag = "report-templates"
)]
pub(crate) async fn delete_template(
    state: State<AppState>,
    auth_session: AuthSession,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DeleteReportResponse>> { ... }
```

#### 业务规则

- 系统模板 (`is_system = true`) 不允许删除，返回 403
- 如果有活跃报告（`deleted_at IS NULL`）引用此模板，返回 422 并提示
- 软删除仅设置 `deleted_at`，不影响已使用此模板的现有报告

---

## 四、权限矩阵

### 4.1 权限标识定义

| 权限标识 | 说明 | 覆盖的 API 端点 |
|:---------|:-----|:----------------|
| `reports:read` | 查看报告和模板 | `GET /reports`, `GET /reports/:id`, `GET /reports/:id/download/:format`, `GET /reports/:id/snapshots`, `GET /report-templates`, `GET /report-templates/:id` |
| `reports:write` | 创建、编辑报告、触发生成 | `POST /reports`, `PUT /reports/:id`, `DELETE /reports/:id`, `POST /reports/:id/status` (限 draft/review), `POST /reports/generate` |
| `reports:export` | 导出报告 | `POST /reports/:id/export` |
| `reports:template` | 管理报告模板 | `POST /report-templates`, `PUT /report-templates/:id`, `DELETE /report-templates/:id` |
| `reports:publish` | 审批和发布报告 | `POST /reports/:id/status` (限 approved/published/archived) |

### 4.2 角色-权限映射

| 角色 | `reports:read` | `reports:write` | `reports:export` | `reports:template` | `reports:publish` |
|:-----|:-:|:-:|:-:|:-:|:-:|
| `viewer` | Y | - | - | - | - |
| `editor` | Y | Y | Y | - | - |
| `admin` | Y | Y | Y | Y | Y |

### 4.3 路由注册权限配置

```rust
// 在 routes/mod.rs 中：
.nest(
    "/reports",
    require_permissions(reports::router(), "reports:read", "reports:write"),
)
.nest(
    "/report-templates",
    require_permissions(report_templates::router(), "reports:read", "reports:template"),
)
```

**注意**：`require_permissions(router, read, write)` 根据 HTTP 方法分发权限：
- `GET` / `HEAD` 请求检查 `read` 权限
- `POST` / `PUT` / `DELETE` / `PATCH` 请求检查 `write` 权限
- `reports:export` 和 `reports:publish` 需要在 handler 层额外检查

---

## 五、前端 TypeScript 类型定义

以下类型应添加到 `apps/web/src/lib/api/types.ts`。

```typescript
// ═══════════════════════════════════════════════════════════════
// Report types
// ═══════════════════════════════════════════════════════════════

export type ReportStatus =
  | "draft"
  | "generating"
  | "review"
  | "approved"
  | "published"
  | "archived";

export type ReportPeriodType =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "custom";

export type ExportFormat = "pdf" | "docx" | "html";

export type TemplateAudience =
  | "management"
  | "legal_team"
  | "external_client"
  | "internal";

export type TemplateSectionType =
  | "cover"
  | "toc"
  | "text"
  | "articles"
  | "charts"
  | "calendar"
  | "risk"
  | "static";

// ── Report interfaces ────────────────────────────────────────

export interface ReportSummary {
  id: string;
  title: string;
  report_number: string | null;
  period_type: ReportPeriodType;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  author_id: string;
  author_name: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  template_id: string | null;
  template_name: string | null;
  has_pdf: boolean;
  has_docx: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ReportListResponse {
  data: ReportSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReportSectionContent {
  markdown?: string;
  html?: string;
  articles?: Array<{
    article_id: string;
    title: string;
    summary: string;
    risk_score: number | null;
    importance: number | null;
    link: string;
  }>;
  charts?: Array<{
    chart_id: string;
    type: string;
    title: string;
    svg_object_key?: string;
    data_snapshot?: Record<string, unknown>;
  }>;
  [key: string]: unknown;
}

export interface ReportContent {
  sections: Record<string, ReportSectionContent>;
  metadata?: {
    generated_by?: "system" | "user";
    ai_model?: string;
    generation_timestamp?: string;
    data_query_params?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface ReportDetail {
  id: string;
  title: string;
  report_number: string | null;
  period_type: ReportPeriodType;
  period_start: string;
  period_end: string;
  template_id: string | null;
  template_name: string | null;
  content: ReportContent;
  status: ReportStatus;
  author_id: string;
  author_name: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  approved_at: string | null;
  published_at: string | null;
  pdf_object_key: string | null;
  docx_object_key: string | null;
  html_object_key: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateReportInput {
  title: string;
  period_type: ReportPeriodType;
  period_start: string;
  period_end: string;
  template_id?: string;
  content?: ReportContent;
}

export interface UpdateReportInput {
  title?: string;
  content?: ReportContent;
  change_summary?: string;
}

export interface ChangeStatusInput {
  status: "review" | "draft" | "approved" | "published" | "archived";
  reason?: string;
  reviewer_id?: string;
}

export interface ChangeStatusResponse {
  id: string;
  previous_status: ReportStatus;
  current_status: ReportStatus;
  changed_at: string;
  version: number;
}

export interface ExportReportInput {
  format: ExportFormat;
  force?: boolean;
}

export interface ExportReportResponse {
  task_id: string;
  format: ExportFormat;
  report_id: string;
  already_exists: boolean;
  message: string;
}

export interface GenerateReportInput {
  template_id: string;
  period_start: string;
  period_end: string;
  title?: string;
  generation_params?: {
    summary_max_length?: number;
    min_importance?: number;
    domain_filter?: string[];
    region_filter?: string[];
  };
}

export interface GenerateReportResponse {
  report: ReportDetail;
  task_id: string;
  message: string;
}

// ── Snapshot interfaces ──────────────────────────────────────

export interface SnapshotSummary {
  id: string;
  report_id: string;
  snapshot_version: number;
  changed_by: string;
  changed_by_name: string | null;
  change_summary: string | null;
  created_at: string;
}

export interface SnapshotListResponse {
  data: SnapshotSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface SnapshotDetail {
  id: string;
  report_id: string;
  snapshot_version: number;
  content: ReportContent;
  changed_by: string;
  changed_by_name: string | null;
  change_summary: string | null;
  created_at: string;
}

// ── Template interfaces ──────────────────────────────────────

export interface TemplateSectionDef {
  id: string;
  type: TemplateSectionType;
  title: string;
  order: number;
  auto_fill?: boolean;
  data_source?: string | null;
  content?: string;
}

export interface StyleConfig {
  paper_size?: string;
  margin?: {
    top_mm?: number;
    bottom_mm?: number;
    left_mm?: number;
    right_mm?: number;
  };
  font_family?: string;
  title_font_size_pt?: number;
  h1_font_size_pt?: number;
  h2_font_size_pt?: number;
  h3_font_size_pt?: number;
  body_font_size_pt?: number;
  line_spacing?: number;
  header?: {
    show_logo?: boolean;
    text?: string;
    classification?: string;
  };
  footer?: {
    text?: string;
    show_page_number?: boolean;
    show_date?: boolean;
  };
  cover?: {
    show_logo?: boolean;
    show_period?: boolean;
    show_org_name?: boolean;
    bg_color?: string;
  };
}

export interface TemplateSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  report_type: ReportPeriodType;
  audience: TemplateAudience;
  is_system: boolean;
  section_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateListResponse {
  data: TemplateSummary[];
  total: number;
}

export interface TemplateDetail {
  id: string;
  tenant_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  report_type: ReportPeriodType;
  audience: TemplateAudience;
  sections: TemplateSectionDef[];
  style_config: StyleConfig;
  body_template: string | null;
  is_system: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  name: string;
  slug: string;
  description?: string;
  report_type: ReportPeriodType;
  audience?: TemplateAudience;
  sections: TemplateSectionDef[];
  style_config?: StyleConfig;
  body_template?: string;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  audience?: TemplateAudience;
  sections?: TemplateSectionDef[];
  style_config?: StyleConfig;
  body_template?: string;
}
```

---

## 六、OpenAPI 路由注册代码

### 6.1 Axum Router 注册

```rust
// crates/law-eye-api/src/routes/reports/mod.rs

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
    Json, Router,
};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiJson, ApiQuery, ApiResult};

mod dto;
mod handlers;

pub use dto::{
    ChangeStatusResponse, CreateReportRequest, DeleteReportResponse, DownloadNotReadyResponse,
    ExportReportRequest, ExportReportResponse, GenerateReportRequest, GenerateReportResponse,
    ReportDetailResponse, ReportListResponse, SnapshotDetailResponse, SnapshotListResponse,
    UpdateReportRequest,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_reports).post(create_report))
        .route("/generate", post(generate_report))
        .route("/{id}", get(get_report).put(update_report).delete(delete_report))
        .route("/{id}/status", post(change_report_status))
        .route("/{id}/export", post(export_report))
        .route("/{id}/download/{format}", get(download_report))
        .route("/{id}/snapshots", get(list_snapshots))
}

// 各端点签名参见第二章 utoipa 注解
// ...
```

```rust
// crates/law-eye-api/src/routes/report_templates/mod.rs

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
    Json, Router,
};

use crate::auth::AuthSession;
use crate::state::AppState;
use crate::{ApiJson, ApiQuery, ApiResult};

mod dto;
mod handlers;

pub use dto::{
    CreateTemplateRequest, DeleteReportResponse, TemplateDetailResponse, TemplateListResponse,
    UpdateTemplateRequest,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_templates).post(create_template))
        .route("/{id}", get(get_template).put(update_template).delete(delete_template))
}

// 各端点签名参见第三章 utoipa 注解
// ...
```

### 6.2 主路由注册 (routes/mod.rs)

```rust
// 在 routes/mod.rs 中新增模块声明
pub mod reports;
pub mod report_templates;

// 在 create_router() 的 protected_api 中新增:
.nest(
    "/reports",
    require_permissions(reports::router(), "reports:read", "reports:write"),
)
.nest(
    "/report-templates",
    require_permissions(report_templates::router(), "reports:read", "reports:template"),
)
```

### 6.3 OpenAPI 注册 (openapi.rs)

```rust
// 在 #[openapi(paths(...))] 中新增:
crate::routes::reports::list_reports,
crate::routes::reports::create_report,
crate::routes::reports::get_report,
crate::routes::reports::update_report,
crate::routes::reports::delete_report,
crate::routes::reports::change_report_status,
crate::routes::reports::export_report,
crate::routes::reports::download_report,
crate::routes::reports::generate_report,
crate::routes::reports::list_snapshots,
crate::routes::report_templates::list_templates,
crate::routes::report_templates::create_template,
crate::routes::report_templates::get_template,
crate::routes::report_templates::update_template,
crate::routes::report_templates::delete_template,

// 在 tags(...) 中新增:
(name = "reports", description = "Report generation & management"),
(name = "report-templates", description = "Report template management"),
```

### 6.4 AppState 新增服务注入

```rust
// crates/law-eye-api/src/state.rs 中新增:
use law_eye_core::ReportService;      // 待实现
use law_eye_core::ReportTemplateService; // 待实现

// AppState struct 中新增:
pub report_service: Arc<ReportService>,
pub report_template_service: Arc<ReportTemplateService>,

// from_deps() 中新增:
report_service: Arc::new(ReportService::new(pool.clone())),
report_template_service: Arc::new(ReportTemplateService::new(pool.clone())),
```

---

## 七、错误响应规范

所有 API 端点遵循项目已有的 `AppError` 错误格式。

### 7.1 标准错误响应体

```json
{
  "error": "Error message description",
  "status": 400
}
```

对应 TypeScript:

```typescript
interface ApiError {
  error: string;
  status: number;
}
```

### 7.2 报告模块特定错误码

| HTTP Status | 错误场景 | error 内容示例 |
|:------------|:---------|:---------------|
| 400 | 参数验证失败 | `"Invalid period_type: must be weekly\|monthly\|quarterly\|custom"` |
| 400 | 非法状态转换 | `"Invalid status transition: cannot change from 'published' to 'draft'"` |
| 401 | 未认证 | `"Not authenticated"` |
| 403 | 权限不足 | `"Insufficient permission: reports:publish required"` |
| 403 | 修改系统模板 | `"Cannot modify system template"` |
| 404 | 报告不存在 | `"Report not found"` |
| 404 | 模板不存在 | `"Template not found"` |
| 404 | 导出文件不存在 | `"Export not found: PDF has not been generated yet"` |
| 409 | 版本冲突 | `"Version conflict: expected v3 but current is v5"` |
| 412 | 缺少 If-Match | `"Missing If-Match header (refresh the resource and retry)"` |
| 422 | 状态不允许操作 | `"Report is in 'published' status, cannot be edited"` |
| 422 | 模板被引用 | `"Template is referenced by 3 active reports, cannot delete"` |
| 500 | 服务端错误 | `"Internal server error"` |

---

## 附录 A: 完整端点速查表

| # | 方法 | 路径 | 权限 | 描述 | 章节 |
|:--|:-----|:-----|:-----|:-----|:-----|
| 1 | `GET` | `/api/v1/reports` | `reports:read` | 报告列表 | 2.1 |
| 2 | `POST` | `/api/v1/reports` | `reports:write` | 创建报告 | 2.2 |
| 3 | `GET` | `/api/v1/reports/:id` | `reports:read` | 报告详情 | 2.3 |
| 4 | `PUT` | `/api/v1/reports/:id` | `reports:write` | 更新报告 | 2.4 |
| 5 | `DELETE` | `/api/v1/reports/:id` | `reports:write` | 软删除报告 | 2.5 |
| 6 | `POST` | `/api/v1/reports/:id/status` | `reports:write` / `reports:publish` | 状态变更 | 2.6 |
| 7 | `POST` | `/api/v1/reports/:id/export` | `reports:export` | 触发导出 | 2.7 |
| 8 | `GET` | `/api/v1/reports/:id/download/:format` | `reports:read` | 下载文件 | 2.8 |
| 9 | `POST` | `/api/v1/reports/generate` | `reports:write` | 自动生成 | 2.9 |
| 10 | `GET` | `/api/v1/reports/:id/snapshots` | `reports:read` | 版本历史 | 2.10 |
| 11 | `GET` | `/api/v1/report-templates` | `reports:read` | 模板列表 | 3.1 |
| 12 | `POST` | `/api/v1/report-templates` | `reports:template` | 创建模板 | 3.2 |
| 13 | `GET` | `/api/v1/report-templates/:id` | `reports:read` | 模板详情 | 3.3 |
| 14 | `PUT` | `/api/v1/report-templates/:id` | `reports:template` | 更新模板 | 3.4 |
| 15 | `DELETE` | `/api/v1/report-templates/:id` | `reports:template` | 删除模板 | 3.5 |
