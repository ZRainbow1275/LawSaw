# LawSaw 用户端开发主运行手册

更新时间：2026-03-22
适用范围：用户端（`apps/web`）全功能开发、联调、部署
参考原型：`D:\Desktop\LawSaw\prototype\app.html`
配套 Spec 目录：`prompts/0322/`、`.trellis/spec/`

---

## 0. 术语表

| 术语 | 含义 |
|------|------|
| ReBAC | Relationship-Based Access Control，基于关系的访问控制 |
| Gate | 阶段门禁，通过后才可进入下一阶段 |
| Prototype | `prototype/app.html`，前端参考原型（含全部页面 & 交互） |
| Stack | Docker 后端栈（Postgres + Redis + MinIO + API + Worker） |
| Spec | 功能与架构规范文档 |

---

## 1. 前置开发清单

### 1.1 环境验证

```bash
# 在 Git Bash 中执行
git --version        # >= 2.40
node --version       # >= 20.x
pnpm --version       # >= 9.x
python --version     # 注意 Windows 使用 python 而非 python3
cargo --version      # >= 1.75 (后端编译)
```

### 1.2 Docker 前置检查（强制）

**执行任何 Docker 操作前必须完成以下检查：**

```bash
# 1) 检查已运行容器，确认无端口冲突
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"

# 2) 检查已有镜像，避免重复构建
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# 3) 检查目标端口是否被占用
# API_PORT=13003, WEB_PORT=8850, WORKER_HEALTH=3002
netstat -ano | findstr "13003 8850 3002" || echo "端口可用"

# 4) 检查已有 compose stack
docker compose -f docker-compose.yml ps 2>/dev/null
```

**禁止操作：**
- 禁止不检查就执行 `docker compose up`
- 禁止重复 `docker build` 已存在的镜像
- 禁止强制终止非本项目的容器

### 1.3 Node 进程保护

```bash
# 仅查看本项目相关 node 进程
# 不要 kill 其他项目的进程
ps aux | grep "[n]ode.*LawSaw" || echo "无活跃进程"
```

### 1.4 Playwright 检查

```bash
# 使用已安装的浏览器，禁止重复下载
pnpm exec playwright --version
# 仅在确认未安装时执行：pnpm exec playwright install chromium
```

---

## 2. 固定运行参数

| 服务 | 地址 | 说明 |
|------|------|------|
| Web | `http://172.19.96.1:8850` | Next.js 前端 |
| API | `http://172.19.107.21:13003` | Rust API 后端 |
| Worker Health | `http://172.19.107.21:3002/health` | Worker 健康检查 |
| AI Gateway | `https://api.siliconflow.cn/v1` | SiliconFlow AI |
| LLM Model | `Qwen/Qwen3-8B` | 对话模型 |
| Embedding | `BAAI/bge-m3` | 向量嵌入 |
| Rerank | `BAAI/bge-reranker-v2-m3` | 重排序 |
| Stack Name | `law-eye-local-codex` | Docker Compose 栈名 |

---

## 3. 开发阶段定义

### Phase 1: 页面骨架与路由系统

**目标：** 完成用户端全部页面的路由注册、布局骨架、侧栏导航（含折叠态）。

**交付内容：**
- [ ] Next.js App Router 路由树（Dashboard / Articles / Category / Reports / Knowledge / Feedback / Settings / Me）
- [ ] 侧栏组件（Sidebar）— 含品牌区、导航区、分类列表、角色切换器、收起/展开
- [ ] 顶栏组件（Topbar）— 含搜索框（Ctrl+K）、通知下拉、语言切换、用户菜单
- [ ] 主内容区域（MainContent）— 带面包屑导航
- [ ] 页面切换动画（framer-motion 过渡）
- [ ] 响应式骨架（移动端断点占位）

