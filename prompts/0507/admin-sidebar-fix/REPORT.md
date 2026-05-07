# Hotfix — Admin Sidebar 不 sticky / 不跟内容走

任务：Task #7 (admin-sidebar-fixer)
工作目录：`D:/Desktop/LawSaw`
日期：2026-05-07

---

## 根因（CSS containing-block 陷阱）

**症状**：访问 `/zh/admin/**` 任意子页面，页面向下滚动后，左侧 admin sidebar 会**跟着滚走**（"管理员控制台 / 治理与遥测"标题区被推出视口），而不是保持完整可见。

**调查路径**：

1. 浏览器 DevTools 检查 `<aside>` computed style：`position: fixed; top: 0; left: 0; height: 1024px` — 自身定位**正确**。
2. 滚动到底部时观察 `aside.getBoundingClientRect()`：`y = -448.67`。即 sidebar 的"viewport"被向上推了 448.67px。
3. **遍历父级链查找 transform / filter / will-change / contain**，命中：

   ```
   {
     tag: "DIV",
     cls: "min-h-[calc(100vh-0px)]",
     filter: "blur(0px)",  // <— 凶手
     transform: "none",
     willChange: "auto",
     contain: "none"
   }
   ```

4. 该 `<div>` 出自 `apps/web/src/components/providers/route-transition-provider.tsx` 第 67-83 行的 `<motion.div>`：
   - `RouteTransitionProvider` 用 `framer-motion` 在每次 pathname 变化时给 children 套一层 `<motion.div>`，并应用 `initial/animate/exit` variants：

     ```ts
     animate: { opacity: 1, x: 0, filter: "blur(0px)" }
     ```
   - 即使动画结束，`filter: "blur(0px)"` 这条 inline style **仍然保留**。

5. **CSS 规范**：当一个元素的 `filter` 不为 `none`（即便是 `blur(0px)` / `brightness(1)` / 等"等价于无效果"的值），它会成为后代 `position: fixed` 元素的 **containing block**（替代 viewport）。同样规则适用于 `transform`、`will-change: transform/filter`、`perspective`、`contain: paint/layout`。
   - 文档：MDN [`Containing block`](https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block) — "If the position property is fixed, the containing block is established by the nearest ancestor that has a transform, perspective, or filter property set to something other than none."

6. **后果**：
   - admin-shell 的 `<aside position: fixed; top: 0>` 不再以 viewport 为参考，而是以这个 `<motion.div>` 为参考。
   - `<motion.div className="min-h-[calc(100vh-0px)]">` 的高度等于 `max(viewport, content)`；当 admin 页面内容超过 viewport，这个 div 高度 > viewport（实测 1473px / viewport 1024px）。
   - 用户向下滚动时，整个 div（含 sidebar 在内）相对 viewport 上滑 — sidebar 的 `top: 0` 始终对齐 div 顶端而不是 viewport 顶端 — **看起来 sidebar 跟着 main 一起滚走**。

---

## 修复方式（避开 containing-block 陷阱）

**只修改一个文件**：`apps/web/src/components/layout/admin-shell.tsx`

### 1. 用 flex shell 替代 fixed positioning（核心）

把外层 wrapper 从 `relative min-h-screen` + `<aside fixed>` + `<div md:ml-[260px]>` 三段式改成 **flex 行布局**：

```tsx
<div className="relative flex h-screen w-full overflow-hidden">
  {/* sidebar：flow-level flex item，width 控制折叠，无 fixed */}
  <aside className="hidden md:flex shrink-0 flex-col border-r
                   transition-[width] duration-300
                   w-[260px] | w-16 (collapsed)" />

  {/* mobile drawer 保持 fixed inset-y-0（drawer 语义不变）*/}
  <AnimatePresence>{mobileOpen && <motion.dialog .../>}</AnimatePresence>

  <div className="flex min-w-0 flex-1 flex-col">
    <AdminTopBar />
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 md:px-6 md:py-8">
        {children}
      </div>
    </main>
  </div>
</div>
```

为什么这能解决问题：

- sidebar 不再是 `position: fixed`，因此**完全不依赖**祖先的 containing block。
- 外层 `h-screen overflow-hidden` 强制整个 admin shell 锁定到 viewport 高度；文档自身不再外层滚动（实测 `documentElement.scrollHeight = viewport`）。
- main 内部 `overflow-y-auto` 自己滚动，sidebar 永远占据 flex 行的左侧，**跟父级 transform/filter 状态无关**。
- 即使 RouteTransitionProvider 后续保留或修改动画，admin shell 都不会再受影响。

### 2. nav 内部 scroll 复位 + overscroll-contain（细节体验）

