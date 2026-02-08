# CD（持续交付）与回滚手册

本仓库的 CI 负责质量门禁（clippy/test/biome/e2e/security scan），CD 负责将可交付产物（容器镜像）发布到镜像仓库，并提供可回滚的版本化标签。

## 1) 触发方式

CD workflow：`.github/workflows/cd.yml`

触发条件：
- 推送 tag：`v*`（推荐语义化版本，例如 `v2.6.0`）
- 手动触发：GitHub Actions → CD → `workflow_dispatch`（可传入 `tag`）

## 2) 产物（镜像）

镜像默认发布到 GHCR：
- `ghcr.io/<owner>/<repo>/api:<tag>` / `:sha-<sha>`
- `ghcr.io/<owner>/<repo>/worker:<tag>` / `:sha-<sha>`
- `ghcr.io/<owner>/<repo>/web:<tag>` / `:sha-<sha>`

说明：
- 不发布 `:latest`，避免漂移。
- 推荐以 tag（发布版本）或 `sha-<sha>`（精确回滚点）进行部署。

## 3) 部署建议（Docker Compose）

生产建议使用**固定镜像 tag**（版本锁定），并在变更时执行：
```bash
docker compose pull
docker compose up -d --no-build
```

如果你的 compose 默认使用 `build:`，建议在生产环境使用“仅镜像”的 compose 文件（不包含 build），或者在部署命令中显式 `--no-build` 并确保镜像已 `pull`。

## 3.1) 部署建议（Kubernetes：蓝绿 / 金丝雀）

为满足企业级“零停机发布 + 可回滚”，仓库提供 **Argo Rollouts** 模板与手动部署工作流：
- K8s 模板：`infra/k8s/*`
- 部署工作流：`.github/workflows/deploy.yml`

常用命令：
```bash
# 蓝绿 / 金丝雀（二选一）
kubectl apply -k infra/k8s/overlays/bluegreen -n law-eye
kubectl apply -k infra/k8s/overlays/canary -n law-eye

# 更新镜像（示例：发布版本）
kubectl -n law-eye patch rollout law-eye-api --type='json' -p='[
  {"op":"replace","path":"/spec/template/spec/containers/0/image","value":"ghcr.io/<owner>/<repo>/api:v2.6.0"}
]'
```

## 4) 回滚策略

回滚原则：**只回滚应用镜像**（api/worker/web），数据服务（postgres/redis/minio）不随发布回滚。

推荐做法：
1. 将服务镜像 tag 回退到上一个已验证版本（例如从 `v2.6.0` 回滚到 `v2.5.3`）
2. 执行：
   ```bash
   docker compose pull
   docker compose up -d --no-build
   ```

如果按 `sha-<sha>` 回滚，则可精确定位到任意一次发布产物。

### 4.1) Kubernetes 回滚（Argo Rollouts）

安装 `kubectl-argo-rollouts` 插件后：
```bash
kubectl argo rollouts status law-eye-api -n law-eye --timeout 10m
kubectl argo rollouts undo law-eye-api -n law-eye
```

## 5) 发布前门禁（强制）

CD 发布前应确保对应 commit 已通过 CI：
- Rust：`cargo fmt/clippy/test` + RustSec audit
- Web：`pnpm typecheck/lint/build` + pnpm audit
- E2E：`bash scripts/no-dockerhub/e2e.sh`


## 6) Enterprise 运维定时任务

docker-compose.enterprise.yml 已内置三个后台任务服务：

- vault-rotate-cron：周期执行 Vault 密钥轮换脚本 scripts/enterprise/vault-rotate-cron.sh
- backup-cron：周期执行加密数据库备份 scripts/enterprise/backup-encrypted.sh
- audit-report-cron：周期生成审计汇总并清理过期审计日志 scripts/enterprise/audit-report.sh

关键环境变量：

- LAW_EYE_VAULT_ROTATE_INTERVAL_SECONDS（默认 2592000，30 天）
- LAW_EYE_BACKUP_INTERVAL_SECONDS（默认 86400，1 天）
- LAW_EYE_BACKUP_RETENTION_DAYS（默认 30）
- LAW_EYE_AUDIT_REPORT_INTERVAL_SECONDS（默认 604800，7 天）
- LAW_EYE_AUDIT_REPORT_RETENTION_DAYS（默认 90）
- LAW_EYE_AUDIT_LOG_RETENTION_DAYS（默认 365）

## 7) 配置热重载（Hot Reload）

后端支持基于轮询的配置热重载（文件/env + Vault secrets）：

- 配置项 [config_reload]
  - enabled：是否启用（默认 false）
  - interval_seconds：轮询间隔（默认 30）
- 等价环境变量：
  - LAW_EYE__CONFIG_RELOAD__ENABLED=true
  - LAW_EYE__CONFIG_RELOAD__INTERVAL_SECONDS=30

注意：热重载会刷新 AppConfig 快照与版本号；已有连接池/监听端口等基础设施不会在运行中重建，需通过发布流程完成变更生效。

## 8) 慢查询监控

API 暴露慢查询观测接口：GET /health/slow-queries?limit=20。

- 生产环境下接口与 /metrics 一样要求 `Authorization: Bearer <LAW_EYE__METRICS__TOKEN>`，未授权返回 404。
- 当 pg_stat_statements 可用时返回 enabled=true 与排序后的慢查询列表。
- 未启用扩展或权限不足时返回 enabled=false 与 `pg_stat_statements_unavailable`。

数据库镜像已默认预加载并启用扩展（`shared_preload_libraries=pg_stat_statements` + `CREATE EXTENSION`）。


## 9) v2.6 批次交付核对（2026-02-08）

本批次以 `prompt/audit-report.md` 的 `v2.6` 修复清单与 `.trellis/spec/` 规范集作为交付依据，建议发布前后执行以下核对：

- 任务闭环：确认 `prompt/audit-report.md` 中 `V26-*` 与 `SEC/REL/PERF/DATA-C*` 条目保持已完成状态。
- 契约一致：执行 API v1/v2 契约与 OpenAPI 生成流程，确保前后端 schema 同步。
- 可靠性能力：确认 Worker 超时、队列 Lua 原子操作、AI 429 退避与熔断配置在目标环境生效。
- 运维任务：确认 `vault-rotate-cron`、`backup-cron`、`audit-report-cron` 三个 enterprise 定时任务均为运行状态。
- 安全门禁：生产环境必须配置 `LAW_EYE__METRICS__TOKEN` 与 `LAW_EYE__AI__API_KEY`，避免观测面裸露与 AI 静默降级。

如需追溯历史设计与实施路径，请参考 `docs/plans/`；如需执行规范，请以 `.trellis/spec/` 为准。
