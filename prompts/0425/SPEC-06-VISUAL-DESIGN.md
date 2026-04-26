# SPEC-06 — 视觉灵动恢复（设计令牌 + 无 emoji）

**状态**: Draft v1.0  
**版本**: 1.0.0 / 2026-04-25  
**依赖**: `research/02-markdown-editor-and-reader-ux.md` §6 (Visual Recovery), `research/03-current-state-gap.md` §3 (Visual Audit), `prototype/app.html`, `apps/web/src/app/globals.css`, `.trellis/spec/frontend/design-compliance.md`

---

## 0. 关键发现（来自 research/03 §3.1）

> **"白花花一大片" 的 smoking gun：30+ 组件引用了 24 个 CSS 变量但 globals.css 未定义** → 浏览器静默 fallback 到 transparent / 默认 → 白底。
>
> **核心修复策略：先定义 tokens，不动组件。** 单文件修改即可救活 30+ 组件视觉。

---

## 1. 缺失的 24 个 CSS 变量（必须立即定义）

### 1.1 Surface 系列（hero / muted / accent / popover）

```css
/* apps/web/src/app/globals.css — 在 @theme 块内追加 */

/* === 缺失的 hero 渐变 (heavy use, dashboard / admin / sidebar / feed) === */
--surface-hero-primary-gradient: linear-gradient(135deg, #fff4f1 0%, #ffd9c8 60%, #ff7b59 100%);
--surface-hero-emerald-gradient: linear-gradient(135deg, #ecfdf5 0%, #a7f3d0 60%, #10b981 100%);
--surface-hero-amber-gradient: linear-gradient(135deg, #fffbeb 0%, #fde68a 60%, #f59e0b 100%);
--surface-hero-violet-gradient: linear-gradient(135deg, #faf5ff 0%, #d8b4fe 60%, #a855f7 100%);
--surface-hero-cyan-gradient: linear-gradient(135deg, #ecfeff 0%, #a5f3fc 60%, #06b6d4 100%);
--surface-hero-rose-gradient: linear-gradient(135deg, #fff1f2 0%, #fecdd3 60%, #f43f5e 100%);
--surface-hero-indigo-gradient: linear-gradient(135deg, #eef2ff 0%, #c7d2fe 60%, #6366f1 100%);
--surface-success-gradient: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);

/* === Banner / CTA 渐变 (强渐变，按原型 banner card 配方) === */
--gradient-banner: linear-gradient(155deg, #FF7B59 0%, #FF5A36 50%, #E04520 100%);
--gradient-cta: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600));
--gradient-cta-hover: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700));
--gradient-active-nav: linear-gradient(90deg, var(--color-primary-50), var(--color-primary-100));
--gradient-soft-strip: linear-gradient(90deg, var(--color-neutral-50), rgba(241,243,244,0.8));

/* === Dashboard 暗面板（关键！viz card 用） === */
--color-neutral-950: #0b0f17;
--color-dash-bg: #0B1120;
--color-dash-bg-2: #111827;
--gradient-viz-card: linear-gradient(145deg, var(--color-dash-bg), var(--color-dash-bg-2));
--gradient-hero-visual: linear-gradient(135deg, var(--color-dash-bg), var(--color-dash-bg-2));
--gradient-viz-halo: radial-gradient(ellipse at 30% 20%, rgba(255,107,53,0.04) 0%, transparent 60%);

/* === Muted / 卡片底色 (页面 wrapper / 卡片背景) === */
--surface-muted-bg: rgba(248, 249, 250, 0.85);
--surface-muted-text: var(--color-neutral-600);
--surface-muted-border: rgba(233, 236, 239, 0.6);

/* === Accent (强调卡片 / info card) === */
--surface-accent-bg: var(--color-primary-50);
--surface-accent-border: rgba(255, 107, 53, 0.2);
--surface-accent-icon-bg: rgba(255, 107, 53, 0.12);
--surface-accent-strong: var(--color-primary-700);
--surface-accent-muted: var(--color-primary-600);
--surface-accent-copy: var(--color-primary-800);

/* === Popover === */
--surface-popover-bg: white;

/* === Field / Auth copy === */
--field-foreground: var(--color-neutral-900);
--auth-copy-primary: var(--color-neutral-900);
--auth-copy-secondary: var(--color-neutral-700);
--auth-copy-tertiary: var(--color-neutral-500);

/* === Control hover / selected (sidebar / nav) === */
--control-hover-bg: rgba(241, 243, 244, 0.6);
--control-selected-bg: var(--color-primary-50);
--control-selected-border: rgba(255, 107, 53, 0.3);
--control-selected-text: var(--color-primary-700);

/* === Glassmorphism === */
--glass-sidebar-bg: rgba(255, 255, 255, 0.92);
--glass-sidebar-blur: blur(20px) saturate(180%);
--glass-sidebar-border: 1px solid rgba(233, 236, 239, 0.6);
--glass-sidebar-shadow: 4px 0 24px rgba(233, 236, 239, 0.2);
--glass-topbar-bg: rgba(255, 255, 255, 0.88);
--glass-topbar-blur: blur(16px) saturate(180%);
--glass-popup-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);

/* === Shadows === */
--shadow-brand: 0 4px 14px -2px rgba(255, 107, 53, 0.25);
--shadow-brand-lg: 0 8px 32px rgba(255, 107, 53, 0.25);
--shadow-feed-hover: 0 8px 30px rgba(255, 107, 53, 0.10);
--shadow-popup-deep: 0 16px 48px rgba(0, 0, 0, 0.15);
--shadow-popup-card: 0 12px 40px rgba(0, 0, 0, 0.12);
--shadow-back-to-top: 0 4px 16px rgba(255, 107, 53, 0.35);

/* === Radius === */
--radius-2xl: 1.5rem;
--radius-pill: 999px;
```