**参考文件：**
- `prototype/app.html` — Section 2 (Sidebar) + Section 3 (Topbar)
- `apps/web/src/components/layout/sidebar.tsx`
- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/components/layout/main-content.tsx`

**Gate 门禁：**
1. `pnpm typecheck` 通过
2. `pnpm lint` 通过
3. 侧栏展开/折叠动画流畅（300ms cubic-bezier）
4. 所有路由可达，无 404
5. 角色切换器可弹出/选择/关闭
6. 搜索快捷键 Ctrl+K 可触发搜索覆盖层

---

### Phase 2: Dashboard + 地图可视化

**目标：** 完成首页仪表盘的全部组件，包括 ECharts 地图交互。

**交付内容：**
- [ ] Hero 区域 — 深度专报卡片 + 地图/行业切换面板
- [ ] ECharts 世界地图 — 支持省级钻取、弹窗卡片、返回按钮
- [ ] ECharts 行业动能 — 饼图/环形图切换
- [ ] 统计卡片条 — 4 列网格（今日采集、覆盖源、高风险、AI 洞察）
- [ ] 数字动画计数器（data-count 属性驱动）
- [ ] 时间筛选器（日/周/月/年）— 滑块动画
- [ ] 滚动提示 + 资讯流区域
- [ ] Feed 卡片网格 — Hero 卡 + 普通卡 + 懒加载动画
- [ ] 热点跑马灯 + 地域筛选条 + 分类筛选条
- [ ] 返回顶部按钮

**参考文件：**
- `prototype/app.html` — Section 4 (Dashboard Hero) + Section 5 (Stats + Feed)
- `apps/web/src/components/dashboard/stats-cards.tsx`
- `apps/web/src/components/dashboard/recent-articles.tsx`
- `apps/web/src/components/dashboard/category-overview.tsx`

**数据源：**
- 统计数据：`GET /api/v1/articles?limit=0`（count 聚合）
- 资讯列表：`GET /api/v1/articles?limit=20&sort=published_at`
- 来源统计：`GET /api/v1/sources`
- **严禁 Mock 数据！** 无数据时显示空态。

**Gate 门禁：**
1. 地图加载 < 2 秒，钻取交互流畅
2. 统计数字动画正确（零到目标值）
3. 时间筛选器滑块动画同步
4. Feed 卡片滚动到视口时触发 fadeIn 动画
5. 所有数据来自真实 API 响应
6. `pnpm typecheck && pnpm lint` 通过

---

### Phase 3: 文章系统

**目标：** 文章列表页、文章详情阅读器、全文搜索。

**交付内容：**
- [ ] 文章列表页 — 工具栏（搜索/排序/视图切换）+ 分类筛选条 + 分页
- [ ] 文章卡片 — 状态徽章（published/pending/processing/archived）+ 风险等级
- [ ] 文章阅读器 — 固定 TOC 侧栏 + 进度条 + 居中单列布局
- [ ] 阅读器操作面板 — 书签/分享/点赞/字体设置（固定右侧）
- [ ] 阅读设置浮层 — 字号调节 + 主题切换（明亮/护眼/暗黑）
- [ ] AI 洞察面板 — 风险评级 + 摘要要点 + 实体标签
- [ ] 来源信息卡 — 来源可见度（全文/摘要/隐藏）+ 元数据
- [ ] 全局搜索覆盖层 — Ctrl+K 触发、实时搜索、分类结果

**参考文件：**
- `prototype/app.html` — Section 6 (Article List) + Article Reader Section
- `apps/web/src/app/articles/page.tsx`
- `apps/web/src/app/articles/[id]/page.tsx`
- `apps/web/src/components/article/article-card.tsx`
- `apps/web/src/components/article/ai-insights.tsx`

**关键约束：**
- 阅读器最大宽度 680px，字体 16px，行高 1.8
- TOC 仅在 >= 1400px 时显示
- 操作按钮仅在 >= 1200px 时显示
- blockquote 使用 primary 色左边框
- **所有图标使用 lucide-react，绝不使用 Emoji**

**Gate 门禁：**
1. 文章列表分页正常（真实 API 数据）
2. 阅读器 TOC 高亮与滚动同步
3. 阅读进度条与滚动位置同步
4. 字号调节立即生效
5. 搜索覆盖层 Ctrl+K 打开、Escape 关闭
6. 所有状态徽章样式与原型一致

---

### Phase 4: 报告与分析

**目标：** 报告列表、报告详情、分析仪表板。

**交付内容：**
- [ ] 报告列表页 — 报告卡片（编号/标题/状态/周期/操作）
- [ ] 报告状态流转 — draft -> generating -> generated -> review -> approved -> published
- [ ] 报告操作 — 查看/编辑/下载（PDF/HTML）/归档
- [ ] 分析面板 — 标签切换（概览/分类/来源/趋势）
- [ ] 图表组件 — 使用 ECharts 或 Recharts（柱状图/折线图/饼图）
- [ ] 分类统计卡片网格 — 图标 + 名称 + 计数
- [ ] 文章状态分布 — 徽章网格
- [ ] 报告订阅面板

**参考文件：**
- `prototype/app.html` — Report Section + Analytics Section
- `apps/web/src/app/reports/page.tsx`
- `apps/web/src/hooks/use-reports.ts`

**Gate 门禁：**
1. 报告状态流转逻辑与后端一致
2. PDF/HTML 下载功能可用（真实 export key）
3. 图表数据来自真实 API
4. 分类筛选联动正确
5. `pnpm typecheck && pnpm lint` 通过

---

### Phase 5: 知识图谱 + 反馈 + 设置

**目标：** 完成知识图谱可视化、用户反馈系统、个人设置页面。

**交付内容：**
- [ ] 知识图谱 — 三栏布局（实体列表 | Canvas 画布 | 属性面板）
- [ ] 图谱节点 — 位置/颜色/大小由实体类型决定，支持点击选中
- [ ] 图谱连线 — SVG 贝塞尔曲线，关系标签
- [ ] 实体搜索 — 左侧面板即时过滤
- [ ] 属性检查器 — 右侧面板显示选中节点详情 + 关联实体
- [ ] 反馈表单 — 类型选择（Bug/建议/内容/其他）+ 标题 + 详情 + 提交
- [ ] 反馈历史 — 状态跟踪（pending/reviewing/resolved）+ 管理员回复
- [ ] 设置页面 — 左侧标签栏 + 右侧面板
- [ ] 设置标签 — 个人资料/通知偏好/显示设置/安全设置

**参考文件：**
- `prototype/app.html` — Knowledge Graph + Feedback + Settings Sections
- `apps/web/src/components/knowledge/knowledge-canvas.tsx`
- `apps/web/src/hooks/use-knowledge.ts`
- `apps/web/src/hooks/use-feedback.ts`
- `apps/web/src/app/settings/page.tsx`

**Gate 门禁：**
1. 知识图谱节点可拖拽、连线正确渲染
2. 反馈表单提交后 API 调用成功
3. 设置页面各标签内容完整
4. 所有交互与原型一致

---

### Phase 6: ReBAC 集成与权限控制

**目标：** 接入后端 ReBAC 权限体系，实现基于角色的内容与功能控制。

**交付内容：**
- [ ] 角色切换器 — 普通用户/认证用户/高级用户 三级
- [ ] 频道系统 — 根据角色可见性控制侧栏分类显示
- [ ] 内容权限 — 文章可见度（全文/摘要/隐藏）基于用户权限
- [ ] 功能权限 — 部分操作（如导出、高级分析）需要更高权限
- [ ] 权限提示 — 无权限时显示升级提示而非空白
- [ ] Admin 入口 — 管理员专属路由和功能（仅 admin 角色可见）

**参考文件：**
- `prompts/0225/REBAC_AI_GOVERNANCE_SPEC_2026-02-25.md`
- `apps/web/src/hooks/use-authz.ts`
- `crates/law-eye-api/src/routes/authz.rs`
- `crates/law-eye-core/src/authz.rs`

**Gate 门禁：**
1. 角色切换后侧栏分类即时更新
2. 无权限内容显示升级提示
3. API 返回 403 时前端优雅处理
4. Admin 路由非管理员不可访问

---

### Phase 7: 打磨与优化

**目标：** 动画优化、响应式适配、暗色模式、性能优化。

**交付内容：**
- [ ] 页面切换动画 — framer-motion 进出场过渡
- [ ] 微交互 — 按钮 hover/active、卡片 hover 浮起、列表项滑入
- [ ] 响应式布局 — 移动端 (<768px)、平板 (<1024px)、桌面 (>=1024px)
- [ ] 暗色模式 — CSS 变量主题切换，持久化到 localStorage
- [ ] 骨架屏 — 数据加载态骨架组件
- [ ] 错误边界 — React Error Boundary 全局兜底
- [ ] 性能优化 — React.lazy 路由拆包、图片懒加载、虚拟滚动长列表
- [ ] 无障碍 — aria 标签、键盘导航、焦点管理

**Gate 门禁：**
1. Lighthouse Performance >= 80
2. 移动端布局无水平溢出
3. 暗色模式全页面无色彩断裂
4. 骨架屏到内容的过渡无闪烁
5. `pnpm build` 零警告

---

## 4. 验证命令速查

### 4.1 前端检查

```bash
cd D:/Desktop/LawSaw/apps/web