`<nav>` 内部仍然 `overflow-y-auto`（nav 项数量在折叠/不折叠下可能溢出）。新增：

```ts
const navRef = useRef<HTMLElement | null>(null);
useEffect(() => {
  const node = navRef.current;
  if (node) node.scrollTop = 0;
}, [activePath]);  // pathname 切换时复位
```

并给 `<nav>` 加 `overscroll-contain`，避免 wheel 事件穿透到 main / 父级。

### 3. 不变的部分

- `AdminSidebarPanel`、`AdminTopBar`、role guard、mobile drawer 行为完全保持。
- 接口签名、props、消息 keys、layout id 全部保持。
- 翻译文案、route 结构、auth 流程不动。

---

## 文件清单

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `apps/web/src/components/layout/admin-shell.tsx` | 修改 | 外层 shell 重构 + nav scrollTop reset + overscroll-contain |

约束遵守：
- ✅ 不动 `apps/web/src/app/[locale]/admin/insights/reactions/page.tsx`
- ✅ 不动 `apps/web/src/components/admin/insights/reactions/*`
- ✅ 不动 `RouteTransitionProvider`（修改它会影响全站动画，爆炸半径过大）
- ✅ 仅 admin-shell 内部改动

---

## 验证

### 自动化（Playwright + DevTools）

修复**前** `/zh/admin/insights/reactions`：

```jsonc
// 滚到底
{
  "scrollY": 448.67,
  "asideRect": { "x": 0, "y": -448.67, "w": 260, "h": 1024 }  // sidebar 跟着滚走 ❌
}
```

修复**后** `/zh/admin/insights/reactions`：

```jsonc
{
  "docScrollY": 0,
  "documentScrollHeight": 1024,         // 文档不再外层滚动
  "main.overflow": "auto",
  "main.scrollHeight": 1416,
  "main.clientHeight": 967,
  "mainScrollTop after scroll-to-end": 448.67,  // main 自己滚
  "asideRect": { "x": 0, "y": 0, "w": 260, "h": 1024 }  // sidebar 锁死 ✓
}
```

折叠状态二次验证：

```jsonc
// 点击「收起菜单」后再滚到底
{ "asideWidth": 64, "asideY": 0, "asideH": 1024, "mainScrollTop": 448.67 }
// 折叠依然 sticky ✓
```

### 截图证据（4 张）

```
prompts/0507/admin-sidebar-fix/
├── before-top.png      # 修复前，main 顶部，sidebar 顶部完整
├── before-bottom.png   # 修复前，main 滚到底，sidebar 整体滚走 ❌
├── after-top.png       # 修复后，main 顶部，sidebar 完整
└── after-bottom.png    # 修复后，main 滚到底，sidebar 不动 ✓
```

### 双绿

- `pnpm tsc --noEmit` → exit 0 ✓
- `pnpm lint` → 0 errors（仅剩 4 个本任务无关的预存 warnings）✓

---

## 设计权衡说明

**为什么不修 RouteTransitionProvider 直接去掉 `filter`？**
- `transform` 同样会触发 containing-block 替换，而 RouteTransitionProvider 还有 `x: 24/0/-16` 的滑动动画要保留。
- 即便去掉 transform 与 filter，整个全站动画系统会被改掉，爆炸半径远超 admin。
- admin-shell 用 flex 布局是 **本地化、零波及** 的方案 —— 任何"包了 motion 动画包装层导致 fixed 子元素失效"的同类问题在 admin 范围都被根治。

**为什么 mobile drawer 还保留 fixed？**
- mobile drawer 是覆盖式 dialog，其 `inset-0` 即使被 motion.div 困住，效果上仍然覆盖整个动画容器（高度 ≥ viewport），不影响视觉与交互。本次任务核心是 **desktop sidebar 不 sticky**，mobile drawer 行为正常。

**为什么 main 用 `overflow-y-auto` 而不是 `overscroll-behavior: contain` + window scroll？**
- 外层 window scroll 仍然会被 motion.div 影响（虽然不是 fixed 问题，是 scroll target 的归属）。
- main 内部滚动让 admin 页面的 sticky topbar、未来可能的 sticky filters / sticky breadcrumb 都能在统一的 scroll container 内工作，是更稳的架构。

---

## 完成判定 ✓

- ✅ `/zh/admin/insights/reactions` 滚到底，sidebar 完整可见
- ✅ `/zh/admin/users` 等其他子页面同样 sticky
- ✅ 折叠/展开切换正常，sidebar 始终 y=0
- ✅ 多页切换不残留 nav scroll 异常（pathname 触发 scrollTop=0）
- ✅ typecheck + lint 双绿
- ✅ 4 张截图证据
- ✅ 不 commit
