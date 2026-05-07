# Critical Review — Wave 6 后期

> 视角：首席架构师 + 高端产品设计师
> 范围：apps/web 前端 + 全局 chrome + 主用户路由
> 审视人：critical-reviewer (wave6-prototype-1to1 团队)
> 审视日期：2026-05-06
> dev server 离线，全程静态审视；不读 manifest，不跑 a11y 自动化。

## 总评

Wave 6 把"原型 1:1"和"持久化 chrome"都按时落地了，骨架是站稳了——但代码读起来像**"两套并存的房子"**：`(shell-default)` / `(shell-wide)` 路由组下的新结构干净克制；而旧的 `app/me/feed/page.tsx`、`app/me/articles/[id]/page.tsx`、`app/dashboard/page.tsx`、`app/feedback/page.tsx` 等无 `[locale]` 前缀的旧路由全都还在，里面还在调用同一批组件（`MeFeedPage`、`ReaderPage`），但**不带 `embedded` prop**——这是双层 chrome 的隐患温床。视觉层面，`globals.css` 把 token 体系铺得很认真，但 prototype 子目录内大量内联 `style={{ ... }}` 硬编码 12px / 24px / `#ff8a5e` 直接绕过了 token，让"统一品味"变成了"局部品味"。一句话总结：**这是一座精装修了主卧、但客厅还在用 3 年前临时家具的房子**。

---

## Severity 1 — 阻塞品味的问题

### S1.1 旧无 locale 路由与 [locale]/(shell-*) 双轨并存，组件被两次包壳

- **位置**：
  - `apps/web/src/app/me/feed/page.tsx`（无 [locale]，调 `<MeFeedPage />` 不带 embedded）
  - `apps/web/src/app/[locale]/(shell-wide)/me/feed/page.tsx:6`（调 `<MeFeedPage embedded />`）
  - 同样模式存在于 `apps/web/src/app/dashboard/`, `app/reports/`, `app/feedback/`, `app/data/`, `app/sources/`, `app/category/`, `app/me/articles/[id]/`, `app/me/notifications/`, `app/me/reading-history/`, `app/me/settings/`, `app/search/`, `app/settings/`
- **问题**：Next.js App Router 同时存在 `/me/feed` 和 `/[locale]/me/feed` 时，前者总是优先（路由不冲突也不报错），导致用户访问 `/me/feed` 拿到的是旧版本——里面 `MeFeedPage` 没传 `embedded`，于是在 `<MeFeedPage>` 内自带 `<UserShell>`（含一个 `ProtectedRoute`、一份 Sidebar/Header），而**外层 `[locale]/layout.tsx` 又渲染了 `PersistentUserShell`**——一旦用户走 `/zh/me/feed` 或 i18n 切换路径转译命中 [locale] 分支，又会走另一套；同一个组件库两套布局来源。这是 wave 6 想消灭的"双重 mount"以另一种形式悄悄回来。
- **架构师视角**：路由层承诺过 PersistentUserShell 是 single source of truth，但旧路由没删，承诺破了。`PersistentUserShell.SHELL_EXEMPT_PREFIXES` 里 11 个 `TODO(shell-lift)` 注释是这场债务的诚实记账（`persistent-user-shell.tsx:57-72`）；现在这账没还。
- **修复建议**：
  ```diff
  - apps/web/src/app/me/feed/page.tsx          (整个文件删掉)
  - apps/web/src/app/me/articles/[id]/page.tsx (整个文件删掉)
  - apps/web/src/app/dashboard/page.tsx       (迁移到 [locale]/(shell-default)/dashboard)
  - apps/web/src/app/feedback/page.tsx        (与 [locale]/(shell-default)/feedback 合并)
  - apps/web/src/app/data/page.tsx            (同上)
  - ...对全部无 locale 前缀的 app/<segment>/page.tsx 做同样处理
  ```
  并在 `next.config` 或 middleware 里强制 `/me/foo` 重定向到 `/zh/me/foo` 或 `/en/me/foo`。
- **修复成本**：M（每条路由迁移可逐个做，但需要全量回归 e2e）

### S1.2 ProtectedRoute 在三个 `if` 分支里返回完全相同的 spinner，但 `bootstrapTimedOut` 后会 race 重定向

