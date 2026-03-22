# 法眼 (LawSaw) 设计系统合规规范

> 最后更新: 2026-03-22
> 权威来源: `apps/web/src/app/globals.css` + `apps/web/src/lib/motion.ts`
> 原型参考: `prototype/app.html`

---

## 1. 颜色令牌 (Color Tokens)

### 1.1 品牌主色 — 橙色系

| Token | Hex | 用途 |
|---|---|---|
| `--color-primary-50` | `#fff4f1` | 背景高亮、活跃态背景 |
| `--color-primary-100` | `#ffe6dc` | 活跃态渐变终点 |
| `--color-primary-200` | `#ffccb8` | 边框高亮 |
| `--color-primary-300` | `#ffb394` | 辅助装饰 |
| `--color-primary-400` | `#ff9970` | hover 图标色 |
| `--color-primary-500` | `#ff6b35` | **主品牌色**、按钮、选中态、焦点环 |
| `--color-primary-600` | `#e55a2b` | 按钮 hover、渐变深色端 |
| `--color-primary-700` | `#cc4a1f` | 活跃文字色、链接 hover |
| `--color-primary-800` | `#b23a13` | 深色强调 |
| `--color-primary-900` | `#992a07` | 最深品牌色 |

### 1.2 中性色

| Token | Hex | 用途 |
|---|---|---|
| `--color-neutral-50` | `#f8f9fa` | 页面背景、卡片 hover 背景 |
| `--color-neutral-100` | `#f1f3f4` | 骨架屏、分隔线替代 |
| `--color-neutral-200` | `#e9ecef` | 边框、分隔线、输入框边框 |
| `--color-neutral-300` | `#dee2e6` | 次要边框 |
| `--color-neutral-400` | `#ced4da` | 导航图标默认色标签 |
| `--color-neutral-500` | `#adb5bd` | 次要文字、占位符 |
| `--color-neutral-600` | `#6c757d` | 正文次要文字、导航项未选中 |
| `--color-neutral-700` | `#495057` | 正文主体文字 |
| `--color-neutral-800` | `#343a40` | 标题次级 |
| `--color-neutral-900` | `#212529` | **主文字色**、标题 |

### 1.3 功能色

| Token | Hex | 浅色背景 | 用途 |
|---|---|---|---|
| `--color-success` | `#28a745` | `--color-success-light: #f0fdf4` | 成功状态、趋势上升 |
| `--color-warning` | `#ffc107` | `--color-warning-light: #fffbeb` | 警告状态 |
| `--color-error` | `#dc3545` | `--color-error-light: #fef2f2` | 错误状态、趋势下降 |
| `--color-info` | `#17a2b8` | `--color-info-light: #eff6ff` | 信息提示 |

### 1.4 分类颜色

| 分类 | Token | Hex | Sidebar 图标 |
|---|---|---|---|
| 立法前沿 | `--color-legislation` | `#3498db` | `ScrollText` |
| 监管动向 | `--color-regulation` | `#9b59b6` | `Building2` |
| 执法案例 | `--color-enforcement` | `#e74c3c` | `Scale` |
| 业界资讯 | `--color-industry` | `#f39c12` | `Briefcase` |
| 合规前沿 | `--color-compliance` | `#27ae60` | `ShieldCheck` |
| 数据安全 | `--color-data` | `#1abc9c` | `BarChart3` |
| 网络安全 | `--color-security` | `#e91e63` | `Shield` |
| 学术研究 | `--color-academic` | `#795548` | `GraduationCap` |
| 行业活动 | `--color-events` | `#ff5722` | `Flame` |
| 国际合规 | `--color-international` | `#2196f3` | `Globe2` |

### 1.5 图表色

| Token | Hex | 序号 |
|---|---|---|
| `--color-chart-1` | `#ff6b35` | 主系列 |
| `--color-chart-2` | `#17a2b8` | 第二系列 |
| `--color-chart-3` | `#28a745` | 第三系列 |
| `--color-chart-4` | `#ffc107` | 第四系列 |
| `--color-chart-5` | `#dc3545` | 第五系列 |

### 1.6 语义色

