# CD（持续交付）与回滚手册

本手册采用“**先必做、后可选**”结构，默认面向生产发布。

## 0) 适用范围与单一真相源

- CD 工作流：`.github/workflows/cd.yml`
- Kubernetes 部署工作流：`.github/workflows/deploy.yml`
- v2.6 交付闭环：`prompt/audit-report.md`
- 本批次规格：`prompts/specs/archive/`

若本文与代码冲突，以代码与上述真相源为准。

## 1) 必做核对清单（发布必经）

### 1.1 发布前门禁（必须全部通过）

- Rust 门禁：`cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
- Web 门禁：`pnpm -C apps/web typecheck && pnpm -C apps/web lint && pnpm -C apps/web build`
- 系统门禁：`bash scripts/no-dockerhub/e2e.sh`
- 安全扫描：确保对应 CI 已通过 RustSec、pnpm audit、TruffleHog、SBOM
- 交付闭环：确认 `prompt/audit-report.md` 中 `V26-*` 与 `SEC/REL/PERF/DATA-C*` 条目保持已完成

### 1.2 触发 CD（必须）

二选一：

- 推送发布标签：`v*`（建议语义化版本，如 `v2.6.0`）
- GitHub Actions 手动触发：`CD` → `workflow_dispatch`（可传 `tag`）

### 1.3 部署发布（必须）

默认镜像仓库为 GHCR，发布产物：

- `ghcr.io/<owner>/<repo>/api:<tag>` 与 `:sha-<sha>`
- `ghcr.io/<owner>/<repo>/worker:<tag>` 与 `:sha-<sha>`
- `ghcr.io/<owner>/<repo>/web:<tag>` 与 `:sha-<sha>`

规则：

- 禁止使用 `:latest`
- 生产仅使用固定 tag 或 `sha-<sha>`

### 1.4 发布后验收（必须）

- 健康检查：`/health`、`/health/live`、`/health/ready` 正常
- 关键路径：登录、文章列表、搜索、对象下载、推送测试链路可用
- 指标保护：生产环境验证 `LAW_EYE__METRICS__TOKEN` 生效（未授权应返回 404）
- AI 配置：生产环境必须配置 `LAW_EYE__AI__API_KEY`，禁止静默降级

### 1.5 回滚预案（必须预先确认）

- 已记录最近一个稳定 tag 与对应 `sha-<sha>`
- 团队已确认“应用镜像可回滚、数据服务不回滚”策略

## 2) 部署操作（默认路径）

### 2.1 Docker Compose（默认）

```bash
docker compose pull
docker compose up -d --no-build
```

说明：

- 生产环境建议使用“仅镜像”compose（不带 `build:`）
- 若 compose 中存在 `build:`，发布时必须显式 `--no-build`

### 2.2 Kubernetes（蓝绿/金丝雀）

使用 Argo Rollouts 模板：`infra/k8s/overlays/{bluegreen,canary}`

```bash
# 选择一种策略
kubectl apply -k infra/k8s/overlays/bluegreen -n law-eye
kubectl apply -k infra/k8s/overlays/canary -n law-eye

# 更新镜像示例（避免 JSON patch 引号转义错误）
kubectl -n law-eye set image rollout/law-eye-api api=ghcr.io/<owner>/<repo>/api:v2.6.0
```

## 3) 回滚操作（故障时执行）

### 3.1 Docker Compose 回滚

```bash
# 将镜像版本切回上一个稳定 tag 或 sha
docker compose pull
docker compose up -d --no-build
```

### 3.2 Kubernetes 回滚（Argo Rollouts）

```bash
kubectl argo rollouts status law-eye-api -n law-eye --timeout 10m
kubectl argo rollouts undo law-eye-api -n law-eye
```

## 4) 可选扩展（按环境启用）

以下为企业/增强能力，不作为“基础发布”阻断项，但建议生产启用。

### 4.1 Enterprise 运维定时任务

`docker-compose.enterprise.yml` 内置：

- `vault-rotate-cron`：定期密钥轮换（`scripts/enterprise/vault-rotate-cron.sh`）
- `backup-cron`：定期加密备份（`scripts/enterprise/backup-encrypted.sh`）
- `audit-report-cron`：定期审计汇总与清理（`scripts/enterprise/audit-report.sh`）

关键环境变量：

- `LAW_EYE_VAULT_ROTATE_INTERVAL_SECONDS`（默认 2592000）
- `LAW_EYE_BACKUP_INTERVAL_SECONDS`（默认 86400）
- `LAW_EYE_BACKUP_RETENTION_DAYS`（默认 30）
- `LAW_EYE_AUDIT_REPORT_INTERVAL_SECONDS`（默认 604800）
- `LAW_EYE_AUDIT_REPORT_RETENTION_DAYS`（默认 90）
- `LAW_EYE_AUDIT_LOG_RETENTION_DAYS`（默认 365）

### 4.2 配置热重载（Hot Reload）

后端支持轮询热重载（配置文件/env + Vault secrets）：

- `LAW_EYE__CONFIG_RELOAD__ENABLED=true`
- `LAW_EYE__CONFIG_RELOAD__INTERVAL_SECONDS=30`

注意：热重载不会重建连接池与监听端口，基础设施级变更仍需走发布流程。

### 4.3 慢查询观测

接口：`GET /health/slow-queries?limit=20`

- 生产环境与 `/metrics` 一样需 `Authorization: Bearer <LAW_EYE__METRICS__TOKEN>`
- `pg_stat_statements` 可用时返回慢查询列表
- 不可用时返回 `enabled=false` 与 `pg_stat_statements_unavailable`

## 5) v2.6 专项核对（发布后）

- 契约一致：确认 API v1/v2 契约与 OpenAPI 产物一致
- 可靠性能力：确认 Worker 超时、队列 Lua 原子操作、AI 429 退避与熔断策略生效
- 运维任务：确认 enterprise 三个 cron 服务在目标环境运行正常

如需历史背景请参考 `docs/plans/`（归档占位）；如需当前规格请参考 `prompts/specs/archive/`。
