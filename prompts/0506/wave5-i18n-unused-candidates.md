# Wave 5 — i18n 未使用 key 候选清单（B8 参考用）

> 生成时间：2026-05-06
> 生成者：i18n-cleaner（B4 standby 期间预备）
> 状态：**仅候选，禁止盲删** — 留给 B8 终局 QA 时审阅

## 重要免责声明

本清单由静态正则扫描生成，**存在以下已知盲点**：

1. **动态 key 构造不可见**
   - `t(\`audit.event.${kind}\`)` — 模板字符串拼接
   - `t(commands[id].labelKey)` — 通过查表的 labelKey 间接调用
   - `roleTierLabelKey(option)` — 函数返回 key 字符串后再被 t() 调用
   - JSON spec 文件驱动的 key（例如菜单/分类配置 JSON 里硬编码的 messages key）

2. **跨 workspace 引用不可见**
   - 本扫描仅遍历 `apps/web/src/`，未覆盖其他 workspace 是否引用同一份 messages

3. **测试/Storybook 文件被排除**
   - `.test.tsx` / `.stories.tsx` 等被 `SKIP_FILE_RE` 跳过，可能漏判

4. **运行时拼接 / SSR data fetching 中的 key 可能漏判**

**结论：删除任何 key 之前，必须先在 IDE 中全局搜索（包含字符串字面量），并且在 dev 模式跑一遍主要 admin 流程确认没有 console.error 报缺失 key。**

---

## 扫描方法

脚本位置：`.tmp/find-unused-keys-strict.mjs`

判定逻辑：

```
对 zh.json 中的每个 key K：
  - 如果 K 出现在某 t("K") 直调中 → 标记"在用"
  - 否则如果 K 作为字符串字面量出现在 src/ 下任何 .tsx/.ts/.json 中 → 标记"间接可能使用"
  - 否则 → 标记"严格未使用候选"（candidatesForReview）
```

## 数据概览

| 指标 | 数量 |
| --- | --- |
| zh.json 总 key 数 | 2643 |
| 直接 t() 调用引用 | 2067 |
| 严格未使用候选（无 t() 也无字面量） | **318** |
| 间接可能在用（字面量存在某处） | 256 |

完整列表：
- `.tmp/unused-strict.txt` — 318 严格候选
- `.tmp/unused-indirect.txt` — 256 间接可能在用（建议保留）

---

## A. 严格未使用候选（中等信心，可删但需 case-by-case 验证）

### A.1 高置信度可删除（典型废弃 toast / 旧 UI 文案）

这些 key 文案明显属于已被替换的旧版 UI，可在 B8 删除：