---

## 2. 缺失的 5 个 keyframes

```css
/* apps/web/src/app/globals.css — 追加 */

@keyframes pulse-live {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.4);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 0 6px rgba(40, 167, 69, 0);
  }
}

@keyframes shimmer-bar {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes bounce-gentle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(6px); }
}

@keyframes marquee-track {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes popup-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes pulse-primary-soft {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 107, 53, 0.35); }
  70% { box-shadow: 0 0 0 8px rgba(255, 107, 53, 0); }
}
```

---

## 3. Utility classes（追加）

```css
.bg-gradient-banner { background: var(--gradient-banner); }
.bg-gradient-cta { background: var(--gradient-cta); }
.bg-gradient-cta:hover { background: var(--gradient-cta-hover); }
.bg-gradient-viz { background: var(--gradient-viz-card); }
.bg-gradient-hero-visual { background: var(--gradient-hero-visual); }

.shadow-brand { box-shadow: var(--shadow-brand); }
.shadow-brand-lg { box-shadow: var(--shadow-brand-lg); }
.shadow-feed-hover { box-shadow: var(--shadow-feed-hover); }

.glass-sidebar {
  background: var(--glass-sidebar-bg);
  backdrop-filter: var(--glass-sidebar-blur);
  -webkit-backdrop-filter: var(--glass-sidebar-blur);
  border-right: var(--glass-sidebar-border);
  box-shadow: var(--glass-sidebar-shadow);
}
.glass-topbar {
  background: var(--glass-topbar-bg);
  backdrop-filter: var(--glass-topbar-blur);
  -webkit-backdrop-filter: var(--glass-topbar-blur);
}

.animate-pulse-live { animation: pulse-live 2s ease-in-out infinite; }
.animate-shimmer-bar { background-size: 200% 100%; animation: shimmer-bar 2s linear infinite; }
.animate-bounce-gentle { animation: bounce-gentle 2.5s ease-in-out infinite; }
.animate-marquee-track { animation: marquee-track 30s linear infinite; }
.animate-popup-in { animation: popup-in 0.25s ease; }
```

---

## 4. 组件回归 checklist

为防 token 加完但组件未消费，逐组件验证：

