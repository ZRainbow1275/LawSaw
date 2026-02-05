# LawSaw / Law-Eye

一个面向“法律资讯采集 → 清洗 → AI 处理 → 检索 → 推送”的云原生平台。仓库内置 **可部署（Docker Compose）+ 可验证（E2E + Monkey）** 的交付口径，目标是直接支持商业运行的稳定性与可观测性基线。

## 架构概览

```mermaid
flowchart LR
  U[用户/浏览器] --> WEB[Web (Next.js)]
  WEB -->|HTTP| API[API (Rust/Axum)]

  API --> PG[(Postgres + pgvector)]
  API --> R[(Redis)]
  API --> S3[(MinIO/S3)]

  W[Worker (Rust)] --> PG
  W --> R
  W --> S3

  subgraph Compose
    WEB
    API
    W
    PG
    R
    S3
  end
```

## 快速开始（docker compose）

### 1) 准备环境变量

复制示例文件并设置密码（不要提交 `.env`）：

```bash
cp .env.example .env
```

至少需要填写：

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

### 2) 启动

```bash
docker compose up -d --build
```

默认端口（可通过 `.env` 覆盖）：

- Web: `http://localhost:8849`（`WEB_HOST_PORT`）
- API: `http://localhost:3001`（`API_HOST_PORT`）
- Postgres: `localhost:5435`（`POSTGRES_HOST_PORT`）
- Redis: `localhost:6380`（`REDIS_HOST_PORT`）
- MinIO API: `http://127.0.0.1:9000`（`MINIO_API_PORT`）
- MinIO Console: `http://127.0.0.1:9001`（`MINIO_CONSOLE_PORT`）

### 3) 健康检查

```bash
docker compose ps
```

期望看到 `postgres/redis/minio/api/web/worker` 全部为 `(healthy)`。  
API 健康端点：`GET /health`（默认：`http://localhost:3001/health`）。

## 可选服务（Profiles）

- n8n（默认不启动）：

```bash
docker compose --profile n8n up -d
```

- rss-fixture（仅用于 E2E，默认不启动）：

```bash
docker compose --profile e2e up -d --build
```

## 测试与质量门禁

### 单元/静态检查

```bash
cargo test --workspace
```

```bash
pnpm -C apps/web test
```

### 契约/类型同步（OpenAPI → TypeScript）

后端以 utoipa 生成 OpenAPI 作为 API 契约单一事实来源，并固定输出到 `resource/openapi.v1.json`。  
前端通过 `openapi-typescript` 生成类型到 `apps/web/src/lib/api/generated/openapi.ts`，用于避免前后端类型漂移（CI 会强制检查）。

生成/更新方式：

```bash
# Bash / Git Bash / WSL
cargo run -p law-eye-api -- --dump-openapi > resource/openapi.v1.json
pnpm -C apps/web gen:api-types
```

> Windows PowerShell 注意：`>` 默认输出 UTF-16，需改用 `Set-Content -Encoding utf8`（或直接用 Git Bash 执行上面的命令）。

### 覆盖率（Coverage）

```bash
cargo tarpaulin --workspace --all-features --out Lcov --output-dir target/tarpaulin --root .
```

```bash
pnpm -C apps/web coverage
```

产物输出：
- Rust：`target/tarpaulin/`
- Web：`apps/web/coverage/`

### E2E（Playwright）

首次运行若缺少浏览器依赖：

```bash
pnpm -C apps/web e2e:install
```

```bash
pnpm -C apps/web e2e
```

### 一键全门禁（E2E + Monkey）

该脚本会：
1) 启动一套隔离的测试栈（避免污染本地数据）
2) 运行 Playwright E2E
3) 运行 API/Web Monkey（SLA：`p95_2xx < 200ms`，且 0 个 5xx/timeout/net_error）
4) 产物落盘到 `tmp/no-dockerhub/<stack>/logs/` 与 `prompts/logs/`

```bash
bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e-local --web-mode prod
```

常用参数：

- 保留现场用于排障：`--keep`
- 重新构建本地 helper 镜像：`--rebuild`
- 跳过 Monkey（更快的本地迭代）：`--skip-monkey`

## 生产与安全建议