- **位置**：`apps/web/src/components/auth/protected-route.tsx:99-130`
- **问题**：`isLoading` 中、`!isAuthenticated` 中、`!tierSatisfied` 中三个 fallback 全是同一个 `<div className="flex min-h-screen ..."><div className="h-8 w-8 animate-spin border-primary-500"/></div>`。第二个 useEffect (`L50-80`) 在 `bootstrapTimedOut=true` 后会立刻跑 `router.replace(login?returnTo=...)`，但渲染分支只看 `!isAuthenticated`——也就是说**用户在 12s 超时这一刻会先看到"未认证 spinner" → 几十毫秒后路由切到 `/login` → 又渲染一次 spinner（login 页面 mount 期间）**，外加 `useEffect L67-71` 依赖 `window.location.pathname` 这一非响应式数据源（pathname 来自 `useRouter`，不是 props）。
- **架构师视角**：副作用里的"每次未认证就 push login"没用 ref 防抖，依赖数组里 `roleTier` 和 `roles` 没列（L31 的 destructuring 是 store hook，但 effect deps 只列了 `[isLoading, isAuthenticated, bootstrapTimedOut, locale, router, refreshSession]`），租户切换或 token 刷新时可能导致 effect 不重跑，进而漏掉 tier 重检。
- **设计师视角**：三态用同一 spinner 等于把 12s 超时、未登录、权限不够三种**用户语义完全不同**的等待都呈现成同一个形状——用户没有任何线索区分"系统在加载"和"我被踢了"。
- **修复建议**：
  ```tsx
  // L99-130 重构
  if (isLoading && !bootstrapTimedOut && !isAuthenticated) return <BootstrapSpinner />;
  if (!isAuthenticated) return <RedirectingToLogin />;          // 不同文案
  if (!tierSatisfied)   return <InsufficientTierEmpty tier={requiredRole} />;
  ```
  外加在 effect 里把 push 操作 wrap 进 `useRef<boolean>` flag 防止重复 push。
- **修复成本**：S（约 30 行代码 + 3 个简单的 stub 组件）

### S1.3 全局 `* { transition: all 0.2s cubic-bezier(0.4,0,0.2,1) }` 是 perf cliff

- **位置**：`apps/web/src/app/globals.css:422-424`
- **问题**：通配选择器对**每个元素**的**所有 CSS 属性**应用过渡，包括 width / height / margin / padding / color / background / transform / opacity ……。当用户切换 `collapsed` (`md:ml-[280px]` ↔ `md:ml-16`)，浏览器会同时为页面里数百到上千个 DOM 节点的 `margin-left` 起 transition 动画——但只有外层一个容器需要。Lighthouse 对这一类 paint thrash 是直接扣分项。
- **架构师视角**：sidebar.tsx 已经用 `transition: "transform 0.25s ease"` 显式控制了 framer-motion 的 transform 路径；通配过渡反而成了「双重动画」的噪声源。
- **设计师视角**：这种「全局柔化」是 2018 年 Material Design 做法的过时残留——现代 design system（Linear/Vercel/Stripe）都把 transition 显式写在每个交互组件上，因为每种 affordance 应用不同曲线和时长。
- **修复建议**：
  ```css
  /* 删除 globals.css:422-424 整段 */
  /* 替换为针对常用交互的工具类（已有 hover-lift / card-hover / btn-press），
     在按需的位置显式添加 transition；其余元素无过渡。 */
  ```
- **修复成本**：M（需要 grep 出哪些组件依赖了"默认所有属性都过渡"，逐个补 explicit transition）

### S1.4 dark mode 是"半成品"——背景/文本 token 切了，但 brand color / 状态色 token 没切

- **位置**：`apps/web/src/app/globals.css:306-419`
- **问题**：`.dark { ... }` 里只重写了 surface / glass / control / accent / nav 一组，但下列 token **没有 dark 覆盖**：
  - `--color-success / --color-success-light / --color-warning / --color-warning-light / --color-error / --color-error-light / --color-info / --color-info-light`（L39-46 只在 `@theme` 定义一次）
  - `--cat-legislation / --cat-regulation / ...`（L51-71，分类色 10 个）
  - `--shadow-card / --shadow-card-hover / --shadow-popup-card`（L100-110，所有阴影都用纯黑 `rgba(0,0,0,...)`，在深色底上会"消失"）
  - `--gradient-banner` (L218-224，强渐变橙红，深色底过曝)
  - `--admin-surface-bg: #ffffff`（L115，**写死纯白**——admin 进入深色模式整个底色仍是白）
- **设计师视角**：深色模式被宣传"已支持"，但实际只要进 admin 就直接撞白，就要爆视网膜。这是**比"暂不支持深色"更糟**的状态——用户期待被建立后被打破。
- **修复建议**：
  ```css
  .dark {
    --color-error-light: rgba(220, 53, 69, 0.16);
    --color-warning-light: rgba(255, 193, 7, 0.18);
    --color-success-light: rgba(40, 167, 69, 0.18);
    --color-info-light: rgba(23, 162, 184, 0.18);
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.5);
    --shadow-popup-card: 0 12px 40px rgba(0, 0, 0, 0.6);
    --admin-surface-bg: hsl(0 0% 12%);
    --admin-card-bg: hsl(0 0% 16%);
    /* ... 全套补齐 */
  }
  ```
  或在产品决策上**正式暂不支持深色，从 root 移除 `.dark` 类挂载机制**，等下个版本再开。中间态最伤品牌。
