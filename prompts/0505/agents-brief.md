# Agent Briefs — frontend-restore Team

> 用于 TeamCreate 团队成员。每个 brief 自包含、可独立执行。

---

## 已 spawn

- ✅ shell-unifier — PR1 外壳收敛
- ✅ detail-page-fixer — PR2 详情页补全
- ✅ prototype-wirer — PR4 prototype 接线
- ⏳ i18n-cleaner — PR3 zh-strict（前 3 个完成后再 spawn，避免 zh.json 冲突）

---

## i18n-cleaner brief（待 spawn）

```
你是 LawSaw 前端修复团队 frontend-restore 的成员，名字 i18n-cleaner，负责执行 PR3 zh-strict。

## 必读
1. prompts/0505/03-I18N-AUDIT.md
2. prompts/0505/02-FIX-PLAN.md（PR3 部分）
3. prompts/0505/data/missing-zh-keys.txt（503 条静态清单 — 起点；执行时要重新 grep 因为前面的 PR2/PR4 可能新增 t() 键）

## 工作内容

### 1. 重新 grep 缺失键
全项目 grep `t\("[A-Z][^"]+"` 收集所有调用键，diff zh.json，输出当前缺失清单（数量可能 > 503，因为前 3 个 PR 加了新键）。

### 2. 翻译并写入 zh.json
- 按 03-I18N-AUDIT.md §7 风格规范翻译
- 同时往 en.json 补 key（中文键的英文版还是英文原文，避免反向 fallback 到中文）
- 维护 JSON 排序（key 字母序）

### 3. 修 t() 实现
- apps/web/src/lib/i18n.ts
- 在 t() 函数找不到 key 时，开发模式 console.error
- 生产保持兜底（返回 key 原文）

### 4. 加 CI 守卫
- 新建 apps/web/scripts/check-i18n-coverage.mjs
- 内容：grep 所有 t() 调用键，与 zh.json 比对，如缺失则 exit 1
- 加到 apps/web/package.json scripts.check
- 加到 .github/workflows/ci.yml（如该文件存在）

### 5. 修 audit event_type 直出英文
- 新建 apps/web/src/lib/audit-event-labels.ts，建枚举映射
- 修 apps/web/src/components/admin/audit-log-table.tsx 用映射表
- 把 user.login / tenant.create 等 enum 翻成中文显示

## 你绝对不能做的
- ❌ 改非 messages / i18n 文件以外的逻辑（让其他 agents 处理）
- ❌ 改 globals.css

## 验收
1. pnpm --filter web typecheck 通过
2. pnpm --filter web run check（如新加） exit 0
3. dev 模式访问 /zh/admin/users 不再出现 console "[i18n] missing key"
4. /zh/admin/audit event_type 列变中文

## 协作
完成后 TaskUpdate completed + SendMessage 给 team-lead 简短汇报
```

---

## 后续工作（main agent 自做）

PR5 — 布局收纳的剩余部分（admin/audit 虚拟滚动 + dashboard 截断）
PR6 — 数据清洗（替换 HackerNews seed → 中文 fixture）
PR7 — edge polish（最后 1-2 个细节）
最终回归 — 用 prompts/0505/data/regression-probe.mjs 跑全路由验收
