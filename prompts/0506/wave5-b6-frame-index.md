# Wave 5 B6 — mp4 Frame × 路由索引

> 用途：B6 (render bugs / double chrome / schema 一致性) 视觉审查时直接对照 mp4 真值。
> 抽样日期：2026-05-06
> 帧根目录：`prompts/0506/mp4-frames-deep/`
> 帧总数：149（half: 91 张 / sec: 45 张 / scene: 13 张）
> 抽样深度：30 个关键帧（覆盖全部 mp4 直接路由 + 共性 chrome）

---

## A. 直接覆盖路由（mp4 出现）

| 路由                          | 主帧                                       | 备帧                       | 关键视觉证据 |
|-------------------------------|--------------------------------------------|----------------------------|--------------|
| `/zh/dashboard`               | **half-001 / half-005 / sec-001**          | half-010 (sidebar only)    | 4-up KPI **左 4px accent**（橙/绿/橙/红）+ 分类概览（左 4px primary）+ 最新资讯（绿色低风险卡）+ 通知中心 popover (half-005) |
| `/zh/articles`                | **half-035**                               | sec-013, sec-014           | 资讯列表（共 43 条）+ 10 cat chips 横向 + 风险 badge + 分类色点 |
| `/zh/articles/[id]`           | **sec-008 / sec-012 / half-025 / half-028**| scene-006 (阅读设置)       | 沉浸式视图（无 sidebar）+ 顶 ← 返回 + 来源可见性卡 + 正文 + 阅读设置抽屉（字号/行距/主题/宽度/字体） |
| `/zh/knowledge`               | **half-045 / sec-020 / sec-035 / half-070**| sec-025, sec-030           | 3 列布局（实体列表 / canvas / 实体面板）+ 力导向图（market_supervision_total 选中节点 + 8 关系扩散）+ entity type chip（organization/concept/location/event）|
| `/zh/analytics`               | **half-090 / sec-045**                     |                            | 顶 5 tabs（概览/地域/行业/重要性/交叉）+ 4-up KPI **左 4px accent**（红/绿/橙/灰）+ 风险分布柱图（5 bar）+ 情感分布柱图 |
| `/zh/feedback`                | **half-080 / sec-040**                     |                            | 提交反馈卡（左 4px red accent）+ 4 反馈类型 chip（信息源/问题/功能/其他）+ 我的反馈卡 |

## B. 间接覆盖（mp4 sidebar/nav 出现，未单独展示）

| 路由             | 推断帧             | 推断依据 |
|------------------|--------------------|----------|
| `/zh/me/feed`    | half-001 (sidebar) | 第 2 项导航 "我的资讯流" |
| `/zh/sources`    | half-001 (sidebar) | 第 4 项 "信息源管理" |
| `/zh/reports`    | half-001 (sidebar) | 第 5 项 "报告" |
| `/zh/data`       | half-001 (sidebar) | 第 7 项 "数据管理" |
| `/zh/settings`   | half-001 (sidebar) | 第 9 项 "系统设置" |
| `/zh/category/[slug]` | half-035 (类似 articles) | cat chip 点击转跳 |
| `/zh/me`         | 无                 | 无直接帧 |
| `/zh/me/notifications` | half-005 popover | 通知中心 = 内嵌弹层；独立路由风格未展示 |
| `/zh/search`     | half-005 (search input) | topbar 搜索框 |

## C. 共性 chrome / 状态帧

| 帧                    | 用途                                                           | B6 对照 |
|-----------------------|----------------------------------------------------------------|---------|
| **scene-001**         | 通用 skeleton loading（4-up KPI + 文章列表骨架）               | 检查所有 native 页 loading state 是否匹配此风格 |
| **scene-010**         | 全屏圆环 spinner（橙色） + 路径标签 "127.0.0.1:18849/zh/feedback" | 检查全屏 loading fallback |
| **half-100**          | 同上（路径 `/zh/analytics`）                                   | 同 |
| **half-001 sidebar**  | 主 sidebar 10 项 + 10 频道（已 B0 落地 sidebar 10 items）      | 验证 sidebar 仍 = 10 items 不回归 |