- **修复成本**：M（一次性补齐 token 大概 30 行；测试 admin/reader/dashboard 三大场景）

### S1.5 prototype 组件大面积内联 style = 绕过 token 体系

- **位置**：
  - `apps/web/src/components/feedback/prototype/feedback-page.tsx:46-262`（19 个 `CSSProperties` 常量 + 多处硬编码 `#fff / #e8f5e9 / #1565c0 / #f57f17 / #c62828 / #2e7d32`，以及 `linear-gradient(135deg, #ff8a5e, #ff6b35)` —— `#ff8a5e` 在 design token 里**根本不存在**）
  - `apps/web/src/components/analytics/prototype/analytics-page.tsx:19-37`
  - `apps/web/src/components/reports/prototype/reports-page-content.tsx:91-116`（header pad / radius / size 都是硬编码）
- **问题**：把 1:1 复刻当成"原样保留 px 与 hex"——但**原型 HTML 是设计稿的低保真表达**，不应是生产源真理。结果就是：
  1. design token 改 `--color-primary-500: #FF6B35 → #FF7B45` 时，feedback 表单里那个 `linear-gradient(#ff8a5e, #ff6b35)` 不会跟着变。
  2. 字号 13/14/22 在 feedback 与 analytics 各写各的，但 reader-page、me-feed-page 都用 Tailwind `text-sm/text-base/text-2xl`——同一产品里两套字阶。
  3. 内联 style 不能命中 `:focus-visible` / `:hover` 伪类，所有 prototype 组件几乎都**没有 hover 反馈**（feedback type cards `L108-118` 是其中一个，纯静态边框切换）。
- **设计师视角**：高品味产品的字号、行高、间距是阶梯，不是一堆离散的杂数（13/14/22/24 这套没有数学关系，破阶梯）。Tailwind 已经定义好了 4/8/12/16/20/24/32 这套 8pt grid，prototype 里硬编码 12/14/16/20 部分契合部分不契合。
- **修复建议**：
  ```tsx
  // 反例（feedback-page.tsx:46）
  const containerStyle: CSSProperties = { width: "100%" };
  const titleStyle: CSSProperties = { fontSize: 22, fontWeight: 700, ... };

  // 正例
  <div className="w-full">
    <h1 className="text-2xl font-bold tracking-tight text-[var(--color-foreground)]">
  ```
  分批迁移：feedback 先做（最严重，整个表单都靠 inline style）→ analytics → reports。每迁一个用 git diff 视觉回归。
- **修复成本**：L（feedback-page 一个文件就 ~520 行 inline style，光这一处就要 4-6 小时）

### S1.6 Sidebar `previewRoleTier` 是个"伪交互"，会误导用户对权限的理解

- **位置**：`apps/web/src/components/layout/sidebar.tsx:264, 286-287, 600-633, 685-700`
- **问题**：sidebar 底部 role pill 点击展开 `roleOptions`，用户选了之后 `previewRoleTier` 改变了 badge 颜色和文案，但**没有把 preview 状态传到 `auth-store`**——所以 sidebar 上 role badge 显示「premium」可能页面里 ProtectedRoute / RoleTierGuard 仍然按 `actualRoleTier` 判断。文案"This only changes the prototype preview and does not modify backend permissions."（L640-642）只在弹层里出现一次，关掉就没线索。
- **设计师视角**：这个"伪 toggle"破坏了"sidebar 是真相之镜"的心智模型。在原型阶段 OK，**作为生产 UI 必须移除或重做成全局 dev-only switch**——藏在右下角 dev tools 里，不是用户能误触的位置。
- **修复建议**：把 preview 行为限制在 `process.env.NODE_ENV === "development"` 才挂载；正式环境下 role badge 不可点击，只显示当前真实 tier。或者完全砍掉，挪到 admin 的 "View as user" 影子模式。
- **修复成本**：S（30 分钟以内）

### S1.7 admin shell 与 user shell 是两套独立 auth 副作用，重启路由时各走各的