# 类型检查
pnpm typecheck

# Lint 检查
pnpm lint

# 单元测试
pnpm test:unit

# 完整测试
pnpm test

# 生产构建
pnpm build

# E2E 测试
pnpm e2e
```

### 4.2 后端健康检查

```bash
curl -i http://172.19.107.21:13003/health
curl -i http://172.19.107.21:3002/health
```

### 4.3 Web 健康检查

```bash
curl -i http://172.19.96.1:8850/login
curl -i http://172.19.96.1:8850/api/v1/auth/me
```

---

## 5. 测试策略

### 5.1 单元测试（Vitest）

- 覆盖所有 hooks（`use-articles`, `use-auth`, `use-reports` 等）
- 覆盖所有工具函数（`lib/api/client.ts`）
- 不测 UI 渲染细节，测行为和状态逻辑
- 目标覆盖率 >= 70%

### 5.2 集成测试

- API 客户端与后端真实交互（需后端栈运行）
- 状态管理 store 的完整流程
- 权限控制链路（角色切换 -> API 调用 -> UI 更新）

### 5.3 E2E 测试（Playwright）

- 关键用户流程：登录 -> 浏览 -> 阅读文章 -> 搜索 -> 反馈提交
- 使用已安装的 Playwright，禁止重复下载浏览器
- 仅 Chromium 浏览器

---

## 6. 部署清单

### 6.1 构建前检查

```bash
# 确认环境变量
echo $NEXT_PUBLIC_API_URL
echo $LAW_EYE_API_PROXY_TARGET

