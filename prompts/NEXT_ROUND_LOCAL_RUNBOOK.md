# LawSaw 本机完整启动与下一轮实测检验手册

更新时间：2026-02-25  
目标：在本机完整启动并验证“爬虫 / 知识图谱 / 统计 / 日报”真实链路（无 mock），可直接迁移到云端部署。

配套标准文档：`prompts/RC2_ENTERPRISE_IMPROVEMENT_STANDARD.md`  
统一门禁入口：`scripts/enterprise/rc2-gate.sh`

---

## 1. 固定运行参数（本轮已验证）

- Web: `http://172.19.96.1:8850`
- API: `http://172.19.107.21:13003`
- Worker Health: `http://172.19.107.21:3002/health`
- Stack Name: `law-eye-local-codex`
- AI Gateway: `https://api.siliconflow.cn/v1`
- LLM Model: `Qwen/Qwen3-8B`
- Embedding Model: `BAAI/bge-m3`

说明：
- `8850 -> 13003` 通过 `LAW_EYE_API_PROXY_TARGET` 代理。
- 后端任务（抓取、入库、向量化、报告）依赖 worker 常驻进程。

---

## 2. 前置检查

在 PowerShell 执行：

```powershell
docker --version
pnpm --version
node --version
python --version
```

在 WSL / Git Bash 执行：

```bash
cargo --version
```

---

## 3. 启动后端栈（WSL / Git Bash）

> 建议在独立 Bash 终端执行；全程使用 `python`（不要 `python3`）。

```bash
cd /mnt/d/Desktop/LawSaw

export LAW_EYE_STACK_NAME=law-eye-local-codex
export LAW_EYE_SKIP_WEB=1
export LAW_EYE_REQUIRE_AI=1
export LAW_EYE_WORKER_SCHEDULER_ENABLED=false

# 必填：从你本地安全来源注入，不要写入仓库
export LAW_EYE__AI__API_KEY="<YOUR_SILICONFLOW_API_KEY>"
export LAW_EYE__AI__BASE_URL="https://api.siliconflow.cn/v1"
export LAW_EYE__AI__MODEL="Qwen/Qwen3-8B"
export LAW_EYE__AI__EMBEDDING_MODEL="BAAI/bge-m3"
export LAW_EYE__AI__EMBEDDING_DIMENSION_STRATEGY="pad_or_truncate"

# 固定端口（本轮验证通过）
export API_PORT=13003
export WEB_PORT=8850
export LAW_EYE__WORKER__HEALTH_PORT=3002

bash scripts/no-dockerhub/start-stack.sh --name "$LAW_EYE_STACK_NAME"
```

后端健康验证：

```bash
curl -i http://172.19.107.21:13003/health
curl -i http://172.19.107.21:3002/health
```

---

## 4. 启动 Web（PowerShell）

> 推荐在单独 PowerShell 窗口执行并保持运行。

### 4.1 生产同构启动（推荐，已验证）

```powershell
cd D:\Desktop\LawSaw\apps\web

# 注意：本文件当前固定为可用代理目标
# LAW_EYE_API_PROXY_TARGET=http://172.19.107.21:13003

pnpm build   # 等价于 next build --webpack
pnpm start -p 8850 -H 0.0.0.0
```

### 4.2 开发模式启动（仅调试）

```powershell
$cmd = 'set PORT=8850&&set WEB_PORT=8850&&set WEB_HOST=0.0.0.0&&set NEXT_PUBLIC_API_URL=http://172.19.96.1:8850&&set LAW_EYE_API_PROXY_TARGET=http://172.19.107.21:13003&&set NEXT_TELEMETRY_DISABLED=1&&cd /d D:\Desktop\LawSaw\apps\web&&pnpm dev'
cmd.exe /c $cmd
```

Web 健康验证：

```powershell
curl.exe -i http://172.19.96.1:8850/login
curl.exe -i http://172.19.96.1:8850/api/v1/auth/me
```

期望：
- `/login` 返回 `200` 或 `307`
- `/api/v1/auth/me` 返回 `401`（未登录），**不是 500**

---

## 4.3 本轮关键修复（2026-02-24）

1. 修复首页“API服务异常”误报  
   - 根因：`/health` 被 locale middleware 重定向到 `/zh/health`（307->404）  
   - 修复：`apps/web/src/middleware.ts` 放行 `/health`、`/metrics`、`/api-docs`

