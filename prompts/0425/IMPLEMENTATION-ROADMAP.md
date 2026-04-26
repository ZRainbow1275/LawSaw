# LawSaw 0425 — Implementation Roadmap

**任务**: `04-25-04-25-enterprise-rebuild-rebac-panels-ai`  
**版本**: v1.0 / 2026-04-25

---

## 阶段总览

```
A. PRD + Spec 文档 ───────────► (in_progress)
B. 基础设施 ─────────┐
C. Admin 面板       ├─► 并行（不同 agent team）
D. User 面板        │
E. AI 集成 ─────────┤
F. Reader UX        │
G. 视觉灵动恢复 ────┘
H. 校验 + 审查 + 完成报告
```

---

## Phase A — PRD + Spec 文档

**任务编号**：#6  
**目录**：`prompts/0425/`

### 产出物（已 / 待）

- [x] `PRD-MASTER.md`（v1.0 已写）
- [x] `SPEC-01-REBAC-AUTHZ.md`（v1.0 已写）
- [x] `SPEC-02-DUAL-PANEL.md`（v1.0 已写）
- [x] `SPEC-03-AI-INTEGRATION.md`（v1.0 已写，依赖 research/01）
- [x] `SPEC-04-READER-UX.md`（v1.0 已写，依赖 research/02）
- [x] `SPEC-05-CONTENT-TAXONOMY.md`（v1.0 已写）
- [x] `SPEC-06-VISUAL-DESIGN.md`（v1.0 已写，依赖 research/02 + 03）
- [x] `IMPLEMENTATION-ROADMAP.md`（本文件，持续更新）
- [ ] `COMPLETION-REPORT.md`（Phase H 最后一步）

**Phase A 状态：完成（Phase B 起进入实施）**

### 实施进度（2026-04-25 滚动更新）

