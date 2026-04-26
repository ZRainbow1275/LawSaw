# LawSaw 0425 Enterprise Rebuild — PRD Master

**版本**: 1.0.0  
**起草**: 2026-04-25  
**所有者**: Codex (LawSaw 主线)  
**任务目录**: `.trellis/tasks/04-25-04-25-enterprise-rebuild-rebac-panels-ai/`  
**前序参考**: `prompts/0322/USER_END_ARCHITECTURE.md`, `prompts/0322/REBAC_USER_END.md`, `prompts/0322/PAGE_SPECS.md`, `prototype/app.html`, `.trellis/spec/frontend/`, `.trellis/spec/backend/`

---

## 0. 文档导航

本 PRD 是**总纲**。具体技术契约见同目录下 6 份 SPEC：

| Spec | 范围 | 状态 |
|---|---|---|
| `SPEC-01-REBAC-AUTHZ.md` | 5-tier 角色矩阵 + 资源-关系-主体规则 + 后端 RLS 硬化 | 待编写 |
| `SPEC-02-DUAL-PANEL.md` | Admin / User 双面板信息架构 + 路由分发 + Workspace 切换 | 待编写 |
| `SPEC-03-AI-INTEGRATION.md` | SiliconFlow 集成 + 5 项 AI 能力 prompt 模板 + 降级策略 | 待编写 |
| `SPEC-04-READER-UX.md` | Markdown 编辑器 + 阅读视图 + Banner / Pin + 标注 / 高亮 | 待编写 |
| `SPEC-05-CONTENT-TAXONOMY.md` | 法律资讯分类分级 + 频道可见性 + Tag 体系 | 待编写 |
| `SPEC-06-VISUAL-DESIGN.md` | 设计令牌 + 灵动气质恢复 + lucide 无 emoji 图标 | 待编写 |

执行计划见 `IMPLEMENTATION-ROADMAP.md`，完成报告见 `COMPLETION-REPORT.md`（待生成）。

---

## 1. Goal（目标）

把 LawSaw 从"admin 一锅炖"的当前态，重塑为**企业级双面板法律资讯智能平台**：管理员对内运营治理，用户对外沉浸阅读，AI 能力真实跑通，阅读体验回到原型 `prototype/app.html` 的"灵动气质"基准，分类分级反映真实法律资讯结构。

**单句目标**：登录后 5 档角色看到与其权限严格对应的不同壳，所有 AI 能力调用真实硅基流动 API，Markdown 编辑器与原型视觉一致，0 mock、0 emoji、0 重复构建。

---

## 2. 背景与现状（Why）

### 2.1 用户痛点（来自 2026-04-25 反馈）

1. **路由分发失败**：`/` 直接渲染 admin-flavored Dashboard，没有按 `roleTier` 重定向 → 用户端 `/me/feed` 被边缘化。
2. **双面板缺失**：Sidebar 把 `/me/feed` 与 `/settings/admin/*` 混杂同一菜单，缺 Workspace（管理 / 用户）切换器。
3. **视觉退化**："白花花一大片"，丢了原型的渐变 mesh、玻璃态、微动效、节奏感。
4. **AI 能力空壳**：报告 / 知识图谱 / 情感 / 地域行业 / 新闻总结要么 stub，要么未调真实 API。
5. **分类分级失真**：未反映法律资讯的真实立法 / 监管 / 执法 / 司法 / 学术 / 国际多维结构。
6. **阅读体验不达**：缺 Banner、Pin（仅管理员）、Markdown 编辑器、标注 / 高亮、TOC、阅读偏好。

### 2.2 现状证据（详见 `research/03-current-state-gap.md`）

- `apps/web/src/app/page.tsx` = 系统监控 Dashboard（admin 风味），无角色重定向
- `apps/web/src/app/[locale]/page.tsx` 仅 `export { default } from "../page"` — 无 locale-aware 分发
- 所有 admin 子路由位于 `/settings/admin/*` 下，与用户视角混杂
- 已有 ReBAC migrations 050-058 但前端未充分利用 `roleTier`
- AI 集成在 `crates/law-eye-ai-*` 等 crate 中部分实装，但 5 项核心能力非真实端到端