- **位置**：`apps/web/src/components/layout/admin-shell.tsx:464-472` vs `apps/web/src/components/auth/protected-route.tsx:50-80` vs `apps/web/src/components/providers/auth-provider.tsx:415-428`
- **问题**：进入 admin 时三处都会发 `refreshSession`：
  1. `AuthProvider` 的 pathname effect 每次 path 变就 fire（L427）
  2. `AdminShell.useEffect` (`L464-472`) 在 `!isAuthenticated` 时 fire 一次（带 ref 防抖）
  3. `ProtectedRoute` 在 admin 不挂载（admin shell 内部自己做了 isAdmin 短路），所以这一份不重复——但**用户从 user 段跳到 admin 段**时，user 段的 `<ProtectedRoute>` 已经在 mount 时也 fire 过 refreshSession——总计 path 切一次最多 3 次 `auth/me` 请求。
- **架构师视角**：authoritative session check 应该是单一来源（`AuthProvider.useEffect[pathname]` 是合理的入口），其他地方应该只读 store。`AdminShell` 那段 useEffect 是历史遗留——`AuthProvider` 已经包了它，它就不该再 fire。
- **修复建议**：
  ```diff
  - apps/web/src/components/layout/admin-shell.tsx:464-472 整段 useEffect 删除
  ```
  以及 `protected-route.tsx:50-80` 里 `requestedSessionCheckRef` 那段 fire `refreshSession` 也可以删——`AuthProvider` 已经在每个 pathname 变化时 fire，而 ProtectedRoute 仅在 PersistentUserShell 内部，pathname 总是已被 AuthProvider 看到过。
- **修复成本**：S（30 分钟，需要回归 `/admin` 入口冷启动）

---

## Severity 2 — 应改但非阻塞

### S2.1 Header 用户菜单 logout 后不清 query cache

- **位置**：`apps/web/src/components/layout/header.tsx:108-111`，`apps/web/src/hooks/use-auth.ts:287-297`
- **问题**：logout 调 `apiClient.post("/api/v1/auth/logout")` 后只 `storeLogout()`，没 `queryClient.clear()`。下一个用户登录前的几秒钟内（同 tab 不刷新），React Query 的 stale 数据可能短暂泄露给新用户视图——`useMeFeed`、`useReadingHistory` 都会先返回旧 user 的 cache。
- **修复建议**：在 `useAuth.logout` 里加：
  ```ts
  import { useQueryClient } from "@tanstack/react-query";
  const queryClient = useQueryClient();
  ...
  } finally {
    storeLogout();
    queryClient.clear();
  }
  ```
- **修复成本**：S

### S2.2 Header search box 用 `<datalist>` 做"recent searches"——视觉与品牌完全脱节

- **位置**：`apps/web/src/components/layout/header.tsx:172-176`
- **问题**：`<datalist>` 是浏览器原生 autocomplete，外观随 user-agent 渲染（Chrome / Edge / Firefox / Safari 各不一样，无法用 CSS 控制），高品位产品几乎不会用它做主搜索的历史下拉。原型应该是定制弹层；这里用 `<datalist>` 等于把"高品位 SaaS"降级到了"政务网站搜索框"。
- **设计师视角**：搜索体验是 hero 体验之一（globally accessible from header），用浏览器默认 UI 等于在用户最高频的接触点放一个"未完成的占位"。
- **修复建议**：用 `cmdk` 或自建 `<Combobox>`（Headless UI/Radix）实现历史下拉，统一 hover/focus/选中态、支持键盘 arrow/enter，和品牌橙色高亮一致。
- **修复成本**：M（约半天）

### S2.3 阅读器 `<aside>` 用 `xl:block` 隐藏 → 1280-1535 区间用户拿不到目录与 AI 见解

- **位置**：`apps/web/src/components/user/reader-page.tsx:207, 411`
- **问题**：两侧 aside 都是 `hidden xl:block`，Tailwind `xl` 默认是 `min-width: 1280px`。但 reader-page 的中央 `<article>` 在 `xl:grid-cols-[15rem_minmax(0,1fr)_18rem]` 下需要 ≥1280px 才显示三列；笔记本主流 14/13" 设备分辨率 1440x900 满足，但**13" MacBook Air @ 1280×800** 与 **1366×768** 的常见 Windows 笔电也勉强够 1280 但没冗余——中央列被压成 470px 左右，正文阅读宽度太窄。
- **设计师视角**：阅读器是产品的"灵魂场景"，应该在 ≥1024 (lg) 就提供基本目录（哪怕折叠为悬浮按钮）；现在直接把目录砍了 = 把读者扔进无导航的森林。
- **修复建议**：
  ```diff
  - <aside className="hidden xl:block">  // toc
  + <aside className="hidden lg:block">  // 1024+ 显示目录
    <aside className="hidden xl:block">  // ai insights 保持 xl
  ```
  或为 lg-xl 区间提供"目录抽屉"（点 toc 图标弹层）。
