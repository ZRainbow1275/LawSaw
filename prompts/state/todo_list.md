# TODO List（执行队列）

> 说明：本文件是可执行任务队列；`prompts/state/master_plan.md` 是全局状态与模块边界定义。

## Now（当前执行）
- [x] INIT-001 创建 prompts/ 外部大脑目录与 master_plan ✅（已完成）
- [x] AUDIT-001 生成 `prompts/adr/001_initial_audit.md` ✅（已完成）
- [x] INFRA-001 统一 Secrets 注入：compose 去明文、提供 `.env.example` ✅（已完成）
- [x] QA-001 增加 Monkey Tests（API + Web 入口）✅（已完成：`scripts/monkey/*.py`）
- [x] REL-001 启动稳定性：DB 连接重试 + 基础服务 restart policy ✅
- [ ] QA-002 增加 E2E 用户旅程脚本（Login → 核心动作 → Logout）
- [x] RUN-001 `docker compose up` 通过并记录日志 ✅（已完成）

## Next（下一批）
- [ ] API-001 OpenAPI 契约补全与稳定化
- [ ] API-002 关键接口的输入校验与错误码规范化
- [ ] CORE-001 识别并修复潜在 N+1 查询路径
- [ ] WEB-001 前端关键路径与错误恢复体验（登录态、失败重试）
