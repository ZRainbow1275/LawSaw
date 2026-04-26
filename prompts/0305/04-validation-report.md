# 0305 Validation Report

## 1. 当前稳定运行态

### 端口

- API：`http://127.0.0.1:3001`
- Web：`http://127.0.0.1:18849`
- PostgreSQL：`127.0.0.1:5435`
- Redis：`127.0.0.1:6380`
- MinIO：`127.0.0.1:9000 / 9001`

### 健康检查

真实 `GET /health` 返回：

- `status=ok`
- `postgres.ok=true`
- `redis.ok=true`
- `object_storage.available=true`
- `ai.available=true`
- `chat.model=Qwen/Qwen3-8B`
- `embedding.model=BAAI/bge-m3`
- `rerank.model=BAAI/bge-reranker-v2-m3`

## 2. 当前轮新增真实租户

- `tenant_slug = codex1773080708`
- `tenant_id = 6469b900-7b97-4aeb-bb9e-cfeebced010f`
- `email = codex1773080708@example.com`
- `display_name = Codex QA`

真实接口结果：

- `POST /api/v1/auth/register -> 201`
- `POST /api/v1/auth/login -> 200`
- `GET /api/v1/auth/me -> 200`

## 3. 公网真实 source 实证

### 当前租户 source

- `3c92d32e-bca7-496a-b807-d0be973a3962` -> `miit_gov`
- `b45ddbee-0c48-4a14-af2b-49aab8c2dde5` -> `samr_gov`

### 数据库真值

- `miit_gov.total_articles_fetched = 10`
- `samr_gov.total_articles_fetched = 10`
- 二者 `health_status = healthy`
- 二者 `last_error = NULL`

### worker / crawler 真日志

已在当前轮 worker 日志中确认：

- `miit_gov`：`articles_found=10`、`articles_new=8`
- `samr_gov`：`articles_found=10`、`articles_new=9`
- 均出现 `Crawl run completed successfully`
- 均出现 `Upserted N articles`

## 4. 当前租户资讯流闭环

### 数据库真值

- `articles = 17`
- `published = 17`
- `banners = 1`
- `pins = 1`

### 频道

- `立法前沿频道`
- `监管动向频道`

### feed 真回包

真实 `GET /api/v1/me/feed` 返回统计：

- `role_tier = tenant_admin`
- `visible_channels = 2`
- `banners = 1`
- `pinned_articles = 1`
- `articles = 16`

### 真实运营位

- 横幅：`租户验证横幅`
- 置顶文章：`中华人民共和国工业和信息化部公告2026年第4号`

## 5. RAG 与搜索实证

### 数据库真值

- `article_chunks = 18`
- `chunks_with_embedding = 18`

### semantic search

真实调用：

- `POST /api/v1/search/semantic`
- `query = 光伏组件 综合利用 指导意见`
- `limit = 5`

结果：

- `results = 5`
- Top hit article = `34fd2e09-d516-463d-8d09-5ac070669805`
- 命中文章标题为《工业和信息化部等六部门关于促进光伏组件综合利用的指导意见》

### ask

真实调用：

- `POST /api/v1/search/ask`
- `question = 工信部关于促进光伏组件综合利用的指导意见主要讲了什么？`
- `top_k = 5`

结果：

- `sources = 5`
- `confidence = 0.95`
- 返回真实摘要性答案，覆盖：
  - 总体要求
  - 绿色设计与制造
  - 报废退役
  - 拆解利用
  - 全产业链协同
  - 创新环境与组织保障

## 6. 运行态根因修复实证

### SQL 占位符

已修复并编译通过：

- `crates/law-eye-core/src/article/service.rs:197`
- `crates/law-eye-worker/src/main.rs:3393`

修复效果：

- ingest 批量分类回填恢复正常
- 无正文文章降级回写恢复正常
- worker 不再因该两处损坏 SQL 进入原先的确定性失败路径

### article pin 500

根因：