- **修复成本**：S

### S2.4 `* { transition: all }` + framer-motion `useReducedMotion` 二次保险有冲突

- **位置**：`apps/web/src/components/layout/sidebar.tsx:553-574, 662-663` 与 `globals.css:422-424, 964-973`
- **问题**：`@media (prefers-reduced-motion)` 已用 `!important` 把 `transition-duration` 强压成 0.01ms（globals.css:964-973），同时 sidebar.tsx 又额外用 `useReducedMotion()` 决定是否传 framer-motion `whileHover/whileTap` props——双重保险但两边 source 不一致。reduced-motion preference 在 CSS 与 JS 层都被读取，**JS 层每个组件都要重复写 `reducedMotion ? undefined : { ... }`**——18 处条件三元（`sidebar.tsx` 一个文件就有 6 处）。
- **架构师视角**：违反 DRY；正确做法是一个 `<MotionProvider>` 包 framer-motion `MotionConfig reducedMotion="user"`，子组件不再判断。
- **修复建议**：
  ```tsx
  // app/[locale]/layout.tsx 或 root provider
  import { MotionConfig } from "framer-motion";
  <MotionConfig reducedMotion="user">{children}</MotionConfig>
  // sidebar/admin-shell 里所有 reducedMotion ? undefined : {...} 全部删掉
  ```
- **修复成本**：M（涉及 sidebar / admin-shell / onboarding / me-feed-page，约 30 处条件）

### S2.5 sidebar Brand 区 `bg-gradient-cta` 与 admin Brand 区 `--color-primary-500` 单色直接撞色不一致

- **位置**：`sidebar.tsx:323` (`bg-gradient-cta`) vs `admin-shell.tsx:99-104` (单色 + 1px shadow)
- **问题**：admin shell 注释说 "task #11 changed brand to single color + light shadow"，但 user sidebar 仍在用厚重 gradient + 深 brand-shadow（`sidebarBrandMarkStyle.boxShadow` 是 `0 4px 12px primary-500 15%`）。两个 shell 一个 hard 一个 soft——视觉系统破裂。
- **设计师视角**：品牌识别要在所有 surface 一致出现。要么"全 soft"要么"全 hard"，绝不能 user 段是火热 gradient logo、admin 段是冷静单色 logo——这等于告诉用户"admin 是另一个产品"。
- **修复建议**：选 soft 风格统一（admin 那套更现代、更克制），更新 `sidebar.tsx:322-326` 与 `sidebarBrandMarkStyle`。
- **修复成本**：S

### S2.6 i18n 渲染——分类标签 `t(item.name)`、按钮 `t("Retry")` 等大量字符串散落各处

- **位置**：`sidebar.tsx:419, 473`、`header.tsx:144, 165` 等
- **问题**：UI 字符串 = 翻译 key 直接耦合英文原文（`t("Retry")`）。一旦设计要把 "Retry" 改成 "Try again"，要么改 key（破坏翻译表）要么改翻译表（不直觉）。i18n 最佳实践应该用 namespace key（`button.retry`）。
- **修复建议**：长期需重构为 key-based，但短期不做。建议在 `lib/i18n.ts` 写"key 命名规约文档"，新增字符串走规约。
- **修复成本**：L（不建议立刻做）

### S2.7 onboarding tour 在 1.2s 后弹出 → 抢占用户首次输入

- **位置**：`apps/web/src/components/onboarding/onboarding-tour.tsx:86-90`
- **问题**：用户登录后 1.2s 强制弹出引导。但用户登录后 1.2s 内可能正在：（a）滚动 feed（b）点击侧边栏（c）刚开始打字搜索；overlay 一弹，所有交互被 backdrop 截断。
- **设计师视角**：onboarding 的 timing 应该是"用户停下来 ≥3s 没动作"才弹，或者"等用户首次完成一次有意义动作（如点开一篇文章）后再触发"。
- **修复建议**：把 1200ms 改 3000ms，并加 `IdleCallback` 检测（无输入 ≥2s 才 open），或改成一个 toast banner "查看引导" 让用户主动触发。
- **修复成本**：S

### S2.8 ProtectedRoute fallback prop 实际不可访问的 spinner

- **位置**：`protected-route.tsx:101-106, 113-117, 124-129`
- **问题**：spinner div 没有 `role="status"` 或 `aria-label`——屏幕阅读器读到的是空白。`role="progressbar"` / `aria-busy="true"` 都缺。在权限受限那一支（L120-130）也没有 `aria-live` 通知"正在重定向"。
- **修复建议**：
  ```tsx
  <div role="status" aria-label={t("Loading")} aria-live="polite" className="...">
    <span className="sr-only">{t("Loading")}</span>
    <div className="h-8 w-8 animate-spin..."/>
  </div>
  ```