```
"AI quota refreshed"               — 旧版 quota 刷新提示
"Activate banner"                  — 旧版 banner 激活按钮
"All read"                         — 通知中心旧版"全部已读"按钮
"Apply"                            — 通用"应用"按钮（已被 t("Apply filters") 等替代）
"Authentication"                    — 旧版 auth 区块标题
"Available articles"               — 旧 KPI label
"Back to top"                      — 已无回到顶部按钮
"Banner detail"                    — 已被 admin/banners/[id] 真实实现替代
"Channel created successfully."    — 旧 toast，现用 "Channel {name} created."
"Channel description"              — 旧 form label
"Channel name"                     — 同上
"Channel slug"                     — 同上
"Channel slug and name are required."  — 旧校验文案
"Create subscription"              — 已被 "Create reporting subscription" 替代
"Create your first feed channel to control audience visibility."  — 旧空态
"Decrease priority"                — 已无优先级控件
"Increase priority"                — 同上
"Delete subscription"              — 已被合并为通用 "Delete"
"Edit a single report template, preview its markdown rendering, and manage ReBAC scope."  — 旧 hero subtitle
"Enable 2FA"                       — 安全功能未上线（参见 B7 路线图）
"Enter your email"                 — 已被 "Email" 单字段 label 替代
"Enter your password"              — 同上 → "Password"
"Error message"                    — 旧通用错误标题
"Failed to load articles. Please retry."  — 已被 "Failed to load articles" 简化版替代
"Failed to load audit logs"        — 同上
"Failed to load entity detail"     — 同上
"Failed to load related entities." — 同上
"Failed to load source detail"     — 同上
"Failed to load trend data"        — 同上
"Failed to load user detail"       — 同上
"Mark resolved"                    — 已被 "Mark as resolved" 替代
"Move to draft"                    — 已被 "Move back to draft" 替代
"New report"                       — 已被 "New report run" 替代
"No active banners are currently targeting your feed."  — 旧空态
"No articles have been ingested yet."  — 旧空态
"No audit events matched the current filters."  — 已被简化
"No audit logs"                    — 同上
"No banner body yet."              — 旧空态
"No banners"                       — 已被 "No active banners" 替代
"No channels yet"                  — 旧空态
"No details recorded."             — 旧 detail 占位
"No feed items"                    — 已被 "No feed items match the current filters" 替代
"No filters applied"               — 旧 filter UI
"No policies yet"                  — 旧空态
"No recent searches"               — 旧搜索面板
"No risk data"                     — 旧 KPI
"No sentiment data"                — 旧 KPI
"No sources available."            — 旧空态
"No subscriptions yet"             — 旧空态
"No tenant users are available yet."  — 旧空态
"No users found"                   — 已被 "No users match the filters" 替代
"Not available"                    — 通用占位（被 "Unavailable" 替代）
"Not configured (set AI API key)"  — 已被 "AI provider not configured" 替代
"Not set"                          — 通用占位（建议保留 — 高频可能动态使用）
"Notification switches"            — 旧 settings 标题
"Open dedicated management views for users, relations, channels, and banners."  — 旧 admin overview
"Open dedicated management views for users, relations, channels, banners, feedback, reports, API keys, and knowledge."  — 同上扩展版
"Open feedback center"             — 旧 quick action
"Open full search page"            — 同上
"Open items"                       — 旧 KPI label
"Open notification center"         — 旧 quick action
"Open notifications"               — 同上
"Open quick search"                — 同上
"Open the dedicated consoles for users, relations, channels, and banners."  — 旧 hero subtitle
"Open user menu"                   — 旧 a11y label
"Permissions"                      — 已被 "Permission matrix" / "Roles" 替代
"Pin removed from the live feed. You can undo this action."  — 已被简化
"Please refresh and try again."    — 旧通用错误
"Please select a target channel before creating a channel banner."  — 旧校验
"Read access"                      — 已被 "Reader" tier 替代
"Read-focused access"              — 同上
"Read-only graph access"           — 同上
"Reading queue"                    — 旧 sidebar 标题
"Reading rules"                    — 旧 settings 区块
"Reading time"                     — 旧 article meta
"Recent searches"                  — 已被 "Recent" 替代
"Refine articles"                  — 旧 filter 按钮
"Reject feedback"                  — 已被 "Reject" 替代
"Reset to default"                 — 已被 "Reset to defaults" 替代
"Restore pin failed"               — 旧 toast
"Run this subscription now?"       — 旧确认对话框
"Search keyboard hint"             — 旧快捷键提示
"Searching..."                     — 已被 "Searching" 替代（不带省略号）
"Show all"                         — 已被 "Show all results" 替代
"Show unread only"                 — 已被 "Unread only" 替代
"Source URL must start with http:// or https://."  — 旧校验
"Source: {name}"                   — 已被 "Source · {name}" 替代
"Submitted"                        — 已被 "Submission received" 替代
"Subscribe now"                    — 旧 CTA
"System settings"                  — 已被 "System" 替代
"System status"                    — 已被 "Service status" 替代
"TL;DR"                            — 旧 article 区块（无对应组件）
"Template"                         — 已被 "Report template" 替代
"Tenant name example"              — 旧 form helper
"Tenant slug examples"             — 同上
"The source could not be loaded."  — 旧错误文案
"The user could not be loaded. They may have been removed."  — 同上
"This entity could not be loaded." — 同上
"This feedback ticket could not be loaded."  — 同上
"Title and details are required before submitting feedback."  — 旧校验
"Title is required."               — 旧校验
"Trending now"                     — 旧 KPI label
"Try selecting another category or view all articles."  — 旧空态
"Undo"                             — 通用 — **谨慎删除**，可能在 toast 系统中动态调用
"Unpin article"                    — 已被 "Unpin" 替代
"Update"                           — 通用 — **谨慎删除**，高频动态使用嫌疑
"User panel"                       — 旧 a11y label
"User profile"                     — 已被 "Profile" 替代
"View"                             — 通用 — **谨慎删除**
"View policies"                    — 已被 "View access policies" 替代
"View quota details"               — 已被 "Quota details" 替代
"View reports"                     — 已被 "Open report runs" 替代
"Web Push"                         — 大小写变体（保留 "Web push"）
"Webhook {name} has been disabled." — 已被 "Webhook {name} disabled" 替代
"Webhook {name} has been enabled." — 同上
"Webhook {name} is now configured for {url}." — 同上
"Webhook {name} test event queued: {eventType} · {eventId}." — 同上
"Website"                          — 通用占位
"Workflow enabled"                 — 旧 toast
"Workspace tabs"                   — 旧 a11y label
```

