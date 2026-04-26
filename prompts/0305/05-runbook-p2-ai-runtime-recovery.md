# 0305 Runbook：AI Runtime、Secure Cookie、端口与当前轮验收操作

## 1. 当前稳定端口

- API：`3001`
- Web：`18849`
- PostgreSQL：`5435`
- Redis：`6380`
- MinIO：`9000 / 9001`

## 2. 健康检查

```bash
curl http://127.0.0.1:3001/health
```

期望：

- `status=ok`
- `ai.available=true`
- `chat / embedding / rerank` 三类子能力均返回状态与模型名

## 3. 认证态检查

当前 API 返回的 session cookie 形如：

```text
Set-Cookie: id=...; HttpOnly; SameSite=Lax; Secure; Path=/; Max-Age=86400
```

浏览器与 Playwright 访问 `http://127.0.0.1:18849` 时可正常维持会话。

如果 CLI 的 cookie jar 未自动回发，可直接从登录响应头提取 session id，然后手工追加：

```bash
-H "Cookie: id=<session-id>"
```

### 登录

```bash
curl -i -X POST \
  -H "Origin: http://127.0.0.1:18849" \
  -H "Referer: http://127.0.0.1:18849/login" \
  -H "Content-Type: application/json" \
  --data-binary @login.json \
  http://127.0.0.1:3001/api/v1/auth/login
```

### AI 能力

```bash
curl -H "Origin: http://127.0.0.1:18849" \
  -H "Cookie: id=<session-id>" \
  http://127.0.0.1:3001/api/v1/ai/available
```

## 4. 当前轮已验证模型

- `Qwen/Qwen3-8B`
- `BAAI/bge-m3`
- `BAAI/bge-reranker-v2-m3`

## 5. 当前轮新租户实证

真实租户：

- `tenant_slug = codex1773080708`
- `tenant_id = 6469b900-7b97-4aeb-bb9e-cfeebced010f`

真实结果：

- `miit_gov`：10 条真实文章入库
- `samr_gov`：10 条真实文章入库
- `/api/v1/me/feed`：真实返回频道 / 横幅 / 置顶 / 文章
- `/api/v1/search/semantic`：真实命中光伏组件指导意见
- `/api/v1/search/ask`：真实返回答案，`confidence=0.95`

## 6. 迁移策略

严禁修改已应用历史迁移。

当前轮新增迁移：

- `063_category_icons_no_emoji.sql`

用途：

- 把分类图标从 Emoji 统一收敛为非 Emoji 标识字符串

若遇到迁移状态与运行态不一致：

1. 先确认工作区文件与数据库迁移记录是否一致
2. 再确认当前运行镜像是否为最新构建
3. 必要时只最小重建 `api`

## 7. 推荐回归顺序

1. `GET /health`
2. 登录并获取 session id
3. `GET /api/v1/me/feed`
4. `POST /api/v1/search/semantic`
5. `POST /api/v1/search/ask`
6. 浏览器打开：
   - `/zh/me/feed`
   - `/zh/settings/admin/banners`
   - `/zh/settings/admin/relations`
   - `/zh/settings/admin/users`
   - `/zh/sources`

## 8. 最小重建原则

如需重新加载运行态，按以下顺序最小重建：

### API

```bash
docker compose build api
docker compose up -d --no-deps --force-recreate api
```

### Web

```bash
docker compose build web
docker compose up -d --no-deps --force-recreate web
```

### Worker

```bash
docker compose build worker
docker compose up -d --no-deps --force-recreate worker
```

不强杀非本项目进程，不做无必要全栈重启。

## 9. 当前轮瑕疵清扫后的额外说明

- `backfill-rag` 现在只会选择“已发布且正文非空且尚无 chunk”的文章。
- AI 队列已引入 `queue:ai:priority`，用于优先消费高价值 embed / RAG 任务。
- 管理员频道页已完成核心中文化，不再直接显示 `public / restricted / verified / premium` 裸英文值。

## 9. 迁移 063 已应用

当前数据库 `_sqlx_migrations` 已记录：

- `63 | category icons no emoji | success=true`

说明：

- 当前代码、数据库与运行态已重新对齐。