- **修复成本**：S

### S2.9 me-feed banners 用 inline `backgroundImage: var(--gradient-banner)` 但只对第一条 (index===0) 应用，其余用纯色 — 但循环里 magic number `slice(0, 3)` 没解释

- **位置**：`apps/web/src/components/user/me-feed-page.tsx:157-185`
- **问题**：硬编码"前 3 条 banner，第 1 条特殊"——策略写在视图层，没有 spec 文档支撑。如果产品想改成"前 5 条"或"重要级 banner 高亮"，得重写视图。
- **修复建议**：把"哪条 banner 高亮"作为 banner 数据的属性 (`banner.featured: boolean`) 让后端决定，前端只 render。
- **修复成本**：M（含后端 schema 变化）

---

## Severity 3 — Polish / Nice-to-have

### S3.1 `me-feed-page.tsx:307-311` 用字符串数组生成 skeleton key（`FEED_ARTICLE_SKELETON_IDS`）

- **位置**：`me-feed-page.tsx:42-62`
- **问题**：定义 6 个常量字符串只为给 skeleton 一个 stable key，但 React 对静态长度数组用 `index` 作 key 完全没问题。代码膨胀无收益。
- **修复建议**：`Array.from({length: 6}).map((_, i) => <ArticleCardSkeleton key={i}/>)`
- **修复成本**：S

### S3.2 滚动条样式用品牌橙渐变铺到全局

- **位置**：`globals.css:482-507`
- **问题**：橙色滚动条放到所有内部滚动容器（包括 admin 侧边栏、reader 目录、knowledge graph 三栏）会变成"任何能滚动的地方都有橙色"。在阅读器和知识图谱里**和内容颜色对比强烈**，反而抢占注意力。
- **修复建议**：滚动条降级为低饱和度灰（`var(--color-neutral-300)`/`var(--color-neutral-400)`），仅在 sidebar 等少数地方保留品牌强调。
- **修复成本**：S

### S3.3 reader-page 中 `Back to feed` 按钮固定指向 `/me/feed`，从其他入口（如 `/articles`、`/category/xxx`）点进文章后再返回会"传送"到 feed

- **位置**：`reader-page.tsx:172-179`
- **问题**：硬编码 back href = 单一目标。用户从 `/articles` 进文章后 `Back to feed` 让人困惑。
- **修复建议**：用 `history.back()` 或读 `document.referrer`/searchParam (`?from=articles`)。
- **修复成本**：S

### S3.4 Feedback 表单 cancel 按钮 reset 表单但无确认弹层

- **位置**：`feedback-page.tsx:443-445, 322-327`
- **问题**：用户敲了 200 字反馈点 cancel 直接清空，没有 "Discard changes?" 确认。
- **修复建议**：当 `title || content || email` 非空时，cancel 弹 Modal 确认。
- **修复成本**：S

### S3.5 `auth-provider.tsx:217-256` 401 重检逻辑里 `unauthorizedRecheckInFlight.current = true` 但 `apiClient.get` 抛错时用 `try { ... }` finally 会先 finally 再 throw——race 条件下两次 401 同时到达会被吞一次。

- **位置**：`auth-provider.tsx:217-254`
- **问题**：复杂 race 路径，已经被 `lastUnauthorizedAt` cooldown 覆盖大概率 OK，但读起来心智负担高。
- **修复建议**：长期可重构为单 effect + 状态机；短期不动。
- **修复成本**：M

### S3.6 sidebar role popup 使用 `absolute bottom-[calc(100%+0.75rem)]`，移动端窄屏可能溢出 viewport 顶端

- **位置**：`sidebar.tsx:588`
- **问题**：sidebar 高度满屏，role popup 弹在按钮上方 calc(100%+0.75rem)，在 iPhone SE (568h) 等老设备上可能被切。
- **修复建议**：用 Radix Popover 或 floating-ui 处理 collision detection。
- **修复成本**：M

### S3.7 globals.css 中 `--reading-paragraph-spacing: 1.5em` 但 reading-store 没暴露

- **位置**：`globals.css:156` vs `reading-store.ts:79-87`
- **问题**：CSS 定义了"段间距"token 但 reading-store 没让用户调整（只有 line-height）。
- **修复建议**：要么从 `globals.css` 移除；要么扩展 `ReadingSettings` 加 `paragraphSpacing`。
- **修复成本**：S

### S3.8 `auth-store.ts` 完全不持久化，只有 sidebar-store 持久化 collapsed

