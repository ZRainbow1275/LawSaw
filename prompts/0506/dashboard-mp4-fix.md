# Dashboard MP4 视觉对齐报告 (Wave 4 / 2026-05-06)

> Owner: prototype-wirer · Task #20

## 1. 输入与基准

- **mp4 真值源**：`D:/Desktop/LawSaw/prototype/27c693ebed1bb8a13893d6f2511e8b0b_raw.mp4`（45.27 秒，2558×1198@30fps）
- **抽帧**：`ffmpeg fps=1/2 → 23 帧` 落到 `prompts/0506/mp4-frames/frame-001.png ~ 023.png`
- **场景切换抽帧** 无果（视频是录屏，渐变小）
- **关键帧**：
  - `frame-001/002/008.png` → dashboard 顶部目标态
  - `frame-003.png` → KPI 数字加载中（动画首帧）
  - `frame-004/005/006/007.png` → 工信部公告详情页
  - `frame-009.png` → 资讯列表
  - `frame-010~016.png` → 知识图谱
  - `frame-018/019.png` → 知识图谱（含数据后视图）
  - `frame-020/021.png` → 留言反馈
  - `frame-022/023.png` → 统计分析

## 2. 关键发现

### 2.1 MP4 vs prototype/app.html 严重分歧

**dashboard 设计 mp4 与 `prototype/app.html` 完全不同**：

| 维度 | prototype/app.html (lines 750-805) | mp4 实测（frame-001/008） |
|---|---|---|
| 页面标题 | "感知态势与系统运行分析" | **"数据看板"** |
| 副标 | "实时追踪全球法律法规动态，覆盖 86 个国家与地区" | **"实时监控法律资讯动态与系统运行状态"** |
| Hero | 时间filter + 深度专报 banner + dark viz card（地域分布/行业动能 tabs + world map） | **不存在** |
| Stats strip | 4 卡白底（今日采集/覆盖信息源/高风险预警/AI 洞察） | **4 卡（今日资讯/活跃信息源/待处理/风险预警），橙色 accent line + 圆角 icon** |
| Trending strip + geo chip + cat chip + feed grid | 存在 | **不存在** |
| Bottom 内容 | 无 | **双栏：左『分类概览』+ 右『最新资讯』** |

mp4 是**新版精简设计**，PR4 接的旧 prototype 组件（`dashboard-hero-prototype`/`dashboard-trending-strip-prototype`/`dashboard-feed-grid` 等）整套不被 mp4 采纳。

### 2.2 之前 PR4 的 dashboard 接线属于错误参考

PR4 严格按 `prompts/0505/02-FIX-PLAN.md` 描述把 `apps/web/src/components/dashboard/prototype/*` 8 个组件全部接上，结果与 mp4 相反。这一轮把 dashboard 重写为 mp4 简洁版。

## 3. Diff 与修复

### 3.1 改动文件清单

| 文件 | 改动 | 行数 |
|---|---|---|
| `apps/web/src/components/dashboard/dashboard-page-content.tsx` | 整体重写：移除所有 prototype-hero/trending/feed-grid/geo-filter/cat-filter 引用，改为简洁 KPI 卡 + 分类概览 + 最新资讯 双栏布局 | 88 → 444 |

### 3.2 复用的现有 zh i18n 键（无新增）

| 文案 | 键 | 复用位置 |
|---|---|---|
| 数据看板 | `Dashboard` | 已存在 |
| 实时监控法律资讯动态与系统运行状态 | `Monitor legal updates and system health in real time` | 已存在 |
| 今日资讯 | `Today's articles` | 已存在 |
| 活跃信息源 | `Active sources` | 已存在 |
| 待处理 | `Pending` | 已存在 |
| 风险预警 | `Risk alerts` | 已存在 |
| 分类概览 | `Category overview` | 已存在 |
| 累计采集 X 条（其中未分类 Y 条） | `Total collected: {total} (including {uncategorized} uncategorized)` | 已存在 |
| 最新资讯 | `Latest articles` | 已存在 |
| 近期采集的重要法律资讯 | `Recent legal updates curated for you` | 已存在 |
| 查看全部 | `View all` | 已存在 |
| 未分类 | `Uncategorized` | 已存在 |
| 暂无已采集的资讯。 | `No articles have been collected yet.` | 已存在 |
| 低/中/高/严重风险 | `Low/Medium/High/Critical risk` | 已存在 |