| Token | 亮色模式 | 暗色模式 |
|---|---|---|
| `--color-background` | `#f8f9fa` | `hsl(0 0% 10%)` |
| `--color-foreground` | `#212529` | `hsl(0 0% 98%)` |
| `--color-card` | `#ffffff` | `hsl(0 0% 15%)` |
| `--color-card-foreground` | `#212529` | `hsl(0 0% 98%)` |
| `--color-muted` | `#f1f3f4` | `hsl(0 0% 20%)` |
| `--color-muted-foreground` | `#6c757d` | `hsl(0 0% 65%)` |
| `--color-border` | `#e9ecef` | `hsl(0 0% 25%)` |
| `--color-input` | `#e9ecef` | `hsl(0 0% 20%)` |
| `--color-ring` | `#ff6b35` | `#ff6b35` |

### 1.7 Dashboard 暗色背景

| Token | Hex | 用途 |
|---|---|---|
| `--dash-bg` | `#0B1120` | 地图/可视化卡片主背景 |
| `--dash-bg-2` | `#111827` | 可视化卡片渐变终点 |

---

## 2. 圆角 (Border Radius)

| Token | 值 | Tailwind 类 | 用途 |
|---|---|---|---|
| `--radius-sm` | `0.5rem` (8px) | `rounded-lg` | 小型按钮、操作按钮 |
| `--radius-md` | `0.625rem` (10px) | `rounded-[0.625rem]` | 输入框、blockquote |
| `--radius-lg` | `0.75rem` (12px) | `rounded-xl` | 分类徽章、中等组件 |
| `--radius-xl` | `1rem` (16px) | `rounded-2xl` | 卡片、导航项、信息卡 |

**约定**: 项目统一使用 `rounded-xl`（12px）作为导航项和按钮圆角，`rounded-2xl`（16px）作为卡片圆角。

---

## 3. 阴影 (Shadows)

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 活跃态导航项 |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.08)` | 卡片默认 |
| `--shadow-card-hover` | `0 4px 16px rgba(0,0,0,0.12)` | 卡片 hover |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | 弹窗 |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.1)` | 模态框 |
| `--shadow-brand` | `0 4px 12px rgba(255,107,53,0.15)` | 品牌元素（Logo） |
| `--shadow-brand-lg` | `0 8px 24px rgba(255,107,53,0.2)` | 品牌强调 |

### 质感阴影

| Token | 亮色模式 | 暗色模式 |
|---|---|---|
| `--glass-shadow` | `0 8px 32px rgba(0,0,0,0.08)` | 同 |

---

## 4. 字体 (Typography)

### 4.1 字体栈

| Token | 值 |
|---|---|
| `--font-sans` | `"Inter", "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| `--font-mono` | `"Fira Code", "Monaco", "Menlo", "Courier New", monospace` |
| `--font-serif` | `"Noto Serif SC", "Source Han Serif SC", Georgia, "Times New Roman", serif` |

### 4.2 排版约定

| 用途 | 字号 | 字重 | 行高 |
|---|---|---|---|
| 页面标题 | 20px | 700 | 1.2 |
| 卡片标题 | 15-16px | 600-700 | 1.4-1.55 |
| 正文 | 14px | 400-500 | 1.6 |
| 标签/导航 | 13-14px | 500 | - |
| 辅助文字 | 12px | 500-600 | - |
| 分类标签 | 11px | 600-700 | - |
| 导航分组标签 | 11px | 500 | - |

### 4.3 阅读器排版

| Token | 值 |
|---|---|
| `--reading-width-narrow` | `480px` |
| `--reading-width-normal` | `640px` |
| `--reading-width-wide` | `800px` |
| `--reading-line-height` | `1.8` |
| `--reading-paragraph-spacing` | `1.5em` |

---

## 5. 质感系统 (Glassmorphism & Paper)

### 5.1 毛玻璃效果

| Token | 亮色模式 | 暗色模式 |
|---|---|---|
| `--glass-bg` | `rgba(255,255,255,0.85)` | `rgba(26,26,26,0.85)` |
| `--glass-blur` | `blur(12px)` | `blur(12px)` |
| `--glass-border` | `1px solid rgba(255,255,255,0.2)` | `1px solid rgba(255,255,255,0.1)` |

### 5.2 质感边框

| Token | 亮色模式 | 暗色模式 |
|---|---|---|
| `--border-subtle` | `1px solid rgba(0,0,0,0.06)` | `1px solid rgba(255,255,255,0.06)` |
| `--border-emphasis` | `1px solid rgba(0,0,0,0.12)` | `1px solid rgba(255,255,255,0.12)` |
| `--border-interactive` | `1px solid rgba(255,107,53,0.3)` | - |

### 5.3 纸张感背景

| Token | 亮色 | 暗色 |
|---|---|---|
| `--bg-paper` | `#fafaf9` | `#1a1a1a` |
| `--bg-paper-warm` | `#f9f7f4` | `#1c1a18` |
| `--bg-canvas` | `#fcfcfb` | `#141414` |