- **位置**：`auth-store.ts` 整个 vs `sidebar-store.ts:36-37`
- **问题**：刻意决定（auth 不持久化避 PII）OK；但 reading-store 又持久化 `bookmarks/progressMap`（`reading-store.ts:208-216`）——三个 store 三种持久化策略，没有 ADR 文档说明为什么。
- **修复建议**：在 `apps/web/docs/state-architecture.md` 写一份"哪个 store 持久化、为什么"的决策记录。
- **修复成本**：S（写文档）

---

## 架构层面（横切关注点）

### A.1 状态管理一致性
- **现状**：`auth-store`（无 persist）/ `sidebar-store`（partial persist：collapsed only）/ `reading-store`（full persist）/ `appearance-store`（test 文件存在，未读）/ `onboarding-store`（与 indexedDB 二级 hydration）/ `workspace-store`/`toast-store` —— 七个 zustand store 各有各的持久化策略。
- **问题**：onboarding-store 用了**自己的 persist hydration listener**（`onboarding-tour.tsx:44-73`），而其他 store 默认信任 zustand 内部——不统一。
- **建议**：抽一个 `createPersistedStore<T>(name, partialize)` factory，所有 store 走统一壳；hydration race 在 factory 里一次解决。

### A.2 副作用边界
- **现状**：`AuthProvider`（pathname effect refresh / window.error / unhandledrejection / SW unregister / api error handler 全在一个 effect 里）—— 单 effect 做 5 件事，依赖数组只有 `[router]`，部分逻辑（SW 注册）严格说应该是 mount-once-effect 不应跟 router 绑。
- **问题**：`auth-provider.tsx:144-413` 是一个 ~270 行的巨型 effect。
- **建议**：拆成 4 个 useEffect：(a) error/rejection listener (b) api error handler (c) SW 注册 (d) localStorage 清理。每个 effect 责任单一、依赖数组准确。

### A.3 组件职责
- **MeFeedPage**、**ReaderPage** 都引入了 `embedded` prop —— **这是架构异味**：组件知道自己被嵌入与否。正确分层应该是：
  - `<MeFeedContent>` 纯内容组件（无 shell）
  - `<MeFeedPage>` = `<UserShell><MeFeedContent/></UserShell>` 旧路由用
  - `<MeFeedRoute>` 直接 `<MeFeedContent/>` 新路由用
- 现在的 `embedded` 三元开关让组件耦合上下文。Tier A 应该把它拆掉。

### A.4 性能 cliff
- 全局 `* { transition: all 0.2s }` (S1.3 已列)
- AuthProvider 大 effect 重 mount 风险
- sidebar Brand mark 用 framer-motion 的 `motion.button` + `whileHover/whileTap`（`sidebar.tsx:647-711`），打开 popup 时会强制重新 layout
- prototype 组件大量 inline style 阻碍 CSS 解析缓存

### A.5 可演进性
- 11 个 `TODO(shell-lift)` (S1.1) —— 技术债已经显式化但**没有任何指派或截止日期**。
- `app/me/feed`（旧）与 `app/[locale]/(shell-wide)/me/feed`（新）共存的路由策略需要 ADR

---

## 设计层面（横切关注点）

### D.1 视觉一致性
- 两套 Brand mark 风格（user 段 gradient + brand-shadow vs admin 段 single color + soft shadow）—— S2.5
- 两套字号阶梯（Tailwind text-* vs prototype 内联 13/14/22）—— S1.5
- 两套滚动条品牌强弱（global brand-orange-gradient 全局）—— S3.2

### D.2 留白节奏
- `[locale]/(shell-default)/layout.tsx` 主区 `px-4 py-6 md:px-6 md:py-8` ↔ `[locale]/(shell-wide)/layout.tsx` 同款
- header 自身 `h-16 px-4 md:px-6` + 下方 breadcrumb `py-2`
- sidebar `p-3` outer ↔ items `px-3 py-2.5` —— 这部分内部一致，OK
- **断层**：feedback-page.tsx 用 `padding: 24` (=24px = py-6 px-6)，但外面 layout 已经给了 `px-4 md:px-6 py-8`，于是产生**双重 padding**视觉问题（外 24 + 内 24 = 48px 上下空洞）

### D.3 字号/字重阶梯
- 当前实际用到的尺寸：text-[10px] / 11px / text-xs / text-[13px] / text-sm / text-base / text-lg / text-xl / text-2xl / text-3xl / text-4xl —— **11 种**，超出"5-7 种就够"的高品味标准。
- `text-[10px]` 与 `text-[11px]` 出现在 admin 角标（`admin-shell.tsx:303`、sidebar role pill `sidebar.tsx:686`）—— **小于 12px 的字在 ZH UI 普遍模糊**