- [ ] **Sidebar** 用 `glass-sidebar`（不是 solid white） — `apps/web/src/components/layout/sidebar.tsx`
- [ ] **Topbar** 用 `glass-topbar`
- [ ] **Banner card** 用 `bg-gradient-banner` + radial 光晕 ::before
- [ ] **Viz card / Map area** 用 `bg-gradient-viz`（暗色 navy） — 当前为白
- [ ] **Hero visual** 用 `bg-gradient-hero-visual` + 半透明水印
- [ ] **CTA buttons** 用 `bg-gradient-cta` + `shadow-brand`，**不**用扁平橙
- [ ] **Active sidebar item** 用 `gradient-active-nav` + `shadow-sm`
- [ ] **Reading progress bar** 用 `animate-shimmer-bar`
- [ ] **Live dot**（Dashboard 标题旁）用 `animate-pulse-live`
- [ ] **Scroll hint** 箭头用 `animate-bounce-gentle`
- [ ] **Trending strip** 用 `animate-marquee-track`，hover 暂停
- [ ] **Popovers / dropdowns** 用 `animate-popup-in` + `shadow-popup-deep`
- [ ] **Feed cards** IntersectionObserver staggered reveal
- [ ] **Stat cards** 数字滚动计数（rAF + easeOutCubic）
- [ ] **Page transitions** `<motion.div>` + pageVariants（y 8→0, 300ms）
- [ ] **Sidebar collapse** `cubic-bezier(0.25, 0.8, 0.25, 1)` 缓动
- [ ] **Map popup** 用 `glass-popup-shadow` + `animate-popup-in`
- [ ] **Back-to-top** 浮按钮用 `shadow-back-to-top`

---

## 5. Lucide 图标全替代 emoji

详细迁移表见 research/02 §7（80+ 图标映射）。

### 5.1 emoji 检查（pre-commit）

```bash
# 检查源代码 emoji
grep -rP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' apps/web/src --include="*.tsx" --include="*.ts" --include="*.css" || echo "PASS: 0 emoji"
```

放入 CI（`.github/workflows/lint.yml` 加一步）。

### 5.2 IconRegistry（统一管理）

```typescript
// apps/web/src/lib/icon-registry.ts
import * as LucideIcons from 'lucide-react';

export type IconName = keyof typeof LucideIcons;

export function Icon({ name, ...props }: { name: IconName } & React.SVGProps<SVGSVGElement>) {
    const Component = LucideIcons[name];
    if (!Component) throw new Error(`Icon "${name}" not found in lucide-react`);
    return <Component {...props} />;
}
```

### 5.3 尺寸约定（research/02 §7.2）

| Context | size | stroke |
|---|---|---|
| Sidebar nav | h-5 w-5 | 2 |
| Category nav | h-3.5 w-3.5 | 2 |
| Topbar action | h-5 w-5 | 1.75 |
| Feed-card meta | h-4 w-4 | 1.5 |
| Stat-card big | h-4 w-4 (in 32px box) | 2 |
| Reader floating | h-4 w-4 | 1.75 |
| Risk pill micro | h-3 w-3 | 2.5 |
| Toolbar | h-4 w-4 | 2 |
| Empty-state hero | h-12 w-12 | 1.5 |

---

## 6. Workspace 视觉差异化（详见 SPEC-02 §10）

| 要素 | Admin | User |
|---|---|---|
| Topbar accent | `var(--color-info)` 浅蓝条带 | `var(--color-primary-500)` 紫色条带 |
| Sidebar tint | 浅冷灰 + glass | 暖色 + glass |
| Page hero name | "Operations Hub" | "Today's Insights" |
| 字体 weight | medium-bold | regular-medium |
| 卡片圆角 | 8px | 12px |
| 主 CTA color | info-blue | primary-purple |

---

## 7. Page 入场动画统一

```typescript
// apps/web/src/lib/motion.ts
export const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
export const itemVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.8, 0.25, 1] } },
};
export const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
```

每个页面顶层 `<motion.div initial="hidden" animate="visible" variants={containerVariants}>` 包一层；卡片用 `variants={itemVariants}`。

---

## 8. 字体

```css
/* globals.css */
--font-sans: 'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif;
--font-serif: 'Source Han Serif SC', 'Noto Serif SC', Georgia, serif;
--font-mono: 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace;
```

阅读器主文用 `--font-serif`（提升专业感）；UI 用 `--font-sans`；代码用 `--font-mono`。

---

## 9. Dark mode（保留 stub，本轮不做）

预留所有 token 使用 `color-mix`、可在 `:root[data-theme='dark']` 重新定义。本轮 Phase G 不实施 dark theme，仅保留扩展点。

---

## 10. 验收

- [ ] §1 24+ 个 CSS 变量在 `globals.css` 定义
- [ ] §2 5 个 keyframes 加入
- [ ] §3 utility classes 可用
- [ ] §4 组件回归 checklist 全 ✓
- [ ] §5.1 emoji 检查 0 命中
- [ ] §6 admin / user shell 视觉差异可辨
- [ ] §7 全站统一入场动画
- [ ] 视觉对照原型 5 个核心页（Dashboard / Feed / Article / Analytics / Admin）≥ 90% 一致
