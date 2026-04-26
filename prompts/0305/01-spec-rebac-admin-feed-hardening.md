# 0305 Spec：ReBAC、Feed、运营位、AI 与管理面板落地规范

## 文档定位

本文件是 0305 轮次的执行性 Spec。

- 上游设计基线：`prompts/0225/REBAC_AI_GOVERNANCE_SPEC_2026-02-25.md`
- 本轮运行态验证：`prompts/0305/04-validation-report.md`
- 本轮运行手册：`prompts/0305/05-runbook-p2-ai-runtime-recovery.md`

如果实现与旧文档不一致，以“真实运行态已验证的当前方案”为准。

## 当前架构基线

### 多租户与权限

- PostgreSQL + RLS + `session_tenants`
- 角色权限基线通过 `RequirePermission` 与 `roles/permissions` 字符串实现
- ReBAC 通过 `auth_relations`、`authz/check`、频道 / 来源 / 文章资源级判定叠加在租户边界之内

### 采集与 AI

- `sources -> queue -> worker -> crawler -> articles`
- `articles -> AI tasks -> entities / relations / article_chunks / embeddings`
- SiliconFlow 作为 OpenAI-compatible 提供方：
  - chat：`Qwen/Qwen3-8B`
  - embedding：`BAAI/bge-m3`
  - rerank：`BAAI/bge-reranker-v2-m3`

### 前端

- App Router
- 统一骨架：`Sidebar + Header + MainContent`
- React Query + Zustand
- Lucide 图标体系

## 本轮最终落地范围

### 1. Feed 聚合

后端聚合路由：

- `GET /api/v1/me/feed`

返回：

- `role_tier`
- `visible_channels`
- `banners`
- `pinned_articles`
- `articles`

规则：

- 先根据租户、关系、角色确定 `role_tier`
- 再按频道可见性裁剪 `visible_channels`
- 再按频道关联的 `category_id` 裁剪文章
- 文章与来源分别执行资源级 `authz/check`
- 置顶与横幅在返回前做二次排序

### 2. 频道、Banner、置顶

#### 频道

- `channels`
- `channel_access_policies`
- 管理员页：`/settings/admin/channels`

频道用于：

- 把分类映射为最终可见的阅读面
- 为不同角色 / 关系提供不同的内容入口

#### Banner

- `banners`
- `banner_targets`
- 管理员页：`/settings/admin/banners`
- 生命周期推进：`scheduled -> active -> expired -> archived`

#### 置顶

- `article_pins`
- 管理员页：`/settings/admin/pins`
- feed 中展示 `pinned_articles`

### 3. 管理员工作台

已在当前轮形成真实入口：

- `/settings/admin`
- `/settings/admin/users`
- `/settings/admin/relations`
- `/settings/admin/channels`
- `/settings/admin/banners`
- `/settings/admin/pins`
- `/settings/admin/feedbacks`
- `/settings/admin/audit`
- `/settings/admin/ai-usage`
- `/settings/admin/reports`
- `/settings/admin/knowledge`

### 4. 用户工作台

已在当前轮形成真实入口：

- `/me/feed`
- `/articles`
- `/reports`
- `/knowledge`
- `/feedback`

### 5. 消息中心

bell 点击行为要求：

- 只打开 header 内部消息中心面板
- 不跳转 `/settings?tab=notifications`
- 面板提供：
  - 最近通知占位与空态
  - 通知偏好入口
  - 反馈中心入口
  - 报告入口

### 6. 图标规范

禁止在最终用户可见路径中直接显示 Emoji 图标。

统一策略：

- UI 层使用 Lucide 图标映射
- 数据层 `categories.icon` 使用非 Emoji 标识字符串，例如：
  - `scroll-text`
  - `building-2`
  - `scale`
  - `briefcase`

### 7. 运行态端口基线

当前稳定映射：

- API：`3001`
- Web：`18849`
- PostgreSQL：`5435`
- Redis：`6380`
- MinIO：`9000 / 9001`

### 8. 真实 source 适配

当前轮已在运行态确认：

- `miit_gov`
- `samr_gov`

策略：

- 优先寻找站点自身真实 JSON / 搜索接口
- 不优先引入新的浏览器渲染镜像
- source 可用性必须在 crawler live probe 与 worker 真入库两层都可验证

### 9. RAG 规范

当前轮真实闭环：

- `POST /api/v1/knowledge/backfill-rag`
- `POST /api/v1/search/semantic`
- `POST /api/v1/search/ask`

要求：

- semantic 命中真实 `article_chunks`
- ask 基于真实 source 与 chunk 返回答案
- telemetry 能在 `admin/ai-usage` 回读

### 10. 迁移策略

严格禁止修改已应用历史迁移。

当前轮新增迁移：

- `crates/law-eye-db/migrations/063_category_icons_no_emoji.sql`

用途：

- 把分类图标从 Emoji 统一迁移为非 Emoji 标识字符串
- 保证旧库与新库都能收敛到同一 UI 规范

## 验收矩阵

### API

- `/health`
- `/api/v1/me/feed`
- `/api/v1/sources/{id}/fetch`
- `/api/v1/admin/banners`
- `/api/v1/admin/article-pins`
- `/api/v1/search/semantic`
- `/api/v1/search/ask`

### 数据库

- source 入库数
- published 文章数
- article_chunks / embedding 覆盖率
- banner / pin / channels 存在性

### 浏览器

- `/zh/me/feed`
- `/zh/settings/admin/banners`
- `/zh/settings/admin/relations`
- `/zh/settings/admin/users`
- `/zh/sources`

## 当前轮结论

本轮方案已从“设计要求”推进为“真实运行态闭环”，并具备继续进入更高强度工程化清扫的基础。
