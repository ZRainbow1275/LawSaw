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

## 5) 发布前门禁（强制）

CD 发布前应确保对应 commit 已通过 CI：
- Rust：`cargo fmt/clippy/test` + RustSec audit
- Web：`pnpm typecheck/lint/build` + pnpm audit
- E2E：`bash scripts/no-dockerhub/e2e.sh`