## D. mp4 不覆盖（admin 26 项）

> Admin 路由（#23-#48）mp4 全无直接证据。B6 视觉审查依赖 prototype/app.html + design-system.md 推导。
> **优先级**：先按 mp4 真值审 A/B 段（22 客户端路由）；admin 段单独走 prototype 比对。

mp4 完全缺席的 admin 路由 list（B6 单独审）：
- `/zh/admin`, `/zh/admin/users[/id]`, `/zh/admin/sources[/id]`
- `/zh/admin/channels[/id]`, `/zh/admin/banners[/new]`, `/zh/admin/categories`
- `/zh/admin/pins`, `/zh/admin/feedbacks[/id]`, `/zh/admin/audit`
- `/zh/admin/ai-usage`, `/zh/admin/ai-governance`, `/zh/admin/apikeys`
- `/zh/admin/permissions`, `/zh/admin/relations`
- `/zh/admin/reports[/new][/runs][/templates/id]`, `/zh/admin/tenants`
- `/zh/admin/knowledge[/id]`

## E. B6 视觉审查 checklist（mp4 实证规则）

基于上述索引，B6 必须验证：

1. **KpiCard accent 位置 = 左 4px**（half-001 / half-090 双重证据）— B0 修正已落地后必查
2. **Sidebar = 10 主导航 + "10 频道" 分组**（half-001/sec-001）— 不回归 9 项
3. **风险 badge 4 色绿/橙/红/暗红**（half-035 sec-008）— 检查 article list 一致
4. **Knowledge canvas 默认渲染 force graph**（sec-035 / half-070）— 不能空白
5. **Analytics 5 tabs 顺序 = 概览/地域/行业/重要性/交叉**（half-090）
6. **Feedback 4 chip 顺序 = 信息源/问题/功能/其他**（half-080）
7. **Article detail 沉浸式无 sidebar**（sec-008 sec-012）— 而其他客户端页保留 sidebar
8. **Loading fallback = orange spinner + 路径标签**（scene-010 half-100）— 不能花屏 / 不能 grey
9. **通知 popover 锚定 topbar 钟铃**（half-005）— 不能盖整个 main
10. **Topbar = 搜索 + 语言 + 通知 + 头像**（所有 half/sec 一致）— 不双 chrome

---

## F. 关键 design-token 实证修正

| Token              | mp4 真值                                | 来源帧             |
|--------------------|------------------------------------------|--------------------|
| KPI accent 位置    | **左 4px**（非顶 4px）                   | half-001, half-090 |
| KPI 4 色（dashboard）| 橙(legislation) / 绿(success) / 橙(warning) / 红(error) | half-001 |
| KPI 4 色（analytics）| 红 / 绿 / 橙 / 灰                       | half-090           |
| 分类概览左条       | primary（与 KPI 第 1 卡同色橙）          | half-001           |
| Risk badge 形状    | 圆角 pill + 左侧色点                     | half-035           |
| Article card 左条  | **绿色（低风险）4px**                    | half-035           |
| Sidebar active     | 橙色高亮条 + 浅橙底                      | half-001/sec-001   |
| Sidebar active 项  | "数据看板"（playback 起始）              | half-001           |
| Topbar 高度        | 约 56px（10:1 比例 vs main 高度）        | 所有 half/sec      |

---

## G. 待补充帧（B3/B5 idle 后由 playwright 抓）

B6 完整对照需的 after 截图：
- `/zh/dashboard` (B0/B1 left-accent 修正后)
- `/zh/admin/categories`（双 chrome 修复后）
- `/zh/admin/reports/new`（双渲染 bug 修复后）
- `/zh/admin/reports/runs`（同上）
- `/zh/admin/permissions`（i18n 残留清扫后）

抓图后命名规则：`prompts/0506/wave5-b6-after-{route-slug}.png`

---

> 文档完结。B6 启动时直接以本表为 SoT 比对修复物料。