2. 修复 reports 页面后侧栏不跳转  
   - 根因：reports 弹窗关闭态 reset 触发渲染循环（React #185），导致路由交互异常  
   - 修复文件：  
     - `apps/web/src/components/reports/create-report-dialog.tsx`  
     - `apps/web/src/components/reports/report-export-dialog.tsx`  
   - 处理：仅在弹窗由“打开 -> 关闭”时执行一次 reset

3. 修复登录/注册页被全局并发冲突遮罩拦截  
   - 修复文件：`apps/web/src/components/providers/auth-provider.tsx`  
   - 处理：登录/注册页跳过 409/412/428 全局冲突弹窗

4. 生产构建稳定性策略  
   - 将 `apps/web/package.json` 的 `build` 改为 webpack 构建：`next build --webpack`  
   - 避免 Next 16 默认 turbopack 生产构建在本项目下触发的路由异常风险

5. 修复“无模板报告导出 PDF 失败”  
   - 根因：有些报告关联了无效模板，模板渲染失败后直接中断导出  
   - 修复文件：`crates/law-eye-worker/src/main.rs`  
   - 处理：`Html/Pdf` 导出都改为“模板渲染失败自动降级到内联 fallback HTML”，保证导出不中断

6. 报告审批与驳回链路可用化  
   - 修复文件：`apps/web/src/components/reports/report-detail.tsx`  
   - 处理：  
     - `generated` 状态支持“快速批准”（自动补齐 `generated -> review -> approved`）  
     - “驳回”统一走 `target_status=draft`（当前后端状态机无 `rejected` 状态）  
     - 有导出 key 时即可下载，不再强依赖 `published`

7. 分类图标统一为线性图标（去 emoji）  
   - 修复文件：  
     - `apps/web/src/components/layout/sidebar.tsx`  
     - `apps/web/src/components/dashboard/category-overview.tsx`  
   - 处理：按 `slug -> lucide icon` 映射，侧栏与概览使用同一图标体系

---

## 5. 若抓取后不入库：对齐 worker 到 API 同一栈（WSL / Git Bash）

> 仅在出现“`last_fetch` 不更新 / 队列不消费”时执行。

```bash
cd /mnt/d/Desktop/LawSaw

# 1) 找到当前 13003 对应 API 进程
API_PID=$(ss -ltnp | awk '/:13003/ && /law-eye-api/ {match($0,/pid=([0-9]+)/,a); print a[1]; exit}')
echo "API_PID=$API_PID"

# 2) 导出该 API 的 LAW_EYE 环境（避免 worker 连错库/错 redis）
{
  tr '\0' '\n' </proc/$API_PID/environ | grep '^LAW_EYE'
  tr '\0' '\n' </proc/$API_PID/environ | grep '^POSTGRES_PASSWORD=' || true
  tr '\0' '\n' </proc/$API_PID/environ | grep '^REDIS_PASSWORD=' || true
  tr '\0' '\n' </proc/$API_PID/environ | grep '^MINIO_ROOT_USER=' || true
  tr '\0' '\n' </proc/$API_PID/environ | grep '^MINIO_ROOT_PASSWORD=' || true
} > /mnt/d/Desktop/LawSaw/tmp/runtime-law-eye-worker-13003.env

# 3) 前台启动 worker（建议新开一个 Bash 终端长期挂着）
set -a
source /mnt/d/Desktop/LawSaw/tmp/runtime-law-eye-worker-13003.env
set +a
/home/zrainbow/.cache/lawsaw-cargo-target/debug/law-eye-worker
```

---

## 6. 核心“更新 + 入库”实测命令（真实数据）

### 6.1 一条命令跑通四链路（推荐）

在 PowerShell 执行：

```powershell
node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://172.19.96.1:8850 --assert-knowledge-embedding 1
```

此命令会真实执行：
- 注册/登录
- 创建信息源并触发抓取
- 验证文章入库
- 跑知识图谱回填与 embedding
- 跑统计（地域/行业/重要性）
- 生成并下载 PDF 报告

期望：输出 JSON 中 `ok: true`。

### 6.2 连续三轮稳定性回归

```powershell
node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://172.19.96.1:8850 --assert-knowledge-embedding 1 > tmp/core-e2e-next-round-1.json
node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://172.19.96.1:8850 --assert-knowledge-embedding 1 > tmp/core-e2e-next-round-2.json
node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://172.19.96.1:8850 --assert-knowledge-embedding 1 > tmp/core-e2e-next-round-3.json
```

### 6.3 报告审批/导出链路专项回归（本轮新增）

```powershell
node tmp/report-export-e2e.mjs
```

期望：
- 输出 `ok: true`
- `export_pdf_key: true`
- `export_docx_key: true`
- `pdf_download: 200`
- `docx_download: 200`

