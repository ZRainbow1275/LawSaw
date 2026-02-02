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

## 企业/云端模式（Vault + Gateway）

仓库提供 `docker-compose.enterprise.yml`，用于启用 Vault 注入敏感配置、以及 Caddy 网关（含 mTLS 组件）。这是高级部署路径，通常需要额外的 PKI/证书准备（见 `infra/` 与 `tmp/enterprise/`）。

## 排障（Troubleshooting）

- 端口冲突：修改 `.env` 中的 `*_HOST_PORT`（如 `WEB_HOST_PORT`）。
- 网络受限/DockerHub 拉取失败：优先使用 `scripts/no-dockerhub/*`（已尽量使用 MCR base，并复用本地镜像）。
- Windows + WSL：
  - 若 WSL 内 pnpm 不可用，脚本会自动回退到 `cmd.exe /c pnpm ...`（需启用 Windows interop）。

## 参考资料

- 外部大脑（当前状态/执行队列）：`prompts/state/master_plan.md`、`prompts/state/todo_list.md`
- 架构决策记录：`prompts/adr/`
- 历史规划与设计文档：`docs/plans/`