### A.2 中置信度（建议保留观察）

下列 key 文案语义看起来仍可能被动态调用，B8 删除前需在 dev 模式手测后确认：

```
"Apply"               — 通用按钮，可能被 modal/form 动态使用
"Change"              — 同上
"Dismiss"             — toast 系统常用
"In-app"              — 通知 channel 类型
"List"                — 视图模式切换
"Grid"                — 同上
"Loose"               — 间距控件
"Filters"             — 通用面板标题
"Permissions"         — 可能用于权限矩阵动态构造
"Submitted"           — feedback 状态机动态值
"To"                  — date range UI 中可能拼接
"Update"              — 通用按钮
"View"                — 通用按钮
```

### A.3 占位/调试文案（可清理）

```
"+{value}%"
"-{value}%"
"(Unreliable values are hidden.)"
"Example RSS URL"
"Example content selector"
"Example date selector"
"Example delay (ms)"
"Example link selector"
"Example list selector"
"Example title selector"
"Importance {value}"
"Current: {status}"
"Online (v{version})"
"Initialization completed"
"Initialization failed"
"Initialize knowledge graph failed"
"LLM backfill failed"
"LLM entity extraction started"
"Processed {articles} articles and wrote {links} relations"
"{count} active filters"
"{count} articles enqueued for AI entity extraction"
"{count} recent searches"
"{count} sources available"
"{count} sources selected"
```

这些大多是后端审计事件 / 调试日志的旧映射，B6/B7 的真实事件名已经接管，可清理。

---

## B. 间接可能使用（建议**保留**）

`.tmp/unused-indirect.txt` 列出了 256 个 "字符串字面量在 src/ 中存在但没有直接 t() 调用" 的 key。这通常意味着：

- 通过 `roleTierLabelKey()` 等 helper 间接传递
- 通过 JSON spec 文件（如 `permission-matrix-config.json` 之类）查表
- 通过 `commands[id].labelKey` 查表

**示例**（前 15 条已在扫描输出中验证存在）：

```
"AI Governance" / "AI Usage"      — admin nav 配置 JSON 中的 labelKey
"All status" / "All tiers"        — filter chip 通过 enum→labelKey 映射
"Admin console"                    — sidebar config 中的 labelKey
```

**建议：B8 不要触碰这 256 条 indirect 候选**，需要 B9（如果有）或后续维护周期专门做一次"动态 key 落表"清理才能安全删除。

---

## C. 推荐处理流程（给 B8）

1. **第一步**：在 IDE 中以 "Find in Files (含字符串)" 模式搜索 A.1 中每个 key
   - 如果只在 `messages/zh.json` + `messages/en.json` 出现 → 安全删除
   - 如果还在其他文件出现 → 跳过，归入 indirect 候选

2. **第二步**：在 dev 模式跑 admin 主流程（onboarding / dashboard / users / channels / banners / feedback / reports / api-keys / knowledge / audit / ai-usage / sources），**打开浏览器 console 监听 `[i18n] Missing translation`**

3. **第三步**：跑 `pnpm --filter @law-eye/web check:i18n`，确认 missing/extras 为零

4. **第四步**：在 `messages/zh.json` 和 `messages/en.json` 同步删除已确认废弃的 key（**两份必须同步**，否则 i18n script 会报 missing/extra）

5. **第五步**：commit message 建议 `chore(i18n): wave 5 cleanup — remove N orphaned keys verified via static scan + dev manual sweep`

---

## D. 不删除的安全清单（即使在 A.1 列表里）

下列 key 即使被静态扫描标记为未使用，**也建议在 B8 保留**，原因：高频被动态调用嫌疑大：

```
"Apply"
"Change"
"Dismiss"
"Filters"
"In-app"
"Grid" / "List"
"Not set"
"Permissions"
"Submitted"
"To"
"Undo"
"Update"
"View"
"Website"
```

这些是通用 UI 词汇，删除后如果某个动态调用点漏报，会出现"在生产突然冒出英文 fallback"的灾难。

---

**End of file. 累计候选 318 条，强建议保留 14 条，剩余 ≈ 304 条可在 B8 case-by-case 清理。**