---

## 6. 组件样式规范

### 6.1 卡片 (Card)

```
基础: bg-white border border-neutral-200 rounded-2xl p-6
阴影: shadow-card（默认），shadow-card-hover（hover）
hover: transform translateY(-4px) + shadow-card-hover
Tailwind: "bg-white border border-neutral-200 rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
```

### 6.2 按钮 (Button)

```
主要按钮:
  bg-gradient-to-r from-primary-500 to-primary-600 text-white
  rounded-xl px-4 py-2.5 text-sm font-medium
  hover: from-primary-600 to-primary-700
  active: scale(0.98)

次要按钮:
  bg-white border border-neutral-200 text-neutral-700
  rounded-xl px-4 py-2.5 text-sm font-medium
  hover: border-primary-200 bg-primary-50 text-primary-700

幽灵按钮:
  bg-transparent text-neutral-600
  rounded-xl px-3 py-2 text-sm
  hover: bg-neutral-50 text-neutral-900
```

### 6.3 徽章 / Pill (Badge)

```
分类徽章:
  inline-flex items-center gap-1
  px-2.5 py-0.5 rounded-full text-xs font-semibold
  背景: 分类颜色 12% 透明度
  文字: 分类颜色
  代码: getCategoryBadgeStyle(color) → { color, backgroundColor: rgba(..., 0.12) }

风险等级:
  low:  bg-[#e8f5e9] text-[#2e7d32]
  mid:  bg-[#fff8e1] text-[#f57f17]
  high: bg-[#ffebee] text-[#c62828]
  critical: bg-[#f3e5f5] text-[#7b1fa2]

状态徽章:
  published: bg-[#e8f5e9] text-[#2e7d32]
  pending: bg-[#fff8e1] text-[#f57f17]
  processing: bg-[#e3f2fd] text-[#1565c0]
  archived: bg-neutral-100 text-neutral-600
```

### 6.4 输入框 (Input)

```
基础: border border-neutral-200 rounded-xl px-4 py-2.5 text-sm
      bg-white text-neutral-900
focus: border-primary-500 ring-2 ring-primary-500/20

搜索框（特殊）:
  bg-neutral-50 rounded-full px-4 py-2 border-1.5 border-transparent
  focus: border-primary-500 bg-white shadow-[0_0_0_3px_rgba(255,107,53,0.08)]
```

### 6.5 导航项 (Nav Link)

```
默认:
  flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium
  text-neutral-600
  图标: text-neutral-400

hover:
  text-neutral-900
  图标: text-primary-400

active:
  text-primary-700
  图标: text-primary-500
  背景: 绝对定位伪元素 bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl shadow-sm
```

### 6.6 Filter Pill

```
默认:
  px-3.5 py-1.5 rounded-full text-xs font-semibold
  border border-neutral-200 bg-white text-neutral-600
hover: border-neutral-400
active: bg-primary-500 text-white border-primary-500
```

### 6.7 Stat Card

```
bg-white border border-neutral-200 rounded-2xl p-4 md:p-5
hover: border-primary-200/50 shadow-sm

数值: text-2xl md:text-3xl font-extrabold text-neutral-900
标签: text-xs font-semibold text-neutral-500 uppercase tracking-wider
趋势: text-xs font-semibold
  上升: text-success
  下降: text-error
  持平: text-neutral-500
```