- `article_pins.starts_at` 为 `NOT NULL`
- 服务层未传值时写 `NULL`

修复后：

- `POST /api/v1/admin/article-pins` 返回 `200`
- 当前租户成功创建 `priority=120` 的真实置顶记录

## 7. bell 与消息中心

Playwright 实测：

- 登录后点击右上角 bell
- 页面出现 `消息中心`
- 未跳转设置页

可见文案包括：

- `暂无消息`
- `通知偏好`
- `打开反馈中心`
- `查看报告`

## 8. 浏览器级回归

Playwright 已在最新 `web` 运行态下完成真实回归：

- `/zh/me/feed`
- `/zh/settings/admin/banners`
- `/zh/settings/admin/relations`
- `/zh/settings/admin/users`
- `/zh/sources`

### 关键观察

- `/zh/me/feed` 已同时展示频道、横幅、置顶与真实文章列表
- `/zh/settings/admin/banners` 可见真实横幅记录
- `/zh/settings/admin/users` 可见当前真实租户用户
- `/zh/sources` 可见当前租户两条真实公网源
- 仪表盘与 feed 已不再出现旧版 `feedResponse.total is missing` 错误

## 9. Emoji 图标清理

### 当前用户可见面

已确认以下区域不再依赖 Emoji 作为图标：

- 分类页
- 侧栏分类列表
- 分类概览
- dashboard 最近资讯列表

### 数据库图标值

当前数据库 `categories.icon` 已统一改为非 Emoji 标识字符串：

- `scroll-text`
- `building-2`
- `scale`
- `briefcase`
- `shield-check`
- `bar-chart-3`
- `shield`
- `graduation-cap`
- `flame`
- `globe-2`

### 迁移

已新增：

- `crates/law-eye-db/migrations/063_category_icons_no_emoji.sql`

用于保证旧库与新库最终收敛到一致的非 Emoji 图标策略。

## 10. 本轮结论

截至本报告：

- 公网真实 source 已在当前轮新租户上再次打通
- `/me/feed` 已在 API、数据库、浏览器三层完成实证
- Banner / Pin / Channel 已形成真实运营闭环
- RAG 已在当前轮新租户上形成真实 chunk 与真实回答
- bell 已修正为消息中心面板
- 当前用户可见交付面已经达到“真实可用、可验收、可继续演进”的状态

## 11. 瑕疵清扫追加验证

### 11.1 迁移 063

数据库当前实证：

- `_sqlx_migrations.version = 63`
- `description = category icons no emoji`
- `success = true`

说明：`063_category_icons_no_emoji.sql` 已不只是代码存在，而是真正进入了当前运行库。

### 11.2 API 健康检查

真实调用：

- `GET /health/live -> 200`

Docker 健康状态：

- `lawsaw-api-1.State.Health.Status = healthy`
- `FailingStreak = 0`

说明：轻量存活探针已替代先前过重的 readiness 式自检路径。

### 11.3 backfill-rag 复测

在当前租户已有 `article_chunks=18`、`chunks_with_embedding=18` 的前提下再次调用：

- `POST /api/v1/knowledge/backfill-rag`

真实结果：

- `articles_enqueued = 0`

说明：

- 无正文文章不再被反复当作可嵌入候选入队。
- 当前租户已不存在“可被重复灌入的无效 RAG 任务”。

### 11.4 前端瑕疵清扫

已完成并上线运行态的前端清扫包括：

- Playwright 默认端口切换到 `18849`
- 管理员频道页可见性选项中文化：`公开 / 受限 / 认证 / 高级`
- bell 行为继续保持消息中心弹层
- 浏览器针对 `/zh/settings/admin/channels` 的 error console 复测为 0 条

## 11. 迁移 063 最终状态

- `crates/law-eye-db/migrations/063_category_icons_no_emoji.sql` 已进入 `_sqlx_migrations`。
- 当前数据库 `categories.icon` 已与迁移结果一致。
- 当前 `api` 运行态可在包含 `63` 的数据库上正常启动并返回 healthy。