| Phase | 状态 | Agent / 备注 |
|---|---|---|
| G — globals.css 24 tokens + keyframes | DONE | `a6dfc94d5f` 已落地 light + dark surface override |
| B.1 — 根路由 server-side redirect | DONE | `a20877042d` ADMIN_TIERS / getServerSession / [locale]/page.tsx |
| B.4 — Admin 路由组 + server guard | DONE | `aac5781df1` 创建 [locale]/admin/* 13 文件 + 11 redirects + sidebar |
| E.1 — SiliconFlow + rerank + 1024 dim | DONE | `a15683b8fb` 已预实施，9/9 unit test 通过 |
| F.1 — Milkdown 7 编辑器封装 | DONE | `a5dba40a86` editor/* 6 文件，仅 client-only dynamic import |
| D.1 — Hero & Feed 视觉灵动恢复 | DONE | `a6273a3c32` framer-motion staggered + AnimatedNumber + radial halos |
| B.3 — Backend RoleTier middleware + tier filtering | IN PROGRESS | `a5fe03c071` helpers 已写，挂载到 articles/sources/categories handler 中 |
| C.1 — Admin Dashboard 真实指标 | IN PROGRESS | `a5118eacc9` /api/v1/admin/dashboard/summary + AdminStatsStrip |

---

## Phase B — 基础设施

**任务编号**：#10  
**目标**：把 admin / user 双面板的"地基"打好。

### B.1 根路由分发（PR-B-1）

- 改 `apps/web/src/app/page.tsx` 为 server component，按 RoleTier redirect
- 改 `apps/web/src/app/[locale]/page.tsx` 同步
- `apps/web/src/lib/api/server.ts` 实装 `fetchSession()`（SSR-safe）
- 单测 + e2e

### B.2 Workspace switcher（PR-B-2）

- `apps/web/src/components/layout/shared/workspace-switcher.tsx`
- `apps/web/src/stores/workspace-store.ts` (zustand persist)
- 接入 `Header` 组件
- visual: lucide `Shield` / `Newspaper`，按 SPEC-02 §10 着色

### B.3 ReBAC tightening（PR-B-3）

- `crates/law-eye-api/src/middleware/authz.rs` 新增 `require_role_tier_middleware`
- 给所有 `/admin/*` API 路由叠加双 guard
- 后端单测覆盖矩阵

### B.4 路由树重组（PR-B-4）

- 新建 `apps/web/src/app/[locale]/admin/layout.tsx`（服务端 guard）
- 把 `[locale]/settings/admin/*` 全部迁移到 `[locale]/admin/*`
- 旧路径 308 redirect

**验收**: SPEC-02 §11 e2e 全绿；admin 用户登录直进 `/admin`，basic 用户登录直进 `/me/feed`。

---

## Phase C — 管理员面板

**任务编号**：#7  
**目标**：13 个 admin 子路由全部可用，每个有真实 API 与权限校验。

### C.1 总览 Dashboard `/admin`（PR-C-1）

- 页面：用户活跃度 / 文章入库速率 / AI 用量 / Pending feedback / 系统健康（已有的 system status 移这里）
- API：`/api/v1/admin/dashboard/summary`
- 组件：`admin-dashboard-stats.tsx`, `admin-activity-feed.tsx`

### C.2 用户管理 `/admin/users`（PR-C-2）

- 列表 / 详情 / 邀请 / 角色分配 / 禁用 / 重置 MFA
- API：复用 `/api/v1/users/*` + 新增 `/api/v1/admin/users/*` 管理面
- 组件：`admin-table.tsx` + `users-detail-card.tsx` + `role-assign-modal.tsx`

### C.3 ReBAC Relations `/admin/relations` + Permissions `/admin/permissions`（PR-C-3）

- 关系图谱可视化（用 echarts graph 或 react-flow，沿用已有库）
- 权限矩阵热图（5 tier × N permissions）
- 关系元组 CRUD + 审计

### C.4 Channels / Sources / Banners / Pins（PR-C-4）

- Channels：CRUD + access policies 编辑 + sources 关联
- Sources：列表 + 健康 + 爬虫策略
- Banners：编排（gradient 颜色 / 受众 / 排期 / Markdown 内容）
- Pins：按频道置顶 + 全局置顶 + 失效

### C.5 Reports / Knowledge / Feedback（PR-C-5）

- Reports：模板编辑（Markdown 编辑器）/ 生成历史 / 手动触发
- Knowledge：实体列表 + 编辑 + 合并 + 关系
- Feedback：工单视图 + 回复 + 分类

### C.6 API Keys / AI Governance / Audit / Settings（PR-C-6）

- API Keys：scope 选择 + 速率限制 + 轮换
- AI Governance：模型 / 提示词版本 / 配额 / 用量图
- Audit：已存在，迁入 `/admin/audit`，加筛选
- Settings：租户元数据 / Webhooks / 通知策略

**验收**: 每个 admin 路由的页面渲染 ✓ + 至少 1 条主流程操作可跑 + 未登录 / 非 admin 访问被拒。

---

## Phase D — 用户面板

**任务编号**：#12  
**目标**：用户端 9 个核心页全部回归"灵动气质"，与原型 visual 一致。

### D.1 Hero & 沉浸 Dashboard / `/me/feed`（PR-D-1）

- Hero：渐变 + 数字滚动计数器（参考原型 line ~1400-1700）
- RoleTier 信息卡：当前 tier + 可见频道数 + 升级提示
- Pinned articles 网格 + Banners 堆叠 + 个性 Feed

### D.2 Articles 列表 `/articles` + 阅读器 `/articles/[id]`（PR-D-2）

- 列表：分类 pill + 筛选 + 搜索 + list/grid 切换 + 分页
- 阅读器：Markdown 渲染 + TOC + 阅读偏好（详见 SPEC-04）+ 标注 + 相关文章

### D.3 Reports `/reports` + `/reports/[id]`（PR-D-3）

- 列表：订阅 / 推荐 / 历史
- 阅读器：Markdown 渲染 + PDF 导出 + 引用块

### D.4 Analytics `/analytics`（PR-D-4）

- 5 个 tab：总览 / 地域 / 行业 / 重要性 / 交叉
- ECharts 主图（沿用现有 map-visualization spec）
- 数据来自 AI 聚合（详见 SPEC-03）

### D.5 Knowledge `/knowledge` + Category / Feedback / Settings（PR-D-5）

- Knowledge：3 列（实体列表 / canvas / inspector）
- Category：复用 `/articles?category=` 过滤
- Feedback：表单 + 历史 + admin 回复气泡
- Settings：6 tab（profile / notifications / appearance / security / api keys / system）

**验收**: 视觉对照原型 90%+ 一致；每页主流程可跑通；roleTier 内容过滤正确。

---

## Phase E — AI 集成

**任务编号**：#11  
**依赖**: SPEC-03（待写，依赖 research/01）  
**目标**：5 项 AI 能力端到端真实跑通。

### E.1 SiliconFlowClient（PR-E-1）

- 新增 `crates/law-eye-siliconflow/`（或扩展 `law-eye-ai-client`）
- bearer auth + 重试 / 超时 / 流式
- 错误映射 + degradation
- 单测：mock HTTP server 验证请求格式

### E.2 报告生成 + 知识图谱抽取（PR-E-2）

- Worker job：`report.generate` 与 `kg.extract`
- 提示词模板：`crates/law-eye-prompts/templates/{report,kg}.txt`
- 输出 schema 严格校验
- 落库 `reports` / `kg_entities` / `kg_relations`

### E.3 情感 + 地域行业 + 总结（PR-E-3）

- Worker jobs：`sentiment.score` / `region-industry.aggregate` / `article.summarize`
- 三档总结（1句 / 3句 / bullet）
- 地域行业聚合：周期性跑 + 按需触发
- 长文 map-reduce

**验收**: 用户 demo 账号可触发每项 AI；调用计入 `ai_usage_events`；失败有降级。

---

## Phase F — Reader UX + Markdown

**任务编号**：#9  
**依赖**: SPEC-04（待写）

### F.1 Markdown 编辑器（PR-F-1）

- 选型详见 SPEC-04
- 封装 `<MarkdownEditor>`（用于 admin 内容编辑）+ `<MarkdownReader>`（用户阅读）
- 插件：GFM / 高亮 / KaTeX / Mermaid / 图片上传 / @mention

### F.2 Banner 编排 + Pin（PR-F-2）

- `/admin/banners` 编辑器 + 受众 + 排期
- `/admin/pins` 拖拽排序 + 失效
- 用户端 `<BannerStack>` + `<PinnedSection>`

### F.3 阅读偏好 + 标注（PR-F-3）

- 阅读设置弹窗：字号 / 行高 / 主题 / 字体
- 标注 / 高亮（DOMPurify XSS 防护）
- 估读 / 稍后再读 / PDF 导出 / 引用块
- 持久化 `user_preferences`

**验收**: 阅读器 UX 与 SPEC-04 §3 表对齐；admin 可发 Banner / Pin。

---

## Phase G — 视觉灵动恢复

**任务编号**：#8  
**依赖**: SPEC-06（待写，依赖 research/02 + 03）

### G.1 设计令牌（PR-G-1）

- `globals.css` `@theme` 块重写
- 新增：`--surface-glass`, `--gradient-mesh`, 13 个分类 color, role badge color, 等

### G.2 Shell 视觉（PR-G-2）

- AdminShell / UserShell 视觉差异化（SPEC-02 §10）
- Sidebar / Topbar / 微动效
- Hero 渐变 + 数字滚动 + Stats strip

### G.3 全站 emoji 清理 + 图标审计（PR-G-3）

- grep 全代码 emoji 字符 → 替换为 lucide
- IconRegistry 注册表

**验收**: 视觉手测 5 个核心页与原型对齐；emoji 检查 0 命中。

---

## Phase H — 校验 + 审查 + 完成报告

**任务编号**：#13

### H.1 前端校验

- `pnpm typecheck` 0 error
- `pnpm lint` 0 error
- `pnpm test:unit` 全绿（新增 ≥ 60% 覆盖）
- `pnpm e2e`（核心 3 场景）
- `pnpm audit --audit-level high` 0 高危

### H.2 后端校验

- `cargo fmt -- --check`
- `cargo clippy --workspace -- -D warnings`
- `cargo test --workspace`
- 集成测：注册 → admin → 操作 / 注册 → user → 阅读

### H.3 GitNexus 审查

- `gitnexus_detect_changes()` 全 expected
- `gitnexus_impact()` 对每个核心改动符号确认 d=1 全更新

### H.4 视觉手测

- 用 demo 账号登录跑全流程
- 手测 5 个核心页对照原型

### H.5 完成报告

- `prompts/0425/COMPLETION-REPORT.md`：每 Phase 状态 + 证据 + 决策记录 + 已知问题
- 更新 `.trellis/spec/frontend/index.md` / `backend/index.md` 加 0425 入口
- `gitnexus analyze` 重建索引

---

## Agent Team 编排（多 agent 协作）

按用户要求"最多 3 agents 并行，可多次启动"。

### 第一波：研究（已启动 2026-04-25）

- Research-AI-Integration（agent 1）→ research/01-ai-integration.md
- Research-Editor-UX（agent 2）→ research/02-markdown-editor-and-reader-ux.md
- Research-Repo-Audit（agent 3）→ research/03-current-state-gap.md

### 第二波：Phase B 基础设施（research 完成 → 启动）

- Implement-Root-Redirect（trellis-implement）
- Implement-Workspace-Switcher（trellis-implement）
- Implement-ReBAC-Middleware（trellis-implement）

### 第三波：Phase C + D 并行（每波最多 3）

每波启动 3 个 trellis-implement，按 PR 颗粒度分配，避免文件冲突：

- C-1（admin dashboard）+ D-1（hero/feed）+ G-1（design tokens） — 文件不冲突

依次类推。

### 校验波：Phase H

- trellis-check（前端）
- trellis-check（后端）
- 视觉手测由主线手动跑（不能委托）

---

## 文件冲突防护

主线维护 "file lock map"（在每次启动 agent 前更新）：

```
agent-id : owned files
=========================================
Implement-A : apps/web/src/app/page.tsx, apps/web/src/lib/api/server.ts
Implement-B : apps/web/src/components/layout/shared/workspace-switcher.tsx, stores/workspace-store.ts
Implement-C : crates/law-eye-api/src/middleware/authz.rs, ...
```

每 agent 完成后 `git status` 检查是否仅修改了 owned files。

---

## 时间预算（参考）

| Phase | 预估 |
|---|---|
| A | 完成中（PRD/Spec 第一稿） |
| B | 30-60 分钟（3 PR 并行） |
| C | 90-120 分钟 |
| D | 90-120 分钟 |
| E | 60-90 分钟 |
| F | 60-90 分钟 |
| G | 30-60 分钟 |
| H | 30-60 分钟 |

总计 ≥ 6-9 小时（user 要求 8 小时持续工作）。

---

## 风险与缓解（实施期）

- **research agent 长时间未返回**：超时 30 分钟 → 主线先用骨架走，等返回再补
- **agent 间文件冲突**：实时维护 lock map，agent 启动前确认无冲突
- **API key 误入仓**：`.env.local` 仅本地，所有提交前 `git diff | grep -i "sk-"` 检查
- **typecheck baseline 漂移**：严格保持 `pnpm typecheck` 输出可对比
- **port conflict / image 增长**：每次涉及 docker 前 `docker images` / `docker ps -a` 

---

## 完成定义（DoD 复述）

见 PRD-MASTER §6。本 roadmap 用于跟踪交付，不替代 PRD 验收。