---

## 3. Scope（范围）

### 3.1 In Scope（5 大支柱 + 1 视觉支柱）

#### 支柱 A — ReBAC 角色权限矩阵（详见 SPEC-01）

5 档 RoleTier 严格分级：

| Tier | 后端角色 | 关键能力（白名单） |
|---|---|---|
| **super_admin** | `super_admin` | 跨租户 / 渠道源发布与管理 / API key / 用户角色分配 / 反馈处理 / 知识图谱治理 / Banner / Pin / 全部审计 / AI 治理 |
| **tenant_admin** | `tenant_admin`, `admin` | 租户内：用户权限分配 / 反馈处理 / 频道增设 / Banner / Pin / 报告模板 / 知识图谱编辑 / AI 配额 |
| **premium_user** | `premium_user` | 全部频道文章 + 完整来源 + AI 深度分析 + 完整报告导出 + 知识图谱查询 |
| **verified_user** | `verified_user`, `editor` | 扩展频道文章 + 来源元数据（部分）+ 基础 AI + 报告查看 + KG 查询 |
| **basic_user** | `viewer`, 默认 | 公开频道文章（标题 + 摘要 200 字）+ 仅来源名 + 无 AI / 无报告导出 / 仅 KG 浏览 |

#### 支柱 B — 双面板架构（详见 SPEC-02）

