# 0305 Implementation Checklist

## 文档与规范

- [x] 建立 `prompts/0305` 作为本轮唯一交付文档集
- [x] 形成 PRD / Spec / Gap / Checklist / Validation / Runbook 六件套
- [x] 规范化当前轮端口、运行手册与实证结果

## P0：UI 骨架与消息中心

- [x] 稳定 Sidebar / Header / MainContent 骨架层
- [x] 右上角 bell 改为消息中心面板
- [x] 浏览器验证 bell 点击后不再跳设置页
- [x] 前端移除当前用户可见路径中的分类 Emoji 兜底

## P0：公网真实 source

- [x] `miit_gov` 当前轮新租户 live ingest 成功
- [x] `samr_gov` 当前轮新租户 live ingest 成功
- [x] 当前轮新租户下两条 source 均为 `health_status=healthy`

## P0：Feed 与阅读链路

- [x] `/api/v1/me/feed` 聚合端点进入运行态
- [x] `/zh/me/feed` 消费真实 feed 数据
- [x] 当前轮新租户创建频道 2 条
- [x] 当前轮新租户创建 active banner 1 条
- [x] 当前轮新租户创建 article pin 1 条
- [x] 当前轮新租户批量发布文章，`updated=17`
- [x] 当前轮新租户 feed 回包：`visible_channels=2`
- [x] 当前轮新租户 feed 回包：`banners=1`
- [x] 当前轮新租户 feed 回包：`pinned_articles=1`
- [x] 当前轮新租户 feed 回包：`articles=16`

## P0：运行态根因修复

- [x] 修复 `crates/law-eye-core/src/article/service.rs` 中 `ANY($1)` 占位符丢失
- [x] 修复 `crates/law-eye-worker/src/main.rs` 中 `WHERE id = $1` 丢失
- [x] 修复 `crates/law-eye-core/src/article_pin.rs` 默认 `starts_at` 缺失导致的 500
- [x] 真实重建 `worker`
- [x] 真实重建 `api`
- [x] 真实重建 `web`

## P1：管理员与用户面板

- [x] `/settings/admin`
- [x] `/settings/admin/users`
- [x] `/settings/admin/relations`
- [x] `/settings/admin/channels`
- [x] `/settings/admin/banners`
- [x] `/settings/admin/pins`
- [x] `/settings/admin/feedbacks`
- [x] `/settings/admin/audit`
- [x] `/settings/admin/ai-usage`
- [x] `/settings/admin/reports`
- [x] `/settings/admin/knowledge`
- [x] `/me/feed`

## P2：AI / Knowledge / RAG

- [x] `backfill-rag` 当前 API 运行态返回 200
- [x] 新租户 `article_chunks=18`
- [x] 新租户 `chunks_with_embedding=18`
- [x] `POST /api/v1/search/semantic` 返回 5 条结果
- [x] `POST /api/v1/search/ask` 返回答案、`sources=5`、`confidence=0.95`
- [x] `admin/ai-usage` 回读真实 telemetry

## 浏览器级回归

- [x] `/zh/me/feed`
- [x] `/zh/settings/admin/banners`
- [x] `/zh/settings/admin/relations`
- [x] `/zh/settings/admin/users`
- [x] `/zh/sources`
- [x] 登录后仪表盘正常展示，无旧版 feed 契约报错

## 当前轮最终结论

- [x] 当前用户可见交付面已达到真实可用、可验收状态
- [x] 关键结果已沉淀到验证报告与 runbook

## 2026-03-10 瑕疵清扫追加

- [x] `063_category_icons_no_emoji.sql` 已真正应用到当前数据库，`_sqlx_migrations.version=63`。
- [x] API 健康检查已切换为轻量 `GET /health/live`，容器当前 `healthy`。
- [x] `backfill-rag` 已过滤无正文文章；当前租户复测返回 `articles_enqueued=0`，不再重复灌入无效任务。
- [x] AI 优先队列 `queue:ai:priority` 已接入 worker 优先消费路径。
- [x] 本地 Playwright 默认 `baseURL` 已切到 `http://127.0.0.1:18849`。
- [x] 管理员频道页的可见性选项与策略布尔文案已完成中文化。
