# API Validation & Error Contract Spec（API-002）

> 目标：对关键写入/高风险接口补齐输入校验，并把错误码与响应体收敛到可商业化、可观测、可自动化处理的稳定契约。
>
> 范围：`crates/law-eye-api/src/routes/*`（重点：auth/sources/articles/search/users/apikeys/objects/ai）。

---

## 1. 输入校验（Validation）

### 1.1 通用校验规则（所有接口适用）
- **字符串长度上限**：所有来自用户输入的字符串字段必须有限制（默认 ≤ 4KB；标题/名称 ≤ 256；slug ≤ 64；email ≤ 254）。
- **去空白**：对 `String` 字段执行 `trim()`；空字符串视为无效（除非语义允许）。
- **URL 校验**：
  - 必须是合法 URL（`url::Url` 可解析）
  - 仅允许 `http`/`https`
  - 禁止内网/本机地址（RFC1918/localhost/link-local）用于抓取类接口（防 SSRF）
  - 长度上限（≤ 2048）
- **分页参数**：`limit`/`offset` 或 `page`/`page_size` 必须有上限（例如 `limit <= 200`）。
- **枚举字段**：必须显式白名单（避免隐式兼容导致逻辑分叉）。
- **JSON 配置字段**：必须做结构校验（至少检查 object/required keys/types）；必要时细分 schema（避免“随便塞”导致 worker 崩溃）。

### 1.2 关键接口最小校验清单
- `POST /api/v1/sources`
  - `name`：1..=100
  - `url`：见 URL 校验；rss/spider 类型均必须校验
  - `source_type`：`rss | spider | api(暂不支持)`（不支持时返回稳定错误码）
  - `priority`：1..=10（或项目既定范围）
  - `schedule`：若存在，必须符合 cron/预设规则（不合法返回校验错误）
  - `config`：`spider` 类型必须包含 `list_selector/title_selector/link_selector` 非空
- `POST /api/v1/search` / `POST /api/v1/search/semantic` / `POST /api/v1/search/ask`
  - query/question：长度上限；禁止空；禁止超大 payload
- `PUT/PATCH /api/v1/articles/{id}` / 批量更新
  - 只允许白名单字段更新；状态枚举合法；批量 size 上限
- `POST /api/v1/users/avatar`
  - content-type 白名单、文件大小上限、空文件拒绝

---

## 2. 错误码与响应体（Error Contract）

### 2.1 统一错误体（保持与 `ApiError` 对齐）

```json
{
  "error": "message",
  "code": "VALIDATION_ERROR | BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | RATE_LIMITED | SERVICE_UNAVAILABLE | INTERNAL_ERROR",
  "request_id": "optional",
  "details": {}
}
```

要求：
- **code 与 HTTP status 一致**（例如 VALIDATION_ERROR → 400；UNAUTHORIZED → 401；FORBIDDEN → 403；CONFLICT → 409）
- 对外不泄漏内部异常细节（生产环境），但 `details` 可提供可安全暴露的结构化原因（如字段名/约束）

### 2.2 关键错误码（API-002 新增/收敛）
- `UNSUPPORTED_SOURCE_TYPE`：当 `source_type=api` 等尚未实现的功能被调用时（HTTP 400）
- `INVALID_URL` / `SSRF_BLOCKED`：URL 校验失败（HTTP 400）
- `PAYLOAD_TOO_LARGE`：超过 body limit 或字段超长（HTTP 413 或 400 视实现）

---

## 3. 可观测性（Observability）
- 所有错误响应必须尽可能携带 `request_id`（若请求链路已有生成逻辑）
- 对输入校验失败：记录字段级失败原因（仅在日志中，避免敏感信息回传）

---

## 4. 验收标准（API-002）
- 关键接口均具备明确输入校验与稳定错误码
- OpenAPI 文档同步更新（最少：对新增错误码/约束做描述）
- `cargo test --workspace` 通过；E2E 不回归（至少通过现有 E2E + Monkey 门禁）