- Secrets：禁止把任何真实密钥写入仓库；本地使用 `.env`，生产建议使用 Vault（见下节）。
- 生产 Cookie：设置 `PRODUCTION=true`（启用 secure cookie 等生产策略）。
- 限流：支持环境变量调参（示例）：
  - `LAW_EYE__RATE_LIMIT__API_MAX_REQUESTS`
  - `LAW_EYE__RATE_LIMIT__API_WINDOW_SECONDS`
  - `LAW_EYE__RATE_LIMIT__LOGIN_MAX_REQUESTS`
  - `LAW_EYE__RATE_LIMIT__REGISTER_MAX_REQUESTS`
- 认证 token TTL（示例）：
  - `LAW_EYE__AUTH__PASSWORD_RESET_TTL_SECONDS`
  - `LAW_EYE__AUTH__EMAIL_VERIFICATION_TTL_SECONDS`

### 国际化（i18n）

- Web 已支持 `zh/en` 两种 locale 路由（示例：`/zh/login`、`/en/login`）。
- `apps/web/src/middleware.ts` 会将无前缀路径重定向到 `/{locale}/...`，并通过 cookie `LAW_EYE_LOCALE` 记忆选择。
- 翻译资源在 `apps/web/src/messages/zh.json`（以英文文案作为 key）；前端通过 `useT()`/`t()` 渲染，日期/数字通过 `formatDateTime/formatNumber` 做 locale-aware 格式化。

### 邮箱验证（Email Verification）

- 请求：`POST /api/v1/auth/email-verification/request`（避免账号枚举：无论邮箱是否存在都返回 200；仅非生产返回 `debug_token`）。
- 确认：`POST /api/v1/auth/email-verification/confirm`（token 单次使用；成功后写入 `users.email_verified_at`；已验证则幂等返回成功）。

### Web Push（浏览器推送）

- 需要配置 `.env`：`WEB_PUSH_VAPID_PUBLIC_KEY`、`WEB_PUSH_VAPID_PRIVATE_KEY`、`WEB_PUSH_SUBJECT`（建议 `mailto:`）。
- 前端：设置页可“开启/关闭/发送测试通知”；Service Worker 监听 `push` 事件并展示通知（点击跳转到 payload.url）。
- 后端：`/api/v1/push/*` 提供 VAPID 公钥、订阅/退订、测试投递；订阅落库到 `web_push_subscriptions` 并写入审计日志；投递前会做 SSRF 防护（仅允许 https 且阻断内网地址）。

## 企业/云端模式（Vault + Gateway）

仓库提供 `docker-compose.enterprise.yml`，用于启用 Vault 注入敏感配置、以及 Caddy 网关（含 mTLS 组件）。这是高级部署路径，需要额外的 PKI/证书准备（见 `infra/` 与 `scripts/enterprise/*`）。

⚠️ **PKI 私钥不应留在仓库目录**：企业 compose 通过环境变量 `LAW_EYE_ENTERPRISE_PKI_DIR` 挂载证书/私钥目录（建议放到用户目录的 state/config 路径下），避免出现 `tmp/enterprise/pki/*.key` 这类“工作区=密钥仓库”的高风险习惯。

快速开始（Git Bash）：

```bash
# 推荐：放到用户目录（而不是仓库目录）下
export LAW_EYE_ENTERPRISE_PKI_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/law-eye/enterprise/pki"

./scripts/enterprise/tls-gen.sh
./scripts/enterprise/vault-init-enterprise.sh
docker compose -f docker-compose.yml -f docker-compose.enterprise.yml up -d
```

## 排障（Troubleshooting）

- 端口冲突：修改 `.env` 中的 `*_HOST_PORT`（如 `WEB_HOST_PORT`）。
- 网络受限/DockerHub 拉取失败：优先使用 `scripts/no-dockerhub/*`（已尽量使用 MCR base，并复用本地镜像）。
- Windows + WSL：
  - 若 WSL 内 pnpm 不可用，脚本会自动回退到 `cmd.exe /c pnpm ...`（需启用 Windows interop）。

## 参考资料

- 外部大脑（当前状态/执行队列）：`prompts/state/master_plan.md`、`prompts/state/todo_list.md`
- 架构决策记录：`prompts/adr/`
- 历史规划与设计文档：`docs/plans/`
