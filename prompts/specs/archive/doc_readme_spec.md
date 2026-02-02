# DOC-001：根目录 README（架构图 + 一键部署 + 排障）(Spec)

## 1. 目标

在仓库根目录提供一份 **可直接用于商业交付/云端部署** 的 README，满足：

- 新用户 5 分钟内可跑起来（docker compose）
- 关键架构一眼可懂（包含 Mermaid 架构图）
- 运行/测试/排障口径与仓库现状一致（不“写了跑不通”的命令）
- 明确安全边界（Secrets、生产模式、可选服务 profile）

## 2. README 必备章节（结构）

1. 项目简介（LawSaw / Law-Eye 是什么，核心能力）
2. 架构概览（Mermaid：Web → API → Postgres/Redis/MinIO；Worker 消费队列）
3. 快速开始（docker compose）
   - 复制 `.env.example` → `.env`，填写必需变量
   - `docker compose up -d --build`
   - 验证：`docker compose ps` / `curl http://localhost:3001/health`
4. 可选服务（Profiles）
   - `--profile n8n`
   - `--profile e2e`（rss-fixture，仅 E2E）
5. 测试与质量门禁
   - Web：`pnpm -C apps/web test` / `pnpm -C apps/web e2e`
   - Rust：`cargo test --workspace`
   - 全门禁：`bash scripts/no-dockerhub/e2e.sh --name <run> --web-mode prod`（E2E + Monkey）
6. 运行参数与端口
   - 默认端口 + 通过 `.env` 可改
7. 排障（Troubleshooting）
   - 端口冲突
   - DockerHub/网络受限（使用 `scripts/no-dockerhub/*`）
   - WSL/Windows interop（pnpm 在 WSL 不可用时用 `cmd.exe /c pnpm ...`）
8. 安全与生产建议
   - 禁止提交 `.env`
   - `PRODUCTION=true`（secure cookie）
   - 限流 env knobs（`LAW_EYE__RATE_LIMIT__*`）
9. 相关文档索引（指向 `docs/plans/*`、`prompts/state/*`、`prompts/adr/*`）

## 3. 验收标准

- README 中所有命令在当前仓库均存在且语法正确
- README 中所有端口/服务名与 `docker-compose.yml` 一致
- 提到的可选 profile 与 compose 文件一致（`n8n`、`e2e`）