---

## 7. 前端与用户流实测

```powershell
pnpm -C apps/web test
pnpm -C apps/web e2e
```

期望：
- `test` 全绿（typecheck + lint + unit）
- `e2e` 全绿（当前应为 `6 passed`）

---

## 8. 发布前门禁（部署可用性）

在 WSL / Git Bash 执行：

```bash
cd /mnt/d/Desktop/LawSaw

# 数据库 URL 可从 API 进程环境读取（保证和运行栈一致）
API_PID=$(ss -ltnp | awk '/:13003/ && /law-eye-api/ {match($0,/pid=([0-9]+)/,a); print a[1]; exit}')
DB_URL=$(tr '\0' '\n' </proc/$API_PID/environ | sed -n 's/^LAW_EYE__DATABASE__URL=//p' | head -n 1)

LAW_EYE_BASE_URL=http://172.19.107.21:13003 \
LAW_EYE_WORKER_HEALTH_URL=http://172.19.107.21:3002 \
LAW_EYE__DATABASE__URL="$DB_URL" \
LAW_EYE_VERIFY_DB_QUERY_PLAN=1 \
LAW_EYE_DB_QUERY_PLAN_THRESHOLD_MS=800 \
sh scripts/enterprise/post-deploy-verify.sh
```

期望：全部 `ok`，包括 query-plan gate。

---

## 9. 当前后台常驻命令说明（你刚问到的）

命令形态：

```bash
set -a; source /mnt/d/Desktop/LawSaw/tmp/runtime-law-eye-worker-13003.env; set +a; /home/zrainbow/.cache/lawsaw-cargo-target/debug/law-eye-worker
```

作用：
- 以和 API 相同的运行配置启动 worker
- 持续消费异步任务（抓取、入库、向量化、统计更新、报告渲染）

如果停掉它：
- 页面可打开，但“新抓取/新入库/新报告”会停止推进。

---

## 10. 下一轮实测建议执行顺序（最短路径）

1. 第 3、4 节启动完成  
2. 第 6.1 节跑一次核心链路  
3. 第 7 节跑前端 test + e2e  
4. 第 8 节跑发布门禁  
5. 第 6.2 节跑三轮稳定性回归

如第 6.1 失败，先执行第 5 节再重试。

---

## 11. 一键执行 RC2 门禁（推荐）

在 WSL / Git Bash 执行：

```bash
cd /mnt/d/Desktop/LawSaw

API_PID=$(ss -ltnp | awk '/:13003/ && /law-eye-api/ {match($0,/pid=([0-9]+)/,a); print a[1]; exit}')
DB_URL=$(tr '\0' '\n' </proc/$API_PID/environ | sed -n 's/^LAW_EYE__DATABASE__URL=//p' | head -n 1)

LAW_EYE_BASE_URL=http://172.19.107.21:13003 \
LAW_EYE_WEB_URL=http://172.19.96.1:8850 \
LAW_EYE_ORIGIN=http://172.19.96.1:8850 \
LAW_EYE_WORKER_HEALTH_URL=http://172.19.107.21:3002 \
LAW_EYE__DATABASE__URL="$DB_URL" \
bash scripts/enterprise/rc2-gate.sh
```

通过后会在 `tmp/rc2-gate-<timestamp>/` 生成报告和每轮核心链路输出。

---

## 12. 下一轮改进范围（ReBAC / 管理面板 / AI 治理）

唯一 spec：`prompts/0225/REBAC_AI_GOVERNANCE_SPEC_2026-02-25.md`

最小闭环拆分为三阶段：

1. Phase A（P0）：ReBAC + 分层身份（super_admin / tenant_admin / basic / verified / premium）
2. Phase B（P1）：管理员面板与用户面板 + Banner/置顶
3. Phase C（P1）：真实 AI 总结/情感/风险标签 + AI 集中管理台

阶段门禁（每阶段必须通过）：
- `cargo check -p law-eye-api -p law-eye-core -p law-eye-worker`
- `pnpm -C apps/web test`
- `pnpm -C apps/web e2e`
- `node tmp/core-e2e-local.mjs --base-url http://172.19.107.21:13003 --origin http://localhost:8850 --assert-knowledge-embedding 1`

---

## 13. WSL 与 C 盘空间治理约束（本轮强制）

- 不自动执行 `wsl --shutdown`。
- 如需关闭 WSL 或压缩 `ext4.vhdx`，必须由人工手动执行。
- 自动清理仅允许项目相关缓存与历史测试卷，禁止清理无关容器/文件。
