# i18n 审计 (2026-05-05)

> 数据来源：grep `t("...")` 全项目调用 + diff `apps/web/src/messages/{zh,en}.json`。
> 完整缺失键清单：`prompts/0505/data/missing-zh-keys.txt`（503 行）。

---

## 1. i18n 架构（已就位）

```
apps/web/src/lib/i18n.ts          → t(locale, key, params)
apps/web/src/lib/i18n-client.ts   → useT() hook
apps/web/src/messages/zh.json     → 1748 个 zh 翻译条目
apps/web/src/messages/en.json     → 1726 个 en 翻译条目
```

**Key 风格**：`English String With Capitals` 作为 key，zh/en JSON 各自给出译文（Crowdin/Lokalise 风格）。

**fallback**：`t()` 在找不到 key 时**返回 key 原文**（即英文）。这是为什么 zh locale 下页面渲染英文 — 不是 t() 没被调用，是 zh.json **没有这条 key**。

---

## 2. 缺失 key 数量

```
项目中调用的 t() 键唯一数：1654
zh.json 已有键唯一数：    1749
缺失（t() 调用但 zh 无）：  503
```

完整清单：[`data/missing-zh-keys.txt`](data/missing-zh-keys.txt)

### 高优先样本（admin / 核心功能）

```
Admin
Admin display name
Admin email
Admin reply:
Browse tenant members
Create category
Create source
Delete account
Delete category
Delete tenant?
Delete this category?
Edit banner
Edit category
Edit channel
Edit report template
Enable MFA
Disable MFA
Invite user
User management
Update password
AI gateway
AI governance data unavailable
AI report generation has been queued.
AI tokens / mo
AI usage dashboard
API key management
API rate limit
Active users 24h
Articles 24h
Awaiting B.6b telemetry
Banner duplicated
...（共 503 条）
```

---

## 3. 类型分布

按 grep 模式统计 503 条缺失 key 的来源域：

| 域 | 估算占比 | 说明 |
|---|---|---|
| admin/* 页面与组件 | ~55% | "Admin display name" / "Invite user" / "Delete tenant?" |
| AI 治理 / AI 使用 | ~15% | "AI gateway" / "AI governance data unavailable" |
| 报告模板 / banner | ~10% | "Edit banner" / "Banner duplicated" / "Edit report template" |
| 反馈中心 | ~5% | "Admin reply:" |
| 其他（settings / errors / hints） | ~15% | "Update password failed" / "Awaiting B.6b telemetry" |

---

## 4. 非 t() 来源的英文残留

### 4.1 后端 error.message 直出

`/zh/reports/RPT-*` 错误页直接渲染：
```
Invalid URL: Cannot parse `id` with value `RPT-...`: UUID parsing failed: ...
(request_id=...)
```

**修复**：在 error boundary 把 error code 翻成 i18n key（如 `errors.invalid_uuid`），不要直接渲染 `error.message`。

### 4.2 enum 字面量直出

`/zh/admin/audit` 把 `event_type` 列直接渲染 `user.login` / `tenant.create`。

**修复**：建立 `auditEventLabels: Record<EventType, string>` 映射表，每个 event_type 注册到 zh.json。

### 4.3 seed 数据英文

`/zh/articles`、`/zh/dashboard` 的最新资讯卡片是 HackerNews 抓取的英文标题。

**修复**：
- 短期：把 dev seed 替换为中文样例（`scripts/dev_seed_zh_articles.sh`）。
- 长期：article 模型加 `title_translated_zh` / `title_translated_en` 字段，前端按 locale 选择。

### 4.4 lib 工具自身英文

```
lib/i18n.ts:135  if (!Number.isFinite(diffMs)) return "";
                 // ↑ 不算英文残留，但 ↓ 走 t() 没问题
                 if (diffMins < 1) return t(locale, "Just now");
```
✅ formatTimeAgo 已正确走 t()。

---

## 5. zh-strict 守卫方案

修复"键缺失 = 英文回退"的核心问题，需要做两件事：

### 5.1 dev 模式 throw

修改 `lib/i18n.ts::t()`：
```ts
export function t(locale: Locale, key: string, params?: TranslationParams): string {
  const dict = locale === "zh" ? zhTranslations : enTranslations;
  const template = (dict as Record<string, string>)[key];
  if (!template) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[i18n] missing key for ${locale}: ${JSON.stringify(key)}`);
      // 可选：throw new Error(`...`)
    }
    return key;  // 生产保持兜底
  }
  return interpolate(template, params);
}
```

### 5.2 CI 守卫脚本

`scripts/check-i18n-coverage.mjs`：

```js
// 1. grep all t("...") calls
// 2. parse zh.json + en.json
// 3. fail if any t() key not in zh.json
// 4. exit code != 0
```

接到 `pnpm check` / `pre-commit` / GitHub Actions。任何新增 t() key 必须同时补 zh.json，否则 CI 红。

---

## 6. 修复策略（PR 切分参考）

| PR | 范围 | 工作量 |
|---|---|---|
| **i18n-1** | 把 503 条缺失 key 全部补到 zh.json + en.json | 2-3h |
| **i18n-2** | error.message 直出改 error code 映射 | 1h |
| **i18n-3** | audit event_type 枚举映射表 | 30min |
| **i18n-4** | dev 模式 throw + CI 守卫脚本 | 1h |
| **i18n-5** | seed 数据中文化（替换 HackerNews） | 1h |

合并到 `02-FIX-PLAN.md` 的 PR3 (zh-strict)。

---

## 7. 翻译质量参考

中文译法风格统一标准（来自 zh.json 现有条目）：

- 动词优先：`Edit` → `编辑`（不要 `编辑（`）
- 名词后缀：`management` → `管理`（如 "User management" → "用户管理"）
- 反问句保留 `？`：`Delete tenant?` → `删除租户？`
- 通知风格：`...has been queued.` → `...已加入队列。`
- 复数 `{count} items` → `{count} 条`（避免"个"）

team agent 翻译 503 条时遵循上述风格。