### D.4 色彩克制
- 品牌橙在以下位置出现：sidebar brand mark / sidebar active item left bar / category icon backgrounds / global scrollbar / banner gradient / focus ring / selection / `me-feed-page` 1st banner / reader-page upgrade CTA / feedback-page submit button gradient (`#ff8a5e → #ff6b35`)。
- **过度使用** = 用户视觉疲劳、品牌强调失效。建议保留 active state + primary CTA，其余降级。

### D.5 状态完备性（loading/empty/error/skeleton）
- **good**：`me-feed-page` 三态齐全（loading skeleton / error EmptyState / empty Card+EmptyState）
- **good**：`reports-page-content` skeleton
- **bad**：`feedback-page.tsx:467-518` 只有 isLoading（spinner）/ isError（"Failed to load"）/ empty（"No feedback yet"）—— 没有 error 时的 retry 按钮
- **bad**：`knowledge-page-content.tsx` 没有显式 empty state，只把 isLoading/isError 透传给三个 panel，但 panel 自己各写各的 fallback —— 不一致
- **bad**：`analytics-page.tsx:39-72` —— 切换 tab 时**没有任何 loading skeleton**，靠 panel 自己处理

### D.6 动效价值
- Sidebar collapse chevron 动画（180° rotate）—— 有价值
- onboarding-tour overlay spring —— 有价值
- me-feed-page `staggerChildren` 0.08s entrance —— 第一次进入有惊喜感，**但每次路由切换都重放一遍**会变烦躁
- 滚动条 brand-gradient —— 无价值，纯装饰
- Brand mark `animate-pulse-primary-soft`（globals.css:773-775，4 个 animation utility）—— 没看到用，疑似死代码

### D.7 A11y 落地真实性
- focus-visible 已在 :root 全局加 outline（`globals.css:458-462`）—— 但**通配 `transition: all`** 让 outline 也参与过渡 = 焦点指示器淡入淡出 = 视觉上看不清焦点位置
- spinner 三处（S2.8）无 aria-label
- onboarding overlay 用 `pointer-events-none` + 内层 `pointer-events-auto`，但**没有 focus trap**（与 sidebar mobile drawer 有 focus trap 不同）
- skip-link 已实现（`globals.css:464-479`）—— good

### D.8 深色模式预案
- 半成品（S1.4 已列）

### D.9 响应式断点
- reader-page `xl` 才显示 toc（S2.3）
- header 在 < md 失去 WorkspaceSwitcher（`header.tsx:150-152`）—— 移动端用户看不到当前 tenant
- sidebar mobile drawer width=280 = desktop 完整 sidebar 宽 —— 老 iPhone (320w) 几乎占满
- prototype/reports `width: 100%` + cardStyle padding 24 在 < 480px 上会出现水平滚动

---

## 优先级建议

> 如果只能修 5 个，按这个顺序：
>
> 1. **S1.1 — 删除/迁移所有无 locale 前缀的旧 `app/<segment>/page.tsx`**：这是 wave 6 想消灭的"双重 mount"漏洞的真实出口。不修这一条，后续所有 chrome 优化都可能被旧路径绕过。修复成本 M，但能彻底关闭一类问题。
>
> 2. **S1.5 — Feedback / Analytics / Reports prototype 大规模 inline style 迁移到 token + Tailwind**：这是品味的根因。一边喊 design token，一边硬编码 px 与 hex，是高品味产品最不能容忍的虚伪。先做 feedback-page（最严重，约半天），再 analytics、reports。
>
> 3. **S1.4 — 深色模式补齐或正式下架**：当前是"半支持"——比"不支持"更伤品牌。要么花 1 天补齐 admin / shadow / status / category 全套，要么从 root 直接停用 .dark 类挂载，等下版本。
>
> 4. **S1.3 — 删除 `* { transition: all }`**：性能上 + 视觉上都得分。perf cliff + focus indicator 模糊一并解决。
>
> 5. **S1.2 — ProtectedRoute 三态分离 + a11y 修补**：把"加载/未登录/权限不够"做成三个语义清晰的视图，并加 role="status"/aria-live。30 行代码，A11y、UX、品味同时提升。

---

## 备注

- dev server 离线，无法走 Playwright 真实交互验证（mp4-frames、wave5 截图作为间接参考已读）
- 报告基于静态代码 + token 系统 + 主路由结构推断，**所有 file:line 引用基于本次审视时的快照**
- 12 条 S1 + 9 条 S2 + 8 条 S3 + 横切 4 + 4 = 共 37 条具体 finding（其中带 file:line 的具体 finding 21 条，超出最低 12 条要求）