```
登录 → / 根路由
       ├─ super_admin / tenant_admin → /admin（管理员面板，全新顶层路由）
       └─ basic_user / verified_user / premium_user → /me/feed（用户沉浸面板）

Admin 面板 (`/admin/*`)：
  ├─ /admin                  — 总览（运营仪表盘 + 系统健康）
  ├─ /admin/users            — 用户管理（角色分配 / 状态 / 邀请）
  ├─ /admin/relations        — ReBAC 关系图谱 + 关系元组管理
  ├─ /admin/permissions      — 权限矩阵可视化 + 审计回溯
  ├─ /admin/channels         — 频道增删改 + 可见性策略 + 订阅源映射
  ├─ /admin/sources          — 渠道源管理（爬虫策略 / 健康 / 调度）
  ├─ /admin/banners          — 横幅编排（受众 / 优先级 / 排期）
  ├─ /admin/pins             — 文章置顶（按频道 / 全局 / 排序 / 失效）
  ├─ /admin/reports          — 报告模板 / 订阅 / AI 生成调度
  ├─ /admin/knowledge        — 知识图谱编辑（实体 / 关系 / 合并 / 来源）
  ├─ /admin/feedback         — 用户反馈处理（分类 / 回复 / 工单）
  ├─ /admin/apikeys          — API Key 管理（轮换 / scope / 速率）
  ├─ /admin/ai-governance    — AI 配额 / 模型选择 / 提示词版本 / 用量
  ├─ /admin/audit            — 审计日志（含 tamper-proof 链）
  └─ /admin/settings         — 租户设置 / 配置 / Webhook / 通知

User 面板（保留现有路径，提升一致性）：
  ├─ /me                     — 个人门户（feed 入口 / 资料 / 订阅）
  ├─ /me/feed                — 沉浸 Feed（RoleTier 卡 / Pinned / Banners / 个性流）
  ├─ /articles               — 全文章列表（分类 / 筛选 / 搜索）
  ├─ /articles/[id]          — 文章阅读器（Markdown 渲染 + TOC + 标注）
  ├─ /reports                — 报告订阅 + 浏览 + 导出
  ├─ /reports/[id]           — 报告阅读器
  ├─ /analytics              — 用户级统计（地域 / 行业 / 趋势）
  ├─ /knowledge              — 知识图谱查询（只读 / 部分编辑）
  ├─ /category/[slug]        — 分类视图
  ├─ /feedback               — 反馈提交 + 历史
  └─ /settings               — 个人偏好 / 通知 / 安全 / API key
```

**Workspace 切换器**：双角色用户（admin 同时也是用户）顶部右侧增加 Workspace switcher，可在 `/admin` 与 `/me/feed` 之间快速切换，session_tenants 表已支持。

#### 支柱 C — AI 真实集成（详见 SPEC-03）

5 项能力全部端到端跑通，无 mock：

| 能力 | 模型 | 输入 | 输出契约 | UI 触点 |
|---|---|---|---|---|
| 报告生成 | Qwen3-8B | 选定文章集合 + 模板 | Markdown 多段 + JSON 元数据 | `/admin/reports` 触发 + `/reports` 浏览 |
| 知识图谱抽取 | Qwen3-8B + bge-m3 dedup | 文章正文 | 实体 / 关系 JSON（严格 schema） | `/admin/knowledge` 审核 + `/knowledge` 查询 |
| 情感分析 | Qwen3-8B | 段落 | sentiment + score + rationale | 文章详情侧栏 / Analytics |
| 地域行业 | Qwen3-8B 聚合 + bge-reranker | 批量文章 | regions / industries / cross 矩阵 | `/analytics` 主图 |
| 新闻总结 | Qwen3-8B（map-reduce） | 文章正文 | 1句 / 3句 / bullet 三档 | 卡片 hover / 阅读器顶部 |

降级策略：AI 超时 → 降级到缓存 / BM25 / 规则；UI 显示状态徽章。

#### 支柱 D — Markdown 阅读管理体验（详见 SPEC-04）

- Markdown 编辑器：源文 + 渲染**双视图**（用户可见 raw 语法，但实时预览），用于 admin 编辑文章 / 公告 / 报告，用户提交反馈
- 横幅 Banner：Admin 编排，按租户 / 角色 / 频道定向；用户可关闭
- 置顶 Pin：仅 admin，按频道或全局，含失效时间
- 阅读视图：滚动进度 / 自动 TOC / 字号-行高-主题切换 / 标注高亮（DOMPurify XSS 防护）/ 相关文章 / 估读时长 / 稍后再读 / PDF 导出 / 引用块
- 用户偏好：阅读偏好持久化到 `user_preferences` JSONB

#### 支柱 E — 内容分类分级（详见 SPEC-05）

法律资讯真实主分类（基于市面参考调研）：

```
立法动态 / 监管执法 / 司法案例 / 行业合规 / 学术研究 /
国际动态 / 数据保护 / 安全合规 / 反垄断 / ESG / 金融监管 / 知识产权 / 劳动用工
```

层级：Category → Subcategory → Tag。频道（Channel）独立维度，按 visibility（public/restricted/verified/premium）控制。

#### 支柱 F — 视觉灵动恢复（详见 SPEC-06）

基于 `prototype/app.html` 抽取设计令牌，恢复：

- 背景渐变 mesh（不是纯白）
- 卡片玻璃态（backdrop-filter blur + border + glow）
- 主色 / 辅色 / 警示 / 信息 / 法规专色
- Framer Motion staggered children 动画
- Sidebar 微动效（hover / 选中）
- Hero 渐变 + 数字滚动计数器
- 节奏 spacing (4 / 8 / 12 / 16 / 24)
- Lucide 图标全替代 emoji

### 3.2 Out of Scope（明确不做）

- 不在本轮做：跨租户数据迁移、移动端 native、P2P 文章分享、白标 / SaaS 多租户开通自助流程、计费 / 订阅付费链路
- 不引入新数据库（沿用 PostgreSQL + pgvector + Redis）
- 不引入新前端框架（沿用 Next.js 16 + React 19 + Tailwind 4）
- 不引入新 AI 厂商（仅硅基流动 + Qwen3-8B + bge-m3 + bge-reranker-v2-m3）
- 不做 SSE / 长连接（除已有 webhook 体系）

---

## 4. Stakeholders（利益相关方）

| 角色 | 关心点 | 接收物 |
|---|---|---|
| 项目所有者（用户） | 80,000 美元价值的成品 | 完整代码 + COMPLETION-REPORT.md + Demo 视频可选 |
| Super admin（演示） | 跨租户治理、API key、知识图谱审核 | `/admin/*` 全套面板 |
| Tenant admin | 租户运营、反馈处理、Banner / Pin | `/admin/*` 限定子集 |
| Premium user | 完整文章、AI 深度分析、报告导出 | `/me/*` + `/articles` + `/reports` 完整能力 |
| Verified user | 扩展频道、基础 AI | `/me/*` + 限定能力 |
| Basic user | 公开内容、订阅入门 | `/me/*` 入门 + 升级提示 |

---

## 5. Acceptance Criteria（验收）

### 5.1 路由与分发

- [ ] `/` 已登录访问按 `roleTier` 重定向（admin → `/admin`，end-user → `/me/feed`）
- [ ] `/[locale]` 同样支持（locale 前缀保留）
- [ ] 未登录访问任意保护路径 → `/login` 并保留 `next` 参数
- [ ] basic / verified / premium 用户访问 `/admin/*` 任意子路径 → 403 + 友好降级页
- [ ] super_admin / tenant_admin 访问 `/me/*` 仍可用（用于自查用户视角），顶部 Workspace switcher 醒目

### 5.2 ReBAC 矩阵

- [ ] `derive_role_tier_from_names` 后端单元测试覆盖 5 档 + 多角色混合场景
- [ ] `/api/v1/me/feed` 返回结果按 `roleTier` 严格过滤（basic 仅 public 频道、verified +verified 频道、premium 全部）
- [ ] `/api/v1/articles/{id}` 对 basic 返回标题 + 摘要 200 字截断 + 来源名（无 URL）
- [ ] 所有 `/admin/*` 后端路由含 `RequirePermission` middleware
- [ ] `/api/v1/authz/check` 决策路径包含 tenant 隔离 + 关系匹配 + 角色基线 3 步审计

### 5.3 AI 真实集成

- [ ] 报告生成：在 `/admin/reports/new` 选 ≥ 5 篇文章 + 模板 → 真实调用 SiliconFlow → 30-60s 内返回 Markdown
- [ ] 知识图谱：选 1 篇文章触发抽取 → 落库（entities + relations）→ `/admin/knowledge` 可见
- [ ] 情感分析：文章详情页加载时异步调用 → 结果缓存 → 重复访问无重复调用
- [ ] 地域行业：`/analytics` 加载时使用预聚合（worker 定时跑），非每次重算
- [ ] 新闻总结：长文章（>4k tokens）使用 map-reduce 不丢失关键信息
- [ ] 全部 AI 调用计入 `ai_usage_events` 表 + 速率限制
- [ ] AI 失败 / 超时 → 优雅降级 + UI 状态徽章

### 5.4 Reader UX

- [ ] Markdown 编辑器在 admin 编辑文章 / 公告 / 报告模板时可见 raw + preview 双视图
- [ ] Banner 在 `/me/feed` 顶部显示，admin 可在 `/admin/banners` 编排（受众 / 排期 / 优先级 / dismissable）
- [ ] Pin 在 `/me/feed` 与 `/articles` 顶部独立 section 显示
- [ ] 文章阅读器：滚动进度条 / 自动 TOC（H1-H3）/ 字号 + 行高 + 主题切换 / 标注 / 估读
- [ ] 阅读偏好持久化（cookie + DB 双写）

### 5.5 分类分级

- [ ] 13 个一级分类落库（migration），有 i18n 名称 + 图标 + 颜色 + 描述
- [ ] 文章必有 ≥ 1 分类 + ≥ 0 子分类 + tags（数组）
- [ ] `/articles?category=xxx&subcategory=yyy&tag=zzz` 三级筛选可用
- [ ] 频道（Channel）与分类（Category）正交，独立管理

### 5.6 视觉灵动

- [ ] `apps/web/src/app/globals.css` 设计令牌 ≥ 30 项（颜色 / 间距 / 阴影 / 模糊 / 渐变）
- [ ] 所有页面无纯白底色，至少有渐变 mesh 或纹理
- [ ] 卡片有玻璃态（backdrop-blur + 半透明 + 边框 + 微 shadow）
- [ ] 至少 5 个核心页（Dashboard / Feed / Article / Analytics / Admin） 有 staggered 入场动画
- [ ] 全站 0 emoji 字符（lint + grep 验证）
- [ ] Lucide 图标使用 ≥ 80 项不同 icon

### 5.7 工程质量

- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm lint` 0 error
- [ ] `pnpm test:unit` 全绿，新增覆盖 ≥ 60%
- [ ] `cargo test --workspace` 全绿
- [ ] Playwright 跑 ≥ 3 个核心场景（admin 流 / user 流 / role 切换）
- [ ] `gitnexus_detect_changes()` 输出 expected-only diff
- [ ] `pnpm audit` 高危 0
- [ ] 0 重复 build / 0 端口冲突 / 0 增 image

---

## 6. Definition of Done（团队质量门）

1. **代码完整**：每个 Phase 的产出物都已合入 master 分支并通过 CI
2. **文档同步**：每个支柱对应 spec 已标 `Status: Implemented` + `.trellis/spec/` 索引更新
3. **Spec 索引**：在 `.trellis/spec/frontend/index.md` / `backend/index.md` 加 0425 docs 入口
4. **审计通过**：`trellis-check` agent 跑过 + 无 HIGH/CRITICAL warning
5. **手测覆盖**：用户提供的 demo 账号能完整跑通 admin 流 + 注册 basic 账号能跑通 user 流
6. **Completion Report**：`prompts/0425/COMPLETION-REPORT.md` 含证据截图 / 命令输出 / 决策记录

---

## 7. Technical Approach（技术路线总纲）

### 7.1 前端

- **路由**：将 `apps/web/src/app/page.tsx` 改为服务端组件，调用 `/api/v1/auth/me` → 按 `role_tier` 用 `redirect()` 分发；同步在 `proxy.ts` 处理 locale。
- **路由树重组**：
  - 新增 `apps/web/src/app/[locale]/admin/` 顶层组（带 `layout.tsx` 强制 tenant_admin / super_admin guard）
  - 把现 `settings/admin/*` 移动到 `admin/*` 并保留 redirect 兼容
- **Workspace switcher**：在 `Header` 组件右侧加；持久化选择到 `useUiStore`
- **AI 调用层**：在 `apps/web/src/lib/api/ai.ts` 暴露 typed hooks（`useArticleSummary`, `useReportGenerate`, `useKgExtract`, `useSentiment`, `useRegionIndustry`），React Query 缓存
- **Markdown 编辑器**：基于 research 推荐（候选：Vditor / Milkdown / MDXEditor），统一封装为 `<MarkdownEditor>` + `<MarkdownReader>`
- **视觉令牌**：`globals.css` 重写 `@theme` 块，复刻原型令牌；新增 `surface-*`, `glass-*`, `gradient-*` 变量
- **图标**：`lucide-react` 全覆盖，新增 `IconRegistry` 映射表（在 spec-06）

### 7.2 后端

- **路由分组**：`/api/v1/admin/*` 与 `/api/v1/me/*` 命名空间清晰；中间件 `RequireRoleTier(min: tenant_admin)` / `RequireRoleTier(min: verified_user)`
- **AI 客户端**：新增 `crates/law-eye-siliconflow/`（或扩展 `law-eye-ai-client`）含 `SiliconFlowClient` trait，bearer auth + 重试 + 超时；prompt 模板放 `crates/law-eye-prompts/`
- **AI 调度**：`law-eye-worker` 增加 5 类 job（report.generate / kg.extract / sentiment.score / region-industry.aggregate / article.summarize），通过 outbox 队列消费
- **分类分级**：新增 migration `064_taxonomy_v2.sql` 增 `categories` 表的 `level`, `parent_id`, `order`, `metadata`，以及 `article_categories` 多对多
- **Banner / Pin**：复用现有 migration 057 / 058，加 admin CRUD 路由
- **审计**：所有 admin 操作 → `audit_logs`（已 tamper-proof，migration 009/011/022）

### 7.3 集成 / 部署

- **Docker 端口**：沿用 8849 (web) / 3001 (api) / 5432 (pg) / 6379 (redis) / 9000 (object storage)。**禁止新增 image / container**；变更 Dockerfile 时必须先 `docker images` + `docker ps -a` 检查
- **环境变量**：新增 `LAW_EYE__AI__SILICONFLOW_API_KEY` (env file 占位)，**永不提交真实 key**
- **CI**：复用现有 `.github/workflows/`，本轮不修改 CI；只在本地完成验证
- **回滚**：所有 schema 变更必须有 `down` 脚本，feature flag 开关默认开

---

## 8. Decision (ADR-lite) — 关键决策

### ADR-01 — 双面板 vs 单壳分发

**Context**：0322 spec 模糊，原意可能是"单壳 + 角色路由 + 内部渲染分支"，但当前实现完全没有路由分发；用户明确要求"双面板"。

**Decision**：采用**双面板 + 路由分发 + Workspace 切换器**混合方案：
- 物理上有 `/admin` 与 `/me/feed` 两组路由
- 根路由按 RoleTier 自动分发
- admin 用户顶部有 Workspace switcher 可手动跳转用户视角
- 普通用户**无法**进入 `/admin/*`

**Consequences**：+ 视觉与心智边界清晰；+ 后续移动端可分别打包；- 共享组件需提取到 `components/shared/`；- session_tenants 切换需谨慎（避免 cookie 漂移）

### ADR-02 — Markdown 编辑器选型

**Decision**：待 `research/02-markdown-editor-and-reader-ux.md` 输出后于 SPEC-04 锁定。预备候选：Vditor（IR 模式最契合用户描述）。

### ADR-03 — AI 客户端落点

**Decision**：扩展现有 `crates/law-eye-ai-*`（详细落点待 `research/01-ai-integration.md` 输出后定）。不新建独立 crate 除非合理。

### ADR-04 — 路由迁移策略

**Decision**：
- 新增 `app/[locale]/admin/*` 路径
- 旧 `app/[locale]/settings/admin/*` 改为 redirect（仅地址栏跳转，不丢链接）
- `/me/*` 保留原状，仅扩展子页

**Consequences**：旧链接（含外部书签）平滑迁移；面板独立后未来可拆分构建。

### ADR-05 — 视觉恢复策略

**Decision**：以 `prototype/app.html` 为视觉真源，提取令牌写入 `globals.css`，逐页对照像素。**不引入第三方 UI 库**（保持已用的 lucide + tailwind + framer-motion 组合）。

---

## 9. Implementation Plan — 阶段化（小 PR）

详见 `IMPLEMENTATION-ROADMAP.md`。简表：

| Phase | 工作 | 预估 PR | 任务编号 |
|---|---|---|---|
| A | PRD + Spec 文档（本目录） | 1 docs PR | TaskCreate #6 |
| B | 基础设施：root redirect + Workspace switcher + ReBAC tightening | 2 PR | #10 |
| C | 管理员面板 13 个子路由 | 4-5 PR | #7 |
| D | 用户面板 9 个核心页 | 4-5 PR | #12 |
| E | AI 集成 5 项能力 | 3 PR | #11 |
| F | Reader UX (Markdown 编辑器 / Banner / Pin / 分类) | 3 PR | #9 |
| G | 视觉灵动恢复 + 设计令牌 | 2 PR | #8 |
| H | 校验 + 审查 + 报告 | 1 PR | #13 |

---

## 10. Quality Bars（绝对约束）

1. **0 emoji**：源代码 / UI / 文档全无 emoji 字符（U+1F300..U+1FAFF / U+2600..U+27BF）。Lucide 图标替代。
2. **0 mock**：禁止 mock data、模拟操作、占位符。所有功能端到端真实。
3. **0 重复构建**：变更前 `docker images` / `docker ps -a` 检查；改 deps 前 `pnpm list` 验证；不重复 `pnpm install`。
4. **0 强制终止外部 node**：`taskkill` 限本项目相关进程（按 PID 不按 name）。
5. **0 端口冲突**：变更端口前 `netstat -ano | grep <port>`。
6. **Python（非 python3）**：Windows 系统 pyhon CLI 名为 `python`。
7. **Playwright 复用**：禁止重新下载 chromium（已安装）。
8. **API key 不入仓**：`sk-vzfaqdihhstcgfbeooscfhkufzegezuowwdiegzbsvcxjrqf` 仅在 `.env.local`。
9. **冗余开发**：UI 防呆 + 后端校验 + 错误友好提示三层。
10. **文档驱动**：spec 先于代码；每写完一个支柱，回查 spec 是否需要更新。

---

## 11. Risks & Mitigations（风险登记）

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | SiliconFlow 免费 QPS 限制阻断 demo | 高 | 缓存 / 排队 / 退避 / 降级 |
| 2 | Next.js 16 删除 middleware 致 locale 漂移 | 中 | 已用 proxy.ts；增 e2e |
| 3 | session_tenants 切换 vs 浏览器 cookie 漂移 | 高 | 切换时主动 cycle session_id；前端清缓存 |
| 4 | Workspace 切换器误关 admin 栈致用户被锁 | 中 | 服务端二次校验，提供 `/admin` 直链兜底 |
| 5 | 视觉令牌大改导致回归 | 中 | 改 token 不改 component；视觉手测覆盖核心 5 页 |
| 6 | KG 抽取产生脏数据 | 中 | admin 审核队列 + dedup（bge-m3 余弦阈值）|
| 7 | Markdown 编辑器 SSR 不友好 | 低 | dynamic import + skeleton |
| 8 | 路由迁移破坏外链 | 低 | redirect map + e2e |
| 9 | 多 agent 编辑同一文件冲突 | 中 | 每 agent 严格分领 file 路径 + git status 检查 |
| 10 | API key 误入仓 | 高 | git pre-commit hook + .env 文件白名单 |

---

## 12. References（参考与依赖）

### 12.1 内部文档

- `prompts/0322/USER_END_ARCHITECTURE.md` — 用户端架构基线
- `prompts/0322/REBAC_USER_END.md` — ReBAC 集成规范
- `prompts/0322/PAGE_SPECS.md` — 页面规范
- `prompts/0322/DESIGN_SYSTEM_COMPLIANCE.md` — 设计系统
- `prompts/0322/MAP_VISUALIZATION_SPEC.md` — 地图可视化
- `prompts/0322/DEVELOPMENT_RUNBOOK.md` — 开发流程
- `.trellis/spec/frontend/{index, rebac-ui, rebac-user-end, user-end-pages, editor-markdown, design-compliance, accessibility, command-palette}.md`
- `.trellis/spec/backend/{index, ai-governance, rebac-phases, audit-log, error-handling}.md`
- `prototype/app.html` — 视觉与交互真源
- `crates/law-eye-db/migrations/{050..063}_*.sql` — ReBAC / Banner / Pin / AI usage / Reports / Taxonomy 基础

### 12.2 研究产出（待生成）

- `research/01-ai-integration.md`
- `research/02-markdown-editor-and-reader-ux.md`
- `research/03-current-state-gap.md`

### 12.3 外部参考

- SiliconFlow: https://docs.siliconflow.cn/
- Qwen3-8B model card: HuggingFace
- bge-m3 / bge-reranker-v2-m3: BAAI repos
- Next.js 16 docs: https://nextjs.org/docs

---

## 13. Glossary（术语）

| 词 | 含义 |
|---|---|
| RoleTier | 5 档角色层级，与具体角色名 (`role_names`) 解耦 |
| Channel | 内容订阅源 + 受众组合的逻辑单元（含 visibility） |
| Category | 文章主分类（≤ 13 个一级） |
| Subcategory | 二级分类 |
| Tag | 自由标签（多对多） |
| Banner | 顶部横幅，可定向 / 排期 / dismiss |
| Pin | 文章置顶（仅 admin），有失效 |
| Workspace | "管理员视角" 与 "用户视角" 的逻辑切换 |
| ReBAC | Relation-Based Access Control（关系式权限）|
| AI Usage Event | 单次 AI 调用日志（用于配额、审计、计费）|

---

## 14. Document Lifecycle

- **状态**: Draft v1.0
- **下次更新**: 等 3 个 research agent 完成后追加 §3.5 / §7 / §8 技术细节
- **审批**: 用户已授权"无需我的确认，直到将所有任务全部完成为止"
- **归档**: 任务完成后归档到 `prompts/0425/archive/`