---

## 7. 动画系统 (Motion System)

### 7.1 基础过渡 (`lib/motion.ts`)

| 名称 | 时长 | 缓动 | 用途 |
|---|---|---|---|
| `fast` | 150ms | `[0, 0, 0.2, 1]` (ease-out) | 快速反馈、退出动画 |
| `default` | 200ms | `[0.4, 0, 0.2, 1]` (ease-default) | 默认过渡 |
| `enter` | 300ms | `[0, 0, 0.2, 1]` (ease-out) | 进入动画 |
| `slow` | 500ms | `[0.4, 0, 0.2, 1]` | 慢速过渡 |
| `spring` | spring | damping: 25, stiffness: 200 | 侧边栏/抽屉 |
| `springLight` | spring | damping: 20, stiffness: 300 | 按钮/图标 |

### 7.2 Framer Motion Variants

| Variant | hidden → visible | 用途 |
|---|---|---|
| `pageVariants` | opacity 0→1, y 8→0 | 页面过渡 |
| `fadeVariants` | opacity 0→1 | 淡入淡出 |
| `slideUpVariants` | opacity 0→1, y 20→0 | 列表项进入 |
| `slideDownVariants` | opacity 0→1, y -20→0 | 下拉内容 |
| `slideLeftVariants` | opacity 0→1, x 20→0 | 从右滑入 |
| `slideRightVariants` | opacity 0→1, x -20→0 | 从左滑入 |
| `scaleVariants` | opacity 0→1, scale 0.95→1 | 缩放进入 |
| `popVariants` | opacity 0→1, scale 0.8→1 (spring) | 弹出元素 |
| `sidebarVariants` | x -280→0 (spring) | 侧边栏 |
| `staggerContainerVariants` | staggerChildren: 0.05s, delay: 0.1s | 列表容器 |
| `staggerItemVariants` | opacity 0→1, y 20→0 | 列表子项 |
| `toastVariants` | opacity 0→1, y 20→0, scale 0.95→1 (spring) | Toast 通知 |
| `overlayVariants` | opacity 0→1 | 遮罩层 |

### 7.3 交互效果

| 效果 | 参数 | 用途 |
|---|---|---|
| `cardHoverEffect` | y: -4 | `whileHover` 卡片悬浮 |
| `buttonHoverEffect` | scale: 1.02 | `whileHover` 按钮 |
| `buttonTapEffect` | scale: 0.98 | `whileTap` 按钮 |
| `iconBounceVariants` | scale: [1, 1.2, 1] over 300ms | 图标弹跳 |
| `rotateVariants` | rotate: 360 over 1s, infinite | 加载旋转 |

### 7.4 CSS 动画

| 类名 | 动画 | 时长 |
|---|---|---|
| `animate-fade-in` | `fadeIn` opacity 0→1 | 500ms ease-out |
| `animate-slide-up` | `slideUp` opacity+translateY | 500ms ease-out |
| `animate-scale-in` | `scaleIn` opacity+scale | 300ms ease-out |
| `animate-bounce-in` | `bounceIn` 弹性进入 | 600ms ease-out |
| `animate-pulse-primary` | `pulsePrimary` 品牌色脉冲 | 2s infinite |
| `animate-spin` | `spin` 旋转 | 1s linear infinite |
| `animate-shimmer` | `shimmer` 骨架屏闪烁 | 1.5s ease-in-out infinite |

### 7.5 交错动画

```css
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.1s; }
.stagger-3 { animation-delay: 0.15s; }
.stagger-4 { animation-delay: 0.2s; }
.stagger-5 { animation-delay: 0.25s; }
```

### 7.6 `prefers-reduced-motion` 支持

已在 `globals.css:515-524` 实现：
- 所有 `animation-duration` 强制为 `0.01ms`
- 所有 `transition-duration` 强制为 `0.01ms`
- `scroll-behavior` 强制为 `auto`

Framer Motion 层通过 `useReducedMotion()` hook 处理（`sidebar.tsx:355`）：
- `reducedMotion === true` 时 `initial` 设为 `false`
- 过渡 `duration` 设为 `0`

---

