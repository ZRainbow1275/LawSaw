# 0305 Gap Analysis：当前状态、已解决差距与残余观察

## 已解决的关键差距

### 1. UI 骨架层

已解决：

- 品牌区不再在当前可见主路径中因动效产生错位或文本挤压
- bell 不再跳设置页，而是打开消息中心面板
- `/zh/me/feed` 已切到真实单请求聚合数据
- 旧版前端的 `feedResponse.total is missing` 契约错误已消除

### 2. ReBAC / Feed

已解决：

- `/api/v1/me/feed` 已挂上真实后端聚合
- 频道、横幅、置顶、来源可见性、文章列表已在同一返回中统一裁剪
- 文章与来源资源级判定已进入运行态

### 3. 公网真实 source

已解决：

- `miit_gov` 当前轮新租户实证成功
- `samr_gov` 当前轮新租户实证成功
- 不再停留在“只有镜像 RSS 能用”

### 4. RAG

已解决：

- `backfill-rag` 已进入当前 API 运行态
- 新租户已产出真实 `article_chunks`
- `search/semantic` 与 `search/ask` 已返回真实结果

### 5. 管理员工作台

已解决：

- users / relations / channels / banners / pins / feedbacks / audit / ai-usage / reports / knowledge 均已有真实页面入口

## 当前轮新增修复的根因

### 1. SQL 占位符损坏

已修复两处运行态级别根因：

- `crates/law-eye-core/src/article/service.rs`
  - `ANY($1)` 占位符丢失
- `crates/law-eye-worker/src/main.rs`
  - `WHERE id = $1` 丢失

### 2. 置顶创建 500

根因：

- `article_pins.starts_at` 数据库约束为 `NOT NULL`
- 服务层在未显式传值时直接写入 `NULL`

已修复：

- 服务层默认回填 `Utc::now()`

### 3. 分类 Emoji

已修复：

- 分类页不再直接渲染 `category.icon`
- 侧栏与分类概览不再用 `category.icon` 做 Emoji 兜底
- 当前数据库 `categories.icon` 已统一改为非 Emoji 标识字符串

## 仍需带着批判眼光保留的观察

以下不是当前轮阻断交付的问题，但值得继续关注：

1. `queue:ai` 仍有默认租户的历史 backlog，新租户 RAG 任务需要靠优先级调整或等待消费。
2. 历史轮次文档、旧日志与若干测试脚本里仍有乱码或 Emoji，这些不属于当前用户可见交付面，但仓库层面并非完全洁净。
3. `001_initial.sql` 仍以 Emoji 为初始 seed，本轮通过 `063_category_icons_no_emoji.sql` 做前向修正；新库只有在迁移链完整执行后才会完全收敛。
4. 历史 example / integration 脚本中仍有中文控制台 Emoji 输出，它们不是产品 UI，但不符合当前轮“零 Emoji”原则。

## 当前结论

如果以“最终用户可见功能是否真实可用”为标准，本轮主要差距已经收口。

如果以“整仓库所有历史痕迹都彻底规范化”为标准，仍有较低优先级的工程清洁工作可继续推进。
