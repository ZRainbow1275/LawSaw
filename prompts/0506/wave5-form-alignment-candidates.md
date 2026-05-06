# Wave 5 — admin form 视觉对齐候选清单

> 作者：detail-page-fixer (B5 owner) — 2026-05-06
> 目的：B7/B8 阶段决定是否单独派任务做 banners/new + reports/new + reports/templates/[id] 的 frame 级对齐
> 状态：调研报告（不直接驱动改动）

---

## 1. mp4 真值缺席声明（关键）

依据 `prompts/0506/wave5-b6-frame-index.md` D 段：

> "mp4 不覆盖（admin 26 项）。Admin 路由 (#23-#48) mp4 全无直接证据。"

具体：
- `/zh/admin/banners/new` — mp4 **0 帧**
- `/zh/admin/reports/new` — mp4 **0 帧**
- `/zh/admin/reports/templates/[id]` — mp4 **0 帧**

**结论**：所谓"frame 级对齐"在 mp4 SoT 上**不可执行**。任何 admin form 的视觉规范只能从次级真值推导：

1. `prototype/app.html`（含 banner 显示卡 / active-banner 卡，**但无创建表单**）
2. `prompts/0506/design-system.md`（含通用 token，**无独立 form 章节**）
3. 客户端路由 mp4 帧的卡片间距 / radius / shadow 共性外推

---

## 2. 当前实现（B5 后）合规度自评

### 2.1 `/zh/admin/banners/new` — `apps/web/src/app/[locale]/admin/banners/new/page.tsx`

| 维度 | 当前实现 | design-system.md 规范 | 评估 |
|------|---------|----------------------|------|
| 顶部 header | `<Card>` + Megaphone icon (h-7 w-7 primary-500) + title text-3xl + 副标题 muted | 无明确规范，参照 dashboard half-001 顶部 | ✅ 合规 |
| 表单分组 | 3 组 Card：Banner content / Targeting / Schedule & display | mp4 sec-040 反馈卡 "提交反馈" 单 Card；admin 复杂表单参照拆分 | ✅ 合规 |
| Card radius | `radius-lg` 默认（来自 ui/card） | design-system 4.6 radius-lg = 12px | ✅ 合规 |
| 字段 label | `text-xs uppercase tracking-wide` + headingStyle | 与 [id] 详情页 MetaList label 同样式 | ✅ 一致 |
| Tier/channel toggle | rounded-full chip + `--surface-accent-strong` active | mp4 sec-040 反馈类型 chip 同语法 | ✅ 合规 |
| 提交按钮 | primary `<Button>` + Loader2 spinner | design-system 4.6 primary button | ✅ 合规 |
| 取消按钮 | outline variant | design-system 4.6 secondary | ✅ 合规 |

**判定**：**已成熟**。无候选改动项。

### 2.2 `/zh/admin/reports/new` — `apps/web/src/app/[locale]/admin/reports/new/page.tsx`

| 维度 | 当前实现 | 评估 |
|------|---------|------|
| header | `<Card>` + FilePlus2 icon + title text-3xl | ✅ 合规 |
| 表单分组 | 1 组 Card "Template details" 含全部字段 | ⚠️ 候选：可拆为「基本信息（name+cadence+description）」「正文（body）」「样式（css）」三组，与 banners/new 风格统一 |
| body textarea | font-mono text-xs min-h-48 | ✅ 合规 |
| css textarea | font-mono text-xs min-h-32 | ✅ 合规 |

**候选改动（低优先级）**：
- 将单 Card 拆为 3 组 Card（基本/正文/样式），与 `templates/[id]` 编辑器三段化保持一致
- 工时估计：< 30 分钟，无 schema 变化

### 2.3 `/zh/admin/reports/templates/[id]` — `apps/web/src/app/[locale]/admin/reports/templates/[id]/page.tsx`

B5 已重写为：左 main 三段 Card（details / body / css）+ 右 aside（Live preview + metadata）。

**判定**：**已成熟**。无候选改动项。

---

## 3. 跨页一致性候选

| 项 | 现状 | 候选优化 | 优先级 |
|---|------|---------|--------|
| `reports/new` form 拆分 | 1 Card | 拆 3 Card 与 banners/new + templates/[id] 对齐 | P3 nice-to-have |
| 表单错误态 | inline 红框 div (banners/new) vs toast (reports/new) | 统一走 toast + 内联校验消息 | P3 |
| 提交按钮 loading 文案 | banners 用 "Submitting..." vs reports 用 "Creating..." | 统一为 "Saving..." 或同步 verb | P3 |

---

## 4. 未在 mp4 中出现的元素 — 从客户端帧外推

如需更精细对齐，可从这些客户端帧外推 form-card 视觉细节：

- `half-080` (feedback page) — "提交反馈" 卡有左 4px red accent + 4 chip + textarea。**banners/new 未应用 4px 左条**
- `half-035` (articles) — 列表卡用绿色低风险 4px 左条。**form Card 不应用左条**（form 不是 entity card）

**推论**：admin form Card **不需要 colored left accent**，与 entity list/detail 不同。

---

## 5. B7/B8 决策建议

### 5.1 不建议派单独 task 做 form frame 对齐

**理由**：
1. mp4 在 admin form 上**无直接证据**——任何"对齐"都是推测
2. 当前 banners/new + reports/new + templates/[id] 都已 Card 化 + 用同一 design-system token，视觉一致性已达标
3. 单 Card vs 3 Card 是审美选择，不是规范错误

### 5.2 如必须派单，最小工作集

仅 reports/new 单 Card → 3 Card 拆分（P3，<30min）。预计：
- 文件：`apps/web/src/app/[locale]/admin/reports/new/page.tsx`
- 改动：仅 JSX 结构，无 hooks / no schema / no i18n key 新增
- 风险：极低
- 收益：跨表单页一致性提升 ~5%

### 5.3 强烈建议同时关注的非 form 项

调研 mp4-frames-deep 时发现的高价值改动（不在 B5 但属 B6/B7 范畴）：

- **half-005** 通知 popover 锚定 topbar 钟铃 — 当前 `/zh/me/notifications` 是独立路由，是否改为 popover？
- **half-001 sidebar active = "数据看板"** — 验证 dashboard 路由 active state 不回归
- **scene-010 / half-100** loading fallback = 橙色圆环 + 路径标签 — 检查所有 native page Suspense boundary

这些更接近 mp4 真值，比 form 对齐 ROI 更高。

---

## 6. 文件签出（供后续 task 引用）

- 编辑器： `apps/web/src/app/[locale]/admin/reports/templates/[id]/page.tsx`
- 横幅创建： `apps/web/src/app/[locale]/admin/banners/new/page.tsx`
- 报告模板创建： `apps/web/src/app/[locale]/admin/reports/new/page.tsx`
- 共享布局： `apps/web/src/components/admin/detail-layout.tsx`（DetailLayout + MetaList，可在 form 页未来抽出 `FormLayout` 复用）

---

> 文档完结。B7/B8 owner 直接以本文档作为决策输入。
