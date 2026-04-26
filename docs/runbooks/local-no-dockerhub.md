# 本地启动（no-dockerhub）Runbook

适用场景：

- 你的网络环境无法访问 DockerHub（例如 `docker compose up -d --build` 拉取基础镜像超时/失败）。
- 你需要一套“可部署、可运行、可验收”的本地全栈启动方式（Web + API + Worker + Postgres + Redis + MinIO）。

该路径使用 `scripts/no-dockerhub/*` 脚本启动服务，并将 secrets/logs 放到用户目录 state（避免落在仓库工作区）。

## 1) 前置依赖

- Docker（daemon 需要运行）
- Bash + curl
- Python（用于生成 secrets、端口探测、部分验证脚本）
- Node.js + pnpm（用于启动/构建 `apps/web`）
- Rust toolchain（用于构建 `crates/law-eye-api` 与 `crates/law-eye-worker`）

Windows + WSL：脚本会尽量自动处理“Web 跑在 Windows / API 跑在 WSL”的混合运行时；如果 WSL 内 pnpm 不可用，会自动回退到 `cmd.exe /c pnpm ...`。

## 2) 启动

默认（Web dev 模式，更快）：

```bash
bash scripts/no-dockerhub/start-stack.sh --name law-eye-local
```

生产模式 Web（`next build` + `next start`，更接近部署运行）：

```bash
LAW_EYE_WEB_MODE=prod bash scripts/no-dockerhub/start-stack.sh --name law-eye-local
```

说明：

- `--name` 用于隔离容器名、数据卷与 state 目录（建议每次排障/验收使用不同 name）。
- 如需“从零开始”（清空 Postgres/Redis/MinIO 数据卷），使用 `--fresh`（危险，会删数据）。

## 3) 健康检查

推荐使用内置校验脚本：

```bash
bash scripts/no-dockerhub/verify-stack.sh --name law-eye-local
```

手动检查（端口以脚本输出为准）：

- API：`GET http://127.0.0.1:<API_PORT>/health`
- Worker：`GET http://127.0.0.1:<WORKER_HEALTH_PORT>/health`
- Web：`GET http://127.0.0.1:<WEB_PORT>/login`
- MinIO：`GET http://127.0.0.1:<MINIO_API_PORT>/minio/health/ready`

## 4) 停止

```bash
bash scripts/no-dockerhub/stop-stack.sh --name law-eye-local

# 若要同时清理 postgres/redis/minio 数据卷：
bash scripts/no-dockerhub/stop-stack.sh --name law-eye-local --purge
```

## 5) 产物与目录（重要）

默认 state 目录：

- `${XDG_STATE_HOME:-$HOME/.local/state}/law-eye/no-dockerhub/<stack-name>/`

其中常用文件：

- `secrets.env`：脚本自动生成的本地 secrets（权限会尽量设为 600）；不要提交到仓库。
- `stack.env`：启动后写入的端口与运行信息（`API_PORT`/`WEB_PORT`/`LAW_EYE__WORKER__HEALTH_PORT` 等）。
- `logs/`：Web/API/Worker 与辅助脚本日志。
- `pids/`：本地进程 PID（用于 stop 脚本清理）。

Playwright E2E 输出：

- `apps/web/test-results/`

Monkey 日志/报告（会复制一份到仓库目录，便于 CI/审阅）：

- `prompts/logs/`

## 6) 常见排障

- 端口冲突：脚本会自动选取可用端口并打印；若仍冲突，先 `stop-stack.sh --purge` 清理旧栈。
- Windows/WSL 互通问题：脚本会在必要时设置 `LAW_EYE_API_PROXY_TARGET`，让 Web 通过 Next rewrites 访问 API。
- 想自定义 state 路径：可设置 `LAW_EYE_NO_DOCKERHUB_STATE_DIR` 指向你期望的目录（建议仍然放在用户目录，而不是 repo workspace）。