## 8. 图标库

### 8.1 使用 Lucide React（强制）

```typescript
import { IconName } from "lucide-react";
```

**禁止使用 Phosphor Icons**。原型 (`prototype/app.html`) 中使用 Phosphor Icons 仅为演示目的，实际应用必须使用 Lucide React。

### 8.2 图标映射表

| 组件/场景 | Lucide 图标 |
|---|---|
| 品牌 Logo | `Eye` |
| Dashboard | `LayoutDashboard` |
| My Feed | `Newspaper` |
| 文章 | `FileText` |
| 信息源 | `Rss` |
| 报告 | `ClipboardList` |
| 分析 | `TrendingUp` |
| 知识图谱 | `Share2` |
| 数据 | `Database` |
| 反馈 | `MessageSquarePlus` |
| 设置 | `Settings` |
| 关闭 | `X` |
| 展开/收起 | `ChevronRight` |
| 立法前沿 | `ScrollText` |
| 监管动向 | `Building2` |
| 执法案例 | `Scale` |
| 业界资讯 | `Briefcase` |
| 合规前沿 | `ShieldCheck` |
| 数据安全 | `BarChart3` |
| 网络安全 | `Shield` |
| 学术研究 | `GraduationCap` |
| 行业活动 | `Flame` |
| 国际合规 | `Globe2` |
| 默认分类 | `FileText` |
| 置顶 | `Pin` |
| 超级管理员 | `ShieldCheck` |
| 租户管理员 | `Shield` |
| 高级用户 | `Star` |
| 认证用户 | `ShieldCheck` |
| 基础用户 | `Bell` |

### 8.3 图标尺寸约定

| 场景 | 类名 |
|---|---|
| 导航图标 | `h-5 w-5` |
| 分类图标 | `h-3.5 w-3.5` |
| 操作按钮 | `h-4 w-4` |
| 统计图标 | `h-5 w-5` |
| 品牌 Logo | `h-5 w-5` |

---

## 9. 层级系统 (Z-Index)

| Token | 值 | 用途 |
|---|---|---|
| `--z-base` | 0 | 默认 |
| `--z-dropdown` | 10 | 下拉菜单 |
| `--z-sticky` | 20 | 粘性元素 |
| `--z-fixed` | 30 | 固定元素（桌面侧边栏） |
| `--z-overlay` | 40 | 遮罩层（移动端背景） |
| `--z-modal` | 50 | 模态框（移动端抽屉） |
| `--z-popover` | 60 | 弹出层 |
| `--z-tooltip` | 70 | 工具提示 |
| `--z-toast` | 80 | Toast 通知 |

---

## 10. 暗色模式

### 10.1 切换机制

通过 `.dark` CSS 类切换，应用于 `<html>` 元素。

### 10.2 组件适配要求

- 使用语义色 token（`--color-background`, `--color-foreground` 等）而非硬编码颜色
- 质感效果（glassmorphism、border-subtle）已在暗色模式下自动调整
- Dashboard 可视化区域始终使用暗色背景 (`--dash-bg`)，不受主题切换影响

---

## 11. 阅读器主题

| 主题 | 背景色 | 文字色 |
|---|---|---|
| `reader-light` | `#ffffff` | `#212529` |
| `reader-dark` | `#1a1a1a` | `#e9ecef` |
| `reader-sepia` | `#f4ecd8` | `#5c4b37` |

---

## 12. 合规检查清单

开发时必须确认：

- [ ] 颜色是否使用 CSS 变量或 Tailwind 的 `primary-*` / `neutral-*` 类
- [ ] 圆角是否符合 sm/md/lg/xl 规范
- [ ] 阴影是否使用 `shadow-card` / `shadow-card-hover` 等 token
- [ ] 图标是否来自 Lucide React（不是 Phosphor、Heroicons 或其他）
- [ ] 动画是否使用 `motion.ts` 中的 variants / transitions
- [ ] 是否支持 `prefers-reduced-motion`
- [ ] 暗色模式是否通过语义色 token 自动适配
- [ ] 字体是否使用 `--font-sans` / `--font-mono` / `--font-serif`
- [ ] 排版间距是否与现有组件一致
