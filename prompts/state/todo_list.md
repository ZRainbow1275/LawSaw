# TODO List（执行队列）

> 说明：本文件是可执行任务队列；`prompts/state/master_plan.md` 是全局状态与模块边界定义。

## Now（当前执行）
- [x] INIT-001 创建 prompts/ 外部大脑目录与 master_plan ✅（已完成）
- [x] AUDIT-001 生成 `prompts/adr/001_initial_audit.md` ✅（已完成）
- [x] INFRA-001 统一 Secrets 注入：compose 去明文、提供 `.env.example` ✅（已完成）
- [x] QA-001 增加 Monkey Tests（API + Web 入口）✅（已完成：`scripts/monkey/*.py`）
- [x] REL-001 启动稳定性：DB 连接重试 + 基础服务 restart policy ✅
- [x] QA-002 增加 E2E 用户旅程脚本（Login → 核心动作 → Logout）✅（已完成：`apps/web/e2e/lawsaw.e2e.spec.ts`，配套 `docker-compose.yml` 的 `rss-fixture` profile）
- [x] RUN-001 `docker compose up` 通过并记录日志 ✅（已完成）
- [x] QA-003 扩展 E2E 覆盖：Analytics/Data/Feedback/Knowledge/Settings（含头像上传、API Key 生命周期）✅（已覆盖 `/analytics /data /feedback /knowledge /settings /category/:slug`）
- [x] QA-004 E2E 可靠性：网络/5xx 抖动重试、运行前健康自检、失败诊断信息落盘 ✅（已增强健康自检/错误 gate/strict locator 规避）
- [x] PERF-002 Monkey SLA：增加延迟门槛与失败阈值（商业可用基线）✅（已支持 `--p95-threshold-ms/--max-5xx/--max-net-errors/--max-timeouts` + `report_json`）
- [x] QA-005 将 Monkey 门禁纳入 `scripts/no-dockerhub/e2e.sh`（CI 口径一致）：E2E 后自动运行 API/Web monkey + 产物落盘 ✅（`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e-qa005-prod5`：E2E 通过；API/Web monkey 0 timeouts/0 net_errors/0 5xx，p95<500ms；产物落盘到 `prompts/logs/` 与 `tmp/no-dockerhub/<stack>/logs/`）

## Next（下一批）
- [x] API-001 OpenAPI 契约补全与稳定化 ✅（Spec：`prompts/specs/archive/api_spec.md`；增强 `crates/law-eye-api/src/openapi.rs` 元信息与回归测试；`cargo test --workspace` 通过）
- [x] API-002 关键接口的输入校验与错误码规范化 ✅（Spec：`prompts/specs/archive/api_validation_spec.md`；sources URL/SSRF 校验 + search 长度上限 + apikey 创建校验；新增单测；`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e-api002-check1` 通过）
- [x] CORE-001 识别并修复潜在 N+1 查询路径 ✅（Feedback 列表移除逐条回填加密导致的 N+1 写入；新增解密单测；E2E+Monkey 门禁通过；Spec：`prompts/specs/archive/core_nplus1_spec.md`）
- [x] WEB-001 前端关键路径与错误恢复体验（登录态、失败重试）✅（Spec：`prompts/specs/archive/web_ux_spec.md`；验证：`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e-web001-verify5 --web-mode prod`；`cmd.exe /c "cd /d D:\\Desktop\\LawSaw\\apps\\web && pnpm test"`；`cargo test --workspace`）
- [x] INFRA-002 Compose 健康检查补全（web/worker）与“全服务 healthy”硬门槛对齐 ✅（Spec：`prompts/specs/archive/infra_healthcheck_spec.md`；`docker compose ps`：web/worker 均为 healthy；验证：`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e-infra002-verify1 --web-mode prod`）
- [x] QA-006 性能门禁收敛：p95 < 200ms（标准负载）+ 日志落盘 ✅（Spec：`prompts/specs/archive/qa_perf_sla_spec.md`；门禁：以 2xx p95 为准；验证：`bash scripts/no-dockerhub/e2e.sh --name law-eye-e2e-qa006-verify1 --web-mode prod`）
- [x] DOC-001 根目录 README：架构图 + 一键部署（docker compose）+ 运行/排障手册 ✅（Spec：`prompts/specs/archive/doc_readme_spec.md`；产物：`README.md`）