**0 个新增 key** — 全部复用 zh.json 已存在条目，messages/{zh,en}.json 文件未改。

### 3.3 数据接线

| KPI / 区块 | 数据源 |
|---|---|
| 今日资讯 | `useArticleStats() → today_count` |
| 活跃信息源 | `useSourceStats() → active_count`（需 sources:read 权限，否则不查） |
| 待处理 | `useArticleStats() → pending_count` |
| 风险预警 | `useArticleStats() → high_risk_count` |
| 分类概览（累计/未分类/各分类条数） | `useArticleCategoryCounts() + useCategories()` |
| 最新资讯（6 张卡片） | `useArticles({ limit: 6, status: 'published' })` |
| 风险等级 pill | `getArticleRiskLevel(article.risk_score)` |

## 4. 验收

### 4.1 typecheck

```
pnpm --filter web typecheck → 通过
```

### 4.2 浏览器 (admin@qa.lawsaw.local)

| 探针 | 数值 |
|---|---|
| URL | `/zh/dashboard` |
| docH | 1307 px |
| viewport | 773 px |
| ratio | 1.69 |
| mainText | 1248 字符 |
| KPI 卡数 | 4 |
| Console errors | **0** |
| Console warnings | 1（无关，CSS preload） |

### 4.3 视觉对比（before / after）

- `prompts/0506/before-dashboard.png` — 旧版（hero+banner+dark viz card+4 KPI [今日采集/覆盖信息源/...]）
- `prompts/0506/after-dashboard-v2.png` — viewport 截图（数据看板 + 4 KPI + 分类概览/最新资讯 双栏）
- `prompts/0506/after-dashboard-full.png` — full page 截图，与 `mp4-frames/frame-001.png` 结构 1:1 匹配

### 4.4 与 mp4 frame-001 关键元素对照

| mp4 元素 | after 渲染 | 状态 |
|---|---|---|
| 数据看板 H1 | ✅ | 一致 |
| 副标 "实时监控..." | ✅ | 一致 |
| KPI 1: 今日资讯 (orange article icon) | ✅ | 一致 |
| KPI 2: 活跃信息源 (purple rss icon) | ✅ | 一致（数值 2） |
| KPI 3: 待处理 (yellow clock icon) | ✅ | 一致 |
| KPI 4: 风险预警 (red warning icon) | ✅ | 一致 |
| 4 KPI 左侧橙色 accent line | ✅ | 一致 |
| 分类概览 panel 左 | ✅ | 一致 |
| "累计采集 X 条 (其中未分类 Y 条)" | ✅ | 一致 |
| 各分类列表 + dot + 计数 | ✅ | 一致 |
| 最新资讯 panel 右 | ✅ | 一致 |
| "查看全部 →" link | ✅ | 一致 |
| 文章卡片 (low risk pill + cat label + 标题 + 时间) | ✅ | 结构一致；标题仍为 HackerNews seed（PR6 数据清洗负责） |

## 5. 不在本轮范围

- 资讯卡片仍是英文 HackerNews 标题 — 这是 seed 数据问题，由 **PR6 数据清洗** 处理，按 brief 不属本轮 dashboard 视觉对齐范围
- mp4 中观察到 sidebar 多了"信息源管理"、"数据管理"两项菜单 — 涉及 sidebar 配置，不属 dashboard 路由
- 其他 mp4 帧涉及的页面（articles/knowledge/feedback/analytics）已在 PR4 接线，本轮未触动

## 6. 文件清单

```
MOD apps/web/src/components/dashboard/dashboard-page-content.tsx     (88 → ~444 行，整体重写)
NEW prompts/0506/mp4-frames/frame-001.png .. frame-023.png            (23 张抽帧)
NEW prompts/0506/before-dashboard.png                                 (修复前 full page)
NEW prompts/0506/after-dashboard-v2.png                               (修复后 viewport)
NEW prompts/0506/after-dashboard-full.png                             (修复后 full page)
NEW prompts/0506/dashboard-mp4-fix.md                                 (本报告)
```

未触碰：
- prototype 子组件（dashboard/prototype/* 全部保持原样）
- messages/{zh,en}.json
- admin 路由 / breadcrumb / detail 页 / onboarding
- backend / docker / DB
