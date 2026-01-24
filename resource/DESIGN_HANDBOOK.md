# 🎨 LegalMind Design Handbook

> **权威设计，智能效率** ("Authority through Design, Efficiency through Intelligence")

本手册定义了 LegalMind-Arbitration 项目的完整 UI/UX 设计规范，确保开发一致性与视觉统一性。

---

## 📋 目录

1. [设计理念](#1-设计理念)
2. [色彩系统](#2-色彩系统)
3. [字体排版](#3-字体排版)
4. [间距与布局](#4-间距与布局)
5. [阴影与层级](#5-阴影与层级)
6. [动效系统](#6-动效系统)
7. [组件规范](#7-组件规范)
8. [图标规范](#8-图标规范)
9. [工作区布局](#9-工作区布局)
10. [暗色模式](#10-暗色模式)
11. [可访问性](#11-可访问性)
12. [开发规范](#12-开发规范)

---

## 1. 设计理念

### 1.1 核心原则

| 原则 | 描述 |
|------|------|
| **专业权威** | 界面需传达法律行业的专业性与可信度 |
| **现代高效** | 对标 Linear、Raycast、Figma 等顶级 SaaS 产品 |
| **智能直觉** | 交互符合直觉，减少学习成本 |
| **一致统一** | 所有元素遵循统一设计语言 |

### 1.2 设计语言

- **风格定位**: Premium SaaS，非传统政务工具
- **视觉特征**: 干净、通透、现代、专业
- **交互特征**: 流畅、响应、微动效丰富

---

## 2. 色彩系统

### 2.1 品牌主色 (Primary)

LegalMind 标志性橙色系，传达能量与行动力。

| Token | HSL | HEX | 用途 |
|-------|-----|-----|------|
| `primary-50` | `16 100% 97%` | `#FFF4F1` | 超浅背景 |
| `primary-100` | `16 100% 93%` | `#FFE6DC` | 浅背景/Hover态 |
| `primary-200` | `16 100% 85%` | `#FFCCB8` | 边框高亮 |
| `primary-300` | `16 100% 78%` | `#FFB394` | 次要强调 |
| `primary-400` | `16 100% 71%` | `#FF9970` | 中等强调 |
| **`primary-500`** | **`16 100% 60%`** | **`#FF6B35`** | **主要颜色** |
| `primary-600` | `16 85% 53%` | `#E55A2B` | Hover态 |
| `primary-700` | `16 75% 46%` | `#CC4A1F` | Active态 |
| `primary-800` | `16 70% 39%` | `#B23A13` | 深色文字 |
| `primary-900` | `16 85% 32%` | `#992A07` | 极深强调 |

**CSS 变量使用**:
```css
/* 在组件中使用 */
background-color: hsl(var(--color-primary));
color: hsl(var(--color-primary-foreground));
```

### 2.2 中性色 (Neutral)

用于文本、背景、边框等基础元素。

| Token | HEX | 用途 |
|-------|-----|------|
| `neutral-50` | `#F8F9FA` | 页面背景 |
| `neutral-100` | `#F1F3F4` | 卡片背景 |
| `neutral-200` | `#E9ECEF` | 边框色 |
| `neutral-300` | `#DEE2E6` | 分割线 |
| `neutral-400` | `#CED4DA` | 禁用态 |
| `neutral-500` | `#ADB5BD` | 占位文字 |
| `neutral-600` | `#6C757D` | 次要文字 |
| `neutral-700` | `#495057` | 正文文字 |
| `neutral-800` | `#343A40` | 标题文字 |
| `neutral-900` | `#212529` | 主要文字 |

### 2.3 功能色 (Functional)

传达操作状态与反馈信息。

| 类型 | 主色 | 前景色 | 浅色背景 |
|------|------|--------|----------|
| **Success** | `#28A745` | `#FFFFFF` | `#F0FDF4` |
| **Warning** | `#FFC107` | `#1A1A1A` | `#FFFBEB` |
| **Error** | `#DC3545` | `#FFFFFF` | `#FEF2F2` |
| **Info** | `#17A2B8` | `#FFFFFF` | `#EFF6FF` |

### 2.4 节点专用色

工作台中不同节点类型的标识色。

| 节点类型 | 颜色 | HEX |
|----------|------|-----|
| 文书节点 | 蓝色 | `#3498DB` |
| AI助手 | 绿色 | `#27AE60` |
| 庭审节点 | 红色 | `#E74C3C` |
| 时间线 | 紫色 | `#9B59B6` |
| 协作节点 | 橙色 | `#F39C12` |

### 2.5 图表色

数据可视化配色方案。

```css
--color-chart-1: #FF6B35; /* 主橙 */
--color-chart-2: #17A2B8; /* 青色 */
--color-chart-3: #28A745; /* 绿色 */
--color-chart-4: #FFC107; /* 黄色 */
--color-chart-5: #DC3545; /* 红色 */
```

---

## 3. 字体排版

### 3.1 字体栈

```css
font-family: 'Inter', 'PingFang SC', -apple-system, BlinkMacSystemFont, 
             'Segoe UI', Roboto, sans-serif;
```

| 优先级 | 字体 | 用途 |
|--------|------|------|
| 1 | Inter | 西文主字体 |
| 2 | PingFang SC | 中文主字体 |
| 3 | System Fonts | 系统回退 |

**代码字体**:
```css
font-family: 'Fira Code', 'Monaco', 'Menlo', 'Courier New', monospace;
```

### 3.2 字号规范

| Token | 大小 | 行高 | 用途 |
|-------|------|------|------|
| `xs` | 0.75rem (12px) | 1rem | 标签、辅助文字 |
| `sm` | 0.875rem (14px) | 1.25rem | 正文、描述 |
| `base` | 1rem (16px) | 1.5rem | 基础正文 |
| `lg` | 1.125rem (18px) | 1.75rem | 副标题 |
| `xl` | 1.25rem (20px) | 1.75rem | 小标题 |
| `2xl` | 1.5rem (24px) | 2rem | 标题 |
| `3xl` | 1.875rem (30px) | 2.25rem | 大标题 |
| `4xl` | 2.25rem (36px) | 2.5rem | 页面标题 |

### 3.3 字重规范

| 字重 | 数值 | 用途 |
|------|------|------|
| Normal | 400 | 正文 |
| Medium | 500 | 强调文字、导航 |
| Semibold | 600 | 标题、按钮 |
| Bold | 700 | 大标题、品牌强调 |

### 3.4 Typography 类型定义

```tsx
// 项目使用 Tailwind + CSS tokens（见 `lawclick-next/src/app/globals.css` 与 `lawclick-next/src/styles/theme.css`）
<div className="text-xl font-semibold text-foreground">标题</div>
<div className="text-sm text-muted-foreground">正文内容</div>
```

| 样式类型 | 字号 | 字重 | 颜色 |
|----------|------|------|------|
| `title` | 16px | 600 | `#1A202C` |
| `content` | 14px | 400 | `#4A5568` |
| `small` | 12px | 400 | `#718096` |
| `label` | 12px | 500 | `#2D3748` (UPPERCASE) |
| `code` | 13px | 400 | `#2D3748` (monospace) |

---

## 4. 间距与布局

### 4.1 间距系统

基于 4px 网格系统。

| Token | 值 | rem | 用途 |
|-------|-----|-----|------|
| `0` | 0px | 0 | 无间距 |
| `1` | 4px | 0.25rem | 最小间距 |
| `2` | 8px | 0.5rem | 紧凑间距 |
| `3` | 12px | 0.75rem | 小间距 |
| `4` | 16px | 1rem | 标准间距 |
| `5` | 20px | 1.25rem | 中等间距 |
| `6` | 24px | 1.5rem | 较大间距 |
| `8` | 32px | 2rem | 大间距 |
| `10` | 40px | 2.5rem | 区域间距 |
| `12` | 48px | 3rem | 大区域间距 |
| `16` | 64px | 4rem | 页面级间距 |

### 4.2 圆角规范

```css
--radius: 0.75rem; /* 12px - 基础圆角 */
```

| Token | 计算值 | 用途 |
|-------|--------|------|
| `rounded-sm` | 8px | 小元素 (Badge) |
| `rounded-md` | 10px | 输入框 |
| `rounded-lg` | 12px | 卡片、按钮 |
| `rounded-xl` | 16px | 大卡片、面板 |
| `rounded-full` | 9999px | 头像、标签 |

### 4.3 工作区布局规范

```
┌─────────────────────────────────────────────────────────┐
│                    Toolbar (60px)                        │
├──────────┬──────────────────────────────┬───────────────┤
│ Sidebar  │                              │   Inspector   │
│  (280px) │      Canvas (flex: 1)        │    (320px)    │
│          │                              │               │
└──────────┴──────────────────────────────┴───────────────┘
```

| 区域 | 宽度 | 特性 |
|------|------|------|
| Sidebar | 280px | 固定，可折叠 |
| Canvas | 弹性 | 无限画布 |
| Inspector | 320px | 固定，可折叠 |
| Toolbar | 100% × 60px | 固定顶部 |

---

## 5. 阴影与层级

### 5.1 阴影层级

| Token | 值 | 用途 |
|-------|-----|------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 微阴影 |
| `shadow-card` | `0 2px 8px rgba(0,0,0,0.08)` | 卡片 |
| `shadow-card-hover` | `0 4px 16px rgba(0,0,0,0.12)` | 卡片悬停 |
| `shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | 浮层 |
| `shadow-xl` | `0 20px 25px rgba(0,0,0,0.1)` | 模态框 |
| `shadow-brand` | `0 4px 12px rgba(255,107,53,0.15)` | 品牌阴影 |
| `shadow-brand-lg` | `0 8px 24px rgba(255,107,53,0.2)` | 品牌强调阴影 |

### 5.2 Z-Index 层级

| 层级 | 值 | 用途 |
|------|-----|------|
| Base | 0 | 基础内容 |
| Dropdown | 10 | 下拉菜单 |
| Sticky | 20 | 粘性元素 |
| Fixed | 30 | 固定元素 |
| Overlay | 40 | 遮罩层 |
| Modal | 50 | 模态框 |
| Popover | 60 | 气泡 |
| Tooltip | 70 | 提示 |
| Toast | 80 | 通知 |
| Maximum | 9999 | 最高层级 |

---

## 6. 动效系统

### 6.1 过渡时间曲线

```css
/* 标准过渡 */
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

/* 所有元素默认应用 */
* {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
```

| 类型 | 时长 | 曲线 | 用途 |
|------|------|------|------|
| Instant | 0.1s | ease-out | 微交互 |
| Fast | 0.2s | ease-out | 按钮、输入 |
| Normal | 0.3s | ease-in-out | 卡片、面板 |
| Slow | 0.5s | ease-in-out | 页面过渡 |

### 6.2 预设动画

#### 淡入淡出
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
/* 使用: animate-fade-in */
```

#### 滑入
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
/* 使用: animate-slide-up */
```

#### 缩放
```css
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
/* 使用: animate-scale-in */
```

#### 弹入
```css
@keyframes bounceIn {
  0% { opacity: 0; transform: scale(0.3); }
  50% { opacity: 1; transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
/* 使用: animate-bounce-in */
```

#### 品牌脉冲
```css
@keyframes pulsePrimary {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 107, 53, 0.7); }
  70% { box-shadow: 0 0 0 10px rgba(255, 107, 53, 0); }
}
/* 使用: pulse-primary */
```

### 6.3 动画类名速查

| 类名 | 效果 | 时长 |
|------|------|------|
| `animate-fade-in` | 淡入 | 0.5s |
| `animate-slide-up` | 上滑入 | 0.5s |
| `animate-slide-in-up` | 上滑入 | 0.4s |
| `animate-scale-in` | 缩放入 | 0.3s |
| `animate-bounce-in` | 弹入 | 0.6s |
| `animate-pulse-slow` | 慢脉冲 | 3s |
| `loading-spinner` | 旋转 | 1s |
| `pulse-primary` | 品牌脉冲 | 2s |

---

## 7. 组件规范

### 7.1 Button 按钮

使用 CVA (Class Variance Authority) 定义变体。

#### 变体 (Variants)

| Variant | 外观 | 用途 |
|---------|------|------|
| `default` | 橙色渐变背景，白字 | 主要操作 |
| `destructive` | 红色背景，白字 | 危险操作 |
| `outline` | 白色背景，灰边框 | 次要操作 |
| `secondary` | 灰色背景，白字 | 辅助操作 |
| `ghost` | 透明背景 | 内联操作 |
| `link` | 文字链接样式 | 导航链接 |

#### 尺寸 (Sizes)

| Size | 高度 | 内边距 | 用途 |
|------|------|--------|------|
| `sm` | 32px (h-8) | px-3 | 紧凑场景 |
| `default` | 36px (h-9) | px-4 | 标准按钮 |
| `lg` | 48px (h-12) | px-8 | 强调按钮 |
| `icon` | 36px × 36px | - | 图标按钮 |

#### 交互效果

```css
/* 悬停态 */
hover:shadow-xl hover:scale-105

/* 激活态 */
active:scale-95

/* 聚焦态 */
focus-visible:ring-2 focus-visible:ring-orange-500/50
```

#### 使用示例

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default" size="lg">确认提交</Button>
<Button variant="outline">取消</Button>
<Button variant="ghost" size="icon"><X /></Button>
```

### 7.2 Card 卡片

使用 Compound Component 模式。

#### 子组件

| 组件 | 用途 | data-slot |
|------|------|-----------|
| `Card` | 容器 | `card` |
| `CardHeader` | 头部区域 | `card-header` |
| `CardTitle` | 标题 | `card-title` |
| `CardDescription` | 描述 | `card-description` |
| `CardAction` | 操作区 | `card-action` |
| `CardContent` | 内容区 | `card-content` |
| `CardFooter` | 底部区域 | `card-footer` |

#### 样式规范

```css
/* 基础卡片 */
.card {
  background: white;
  border: 1px solid #E9ECEF;
  border-radius: 0.75rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* 悬停效果 */
.card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
  border-color: #FFCCB8;
}

/* 顶部渐变条 */
.card:hover::before {
  transform: scaleX(1);
  /* 从 scaleX(0) 过渡 */
}
```

### 7.3 Dialog 对话框

#### 结构

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>标题</DialogTitle>
    </DialogHeader>
    {/* 内容 */}
    <DialogFooter>
      <Button variant="outline">取消</Button>
      <Button>确认</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### 样式规范

- **遮罩层**: `bg-black/50 backdrop-blur-sm`
- **内容容器**: `max-w-lg rounded-lg shadow-lg`
- **动画**: `animate-in zoom-in-95 fade-in`

### 7.4 Input 输入框

```css
.input {
  background-color: #F8F9FA;
  border: 2px solid #E9ECEF;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
}

.input:focus {
  border-color: #FF6B35;
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
  background-color: white;
  transform: scale(1.02);
}

.input:hover:not(:focus) {
  border-color: #FFB394;
}
```

### 7.5 Badge 徽章

| Variant | 样式 |
|---------|------|
| `default` | 主色背景 |
| `secondary` | 次要色背景 |
| `destructive` | 红色背景 |
| `outline` | 边框样式 |

```tsx
<Badge variant="default">进行中</Badge>
<Badge variant="destructive">紧急</Badge>
```

### 7.6 Tabs 标签页

```tsx
<Tabs value={tab} onValueChange={setTab}>
  <TabsList>
    <TabsTrigger value="overview">概览</TabsTrigger>
    <TabsTrigger value="details">详情</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">概览内容</TabsContent>
  <TabsContent value="details">详情内容</TabsContent>
</Tabs>
```

#### 样式规范

- **TabsList**: `bg-gray-100 rounded-md p-1`
- **TabsTrigger 激活态**: `bg-white shadow-sm`
- **TabsTrigger 默认态**: `text-gray-600 hover:text-gray-900`

### 7.7 FloatingPanel 浮动面板

可拖拽、可折叠、可调整大小的面板组件。

#### Props

| Prop | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `title` | string | - | 面板标题 |
| `defaultPosition` | {x, y} | 右上角 | 初始位置 |
| `defaultSize` | {width, height} | 400×600 | 初始尺寸 |
| `minSize` | {width, height} | 300×400 | 最小尺寸 |
| `maxSize` | {width, height} | 800×(vh-100) | 最大尺寸 |
| `draggable` | boolean | true | 可拖拽 |
| `resizable` | boolean | true | 可调整大小 |
| `collapsible` | boolean | true | 可折叠 |
| `storageKey` | string | - | localStorage 键 |

#### 动画

使用 Framer Motion:
```tsx
initial={{ opacity: 0, scale: 0.95, y: 20 }}
animate={{ opacity: 1, scale: 1, y: 0 }}
exit={{ opacity: 0, scale: 0.95, y: 20 }}
```

---

## 8. 图标规范

### 8.1 图标库

使用 **Lucide React** 作为主要图标库。

```tsx
import { X, Plus, Search, Settings } from 'lucide-react';
```

### 8.2 尺寸规范

| 场景 | 尺寸 | 类名 |
|------|------|------|
| 内联文字 | 14px | `w-3.5 h-3.5` |
| 按钮内 | 16px | `w-4 h-4` |
| 标准图标 | 20px | `w-5 h-5` |
| 大图标 | 24px | `w-6 h-6` |
| 特大图标 | 32px | `w-8 h-8` |

### 8.3 颜色规范

- 默认随文字颜色 (`currentColor`)
- 主要操作: `text-primary-500`
- 次要操作: `text-neutral-500`
- 成功: `text-success`
- 警告: `text-warning`
- 错误: `text-error`

---

## 9. 工作区布局

### 9.1 整体结构

```
┌──────────────────────────────────────────────────────────────┐
│                         Toolbar                               │
│  [Logo] [Title] [Case Info]              [Actions] [Avatar]  │
├───────────┬────────────────────────────────┬─────────────────┤
│           │                                │                 │
│   Node    │                                │    Node         │
│  Palette  │         Canvas Area            │   Inspector     │
│           │                                │                 │
│  (可折叠)  │      (无限画布 / 节点图)        │   (属性面板)    │
│           │                                │                 │
└───────────┴────────────────────────────────┴─────────────────┘
```

### 9.2 面板样式

#### 侧边栏 (Sidebar / Palette)

```css
.node-palette {
  width: 280px;
  background: white;
  border-right: 1px solid #e1e8ed;
}

.palette-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e1e8ed;
}

.palette-item {
  border-left: 3px solid; /* 节点类型色 */
  border-radius: 6px;
}

.palette-item:hover {
  background: #f8fafc;
  transform: translateX(2px);
}
```

#### 属性面板 (Inspector)

```css
.node-inspector {
  width: 320px;
  background: white;
  border-left: 1px solid #e1e8ed;
}

.inspector-header {
  background: #f8fafc;
  padding: 16px 20px;
}

.inspector-section h4 {
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 14px;
}
```

### 9.3 节点样式

```css
.legal-node {
  border-radius: 8px;
  background: white;
  border: 2px solid; /* 节点类型色 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-width: 200px;
  max-width: 250px;
}

.legal-node:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.legal-node.selected {
  border-color: #FF6B35 !important;
  box-shadow: 0 4px 20px rgba(255, 107, 53, 0.3);
}
```

### 9.4 状态徽章

```css
.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.pending    { background: #f1f5f9; color: #64748b; }
.status-badge.in-progress { background: #fef3c7; color: #d97706; }
.status-badge.completed   { background: #d1fae5; color: #059669; }
.status-badge.error       { background: #fee2e2; color: #dc2626; }
```

---

## 10. 暗色模式

### 10.1 CSS 变量切换

```css
.dark {
  --color-background: 0 0% 10%;      /* 深灰背景 */
  --color-foreground: 0 0% 98%;      /* 浅色文字 */
  --color-card: 0 0% 15%;
  --color-card-foreground: 0 0% 98%;
  --color-muted: 0 0% 20%;
  --color-muted-foreground: 0 0% 65%;
  --color-border: 0 0% 25%;
  --color-input: 0 0% 20%;
  --color-accent: 0 0% 20%;
}
```

### 10.2 切换方式

```tsx
// 在 HTML 根元素添加 class
document.documentElement.classList.toggle('dark');
```

### 10.3 Tailwind 配置

```js
// tailwind.config.js
darkMode: 'class',
```

---

## 11. 可访问性

### 11.1 焦点样式

```css
:focus-visible {
  outline: 2px solid #FF6B35;
  outline-offset: 2px;
  border-radius: 0.75rem;
}
```

### 11.2 对比度要求

- **正文文字**: 对比度 ≥ 4.5:1 (WCAG AA)
- **大字标题**: 对比度 ≥ 3:1
- **交互元素**: 确保悬停/聚焦态明显区分

### 11.3 键盘导航

- 所有交互元素可通过 Tab 键访问
- 模态框激活时锁定焦点
- 提供完整键盘快捷键支持

### 11.4 选区样式

```css
::selection {
  background-color: #FF6B35;
  color: #FFFFFF;
}
```

---

## 12. 开发规范

### 12.1 文件结构

```
src/
├── styles/
│   ├── theme.css        # CSS 变量定义
│   ├── animations.css   # 动画关键帧
│   ├── components.css   # 组件基础样式
│   ├── utilities.css    # 工具类
├── components/
│   ├── ui/              # shadcn/ui 基础组件
│   └── common/          # 通用业务组件
└── index.css            # 入口样式
```

### 12.2 CSS 导入顺序

```css
/* src/app/globals.css */
@import "tailwindcss";
@import "../styles/theme.css";
@import "../styles/animations.css";
@import "../styles/components.css";
@import "../styles/utilities.css";
```

### 12.3 组件开发规范

#### 使用 `cn()` 合并类名

```tsx
import { cn } from '@/lib/utils';

<div className={cn(
  "base-styles",
  isActive && "active-styles",
  className
)} />
```

#### 使用 CVA 定义变体

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva("base-styles", {
  variants: {
    variant: {
      default: "...",
      outline: "...",
    },
    size: {
      sm: "...",
      default: "...",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});
```

#### 使用 data-slot 标记

```tsx
<div data-slot="card">
  <div data-slot="card-header">...</div>
</div>
```

### 12.4 动画使用规范

- 使用 Framer Motion 处理复杂动画
- 简单过渡使用 CSS transition
- 禁用提示: `prefers-reduced-motion` 媒体查询

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 12.5 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| CSS 变量 | `--color-*`, `--shadow-*` | `--color-primary` |
| Tailwind 类 | kebab-case | `hover-lift` |
| 组件 | PascalCase | `FloatingPanel` |
| 工具函数 | camelCase | `typographyToStyle` |

---

## 附录

### A. 颜色快速参考

```
Primary:    #FF6B35 (橙)
Secondary:  #2C3E50 (深蓝灰)
Success:    #28A745 (绿)
Warning:    #FFC107 (黄)
Error:      #DC3545 (红)
Info:       #17A2B8 (青)
Background: #F8F9FA (浅灰)
Text:       #1A1A1A (深灰)
Border:     #E9ECEF (灰)
```

### B. 常用渐变

```css
/* 主渐变 */
background: linear-gradient(135deg, #FF6B35, #E55A2B);

/* 次要渐变 */
background: linear-gradient(135deg, #FFF4F1, #FFE6DC);

/* 卡片渐变 */
background: linear-gradient(135deg, #FFFFFF, #F8F9FA);

/* 滚动条渐变 */
background: linear-gradient(135deg, #FF6B35, #E55A2B);
```

### C. 阴影快速参考

```css
/* 卡片 */
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

/* 悬停 */
box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);

/* 品牌 */
box-shadow: 0 4px 12px rgba(255, 107, 53, 0.15);

/* 模态框 */
box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1);
```

---

> **Last Updated**: 2026-01-04  
> **Version**: 1.0.0  
> **Maintainer**: LegalMind Design Team