# 确认依赖完整
pnpm install --frozen-lockfile

# 确认无类型错误
pnpm typecheck

# 确认无 lint 错误
pnpm lint

# 确认单元测试通过
pnpm test:unit
```

### 6.2 Docker 部署

```bash
# 1) 检查已有容器和镜像（强制）
docker ps -a
docker images | grep law-eye

# 2) 确认无端口冲突
docker ps --format "{{.Ports}}" | grep -E "8850|13003|3002"

# 3) 构建（仅在镜像不存在或代码变更时）
docker compose build --no-cache web

# 4) 启动
docker compose up -d

# 5) 验证
docker compose ps
curl -i http://172.19.96.1:8850/login
```

### 6.3 回滚步骤

```bash
# 1) 查看最近的成功部署 tag
git log --oneline -10

# 2) 切换到上一版本
git checkout <previous-tag>

# 3) 重新构建和部署
pnpm install --frozen-lockfile
pnpm build
docker compose restart web

# 4) 验证回滚成功
curl -i http://172.19.96.1:8850/login
```

---

## 7. 故障排查

### 7.1 常见问题

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| API 返回 500 | 后端栈未启动 | 检查 `docker compose ps`，确认 API 容器运行 |
| 页面白屏 | JS 构建错误 | 检查 `pnpm build` 输出，修复编译错误 |
| 样式错乱 | Tailwind 未加载 | 确认 `postcss.config` 配置正确 |
| 登录页循环跳转 | Auth middleware 异常 | 检查 middleware.ts 路由匹配规则 |
| 地图不显示 | ECharts 加载失败 | 确认 echarts 依赖版本和 import 路径 |
| 类型错误 | API 类型不同步 | 执行 `pnpm gen:api-types` 重新生成 |

### 7.2 日志位置

- 前端开发日志：终端 stdout（`pnpm dev`）
- API 日志：`docker compose logs api`
- Worker 日志：`docker compose logs worker`
- 数据库日志：`docker compose logs postgres`

---

## 8. 技术栈速查

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | Next.js (App Router) | ^16.1.6 |
| UI 库 | React | ^19.0.0 |
| 状态管理 | Zustand | ^5.0.2 |
| 数据获取 | TanStack React Query | ^5.62.11 |
| 样式 | Tailwind CSS | ^4.0.0 |
| 图表 | ECharts + echarts-for-react | ^6.0.0 |
| 图标 | lucide-react | ^0.469.0 |
| 动画 | framer-motion | ^11.15.0 |
| 类型 | TypeScript (strict) | ^5.7.2 |
| 构建 | webpack (via Next.js) | - |
| Lint | Biome | ^1.9.4 |
| 测试 | Vitest + Playwright | ^4.0.18 / ^1.50.1 |
| 路由参数 | nuqs | ^2.2.3 |
| 二维码 | qrcode.react | ^4.2.0 |
| HTML 安全 | dompurify | ^3.3.1 |

---

## 附录 A: 原型页面与组件映射

| 原型页面 | 路由 | 关键组件 |
|----------|------|---------|
| Dashboard | `/` | DashboardHero, StatsCards, FeedGrid, TrendingStrip |
| Articles | `/articles` | ArticleList, Toolbar, CategoryFilter, Pagination |
| Article Reader | `/articles/[id]` | ArticleReader, TOC, AIInsights, ReadingSettings |
| Category | `/category/[slug]` | CategoryPage, ArticleList |
| Reports | `/reports` | ReportList, ReportCard, AnalyticsTabs |
| Knowledge | `/knowledge` | KnowledgeCanvas, EntityPanel, Inspector |
| Feedback | `/feedback` | FeedbackForm, FeedbackHistory |
| Settings | `/settings` | SettingsTabs, ProfilePanel, PreferencesPanel |
| Me | `/me` | PersonalFeed, PinnedArticles, Notifications |
| Search | (overlay) | SearchOverlay, SearchResults |

## 附录 B: 图标规范

**强制使用 `lucide-react` 图标库。全项目禁止使用 Emoji 作为图标。**

原型中使用 Phosphor Icons (`ph-bold ph-*`)，实现时映射到 lucide-react 等价图标：

| Phosphor | Lucide | 用途 |
|----------|--------|------|
| ph-house | Home | 首页 |
| ph-article | FileText | 资讯 |
| ph-chart-line-up | TrendingUp | 报告 |
| ph-graph | Network | 知识图谱 |
| ph-chat-circle-dots | MessageCircle | 反馈 |
| ph-gear | Settings | 设置 |
| ph-magnifying-glass | Search | 搜索 |
| ph-bell | Bell | 通知 |
| ph-globe | Globe | 语言切换 |
| ph-bookmark-simple | Bookmark | 收藏 |
| ph-share-network | Share2 | 分享 |
| ph-eye | Eye | Logo / 查看 |
| ph-warning | AlertTriangle | 预警 |
| ph-brain | Brain | AI 洞察 |
| ph-fire | Flame | 热点 |
| ph-rss | Rss | 信息源 |
| ph-trend-up | TrendingUp | 上升趋势 |
| ph-trend-down | TrendingDown | 下降趋势 |
