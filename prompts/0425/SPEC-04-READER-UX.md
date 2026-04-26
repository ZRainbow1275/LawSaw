# SPEC-04 — 阅读管理体验（Markdown 编辑器 + Banner + Pin + 阅读视图）

**状态**: Draft v1.0  
**版本**: 1.0.0 / 2026-04-25  
**依赖**: `research/02-markdown-editor-and-reader-ux.md`, `.trellis/spec/frontend/editor-markdown.md`, 现有 `apps/web/src/components/articles/`, migrations 057 (banners) + 058 (article_pins)

---

## 1. Markdown 编辑器选型（决策）

| 用途 | 选型 | Bundle | 理由 |
|---|---|---|---|
| **管理员内容编辑**（文章 / 报告模板 / 公告） | **Milkdown 7（Crepe preset）** | ~110 KB gz | 源码标记可见 + live preview 双效（最契合用户"原始 markdown 文本呈现为重心，但可以及时渲染"），ProseMirror 内核稳定，React 19 + Next 16 SSR 兼容 |
| **用户反馈**（feedback 短文） | **MDXEditor 3** | ~80 KB gz | 轻量，built-in toolbar，front-matter 支持，无需复杂 plugin |
| **文章阅读器**（用户端只读） | 沿用现有 `<MarkdownReader>`（基于 react-markdown + remark-gfm + rehype-shiki） | ~40 KB gz | 已有，无需替换；增 "查看原文 markdown" 切换 |

详细对比见 research/02 §1-2。

### 1.1 Milkdown 7 必需插件

| 插件 | 用途 |
|---|---|
| `@milkdown/crepe` | 综合 preset，含 slash menu / block handle / table |
| `@milkdown/preset-commonmark` + `-gfm` | Markdown 基础语法 |
| `@milkdown/plugin-shiki` | 代码高亮 |
| `@milkdown/plugin-math` | KaTeX 公式 |
| `@milkdown/plugin-listener` | 监听内容变化 |
| `@milkdown/plugin-clipboard` | 粘贴 markdown 还原 |
| 自定义 mention 插件（~200 LoC） | `@user` `@article` 提示 |
| 自定义 frontmatter 插件 | YAML metadata 编辑 |

### 1.2 SSR 注意事项

```tsx
// apps/web/src/components/editor/markdown-editor.tsx
"use client";

import dynamic from "next/dynamic";

const MilkdownEditor = dynamic(
    () => import("./milkdown-impl").then((m) => m.MilkdownEditor),
    { ssr: false, loading: () => <EditorSkeleton /> }
);

export function MarkdownEditor(props: Props) {
    return <MilkdownEditor {...props} />;
}
```

`milkdown-impl.tsx` 是真实挂载，仅在客户端运行。

---

## 2. 编辑器组件契约

### 2.1 `<MarkdownEditor>`

```typescript
interface MarkdownEditorProps {
  value: string;                      // markdown source
  onChange: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  variant: "full" | "compact";        // full = 系统文章 / 报告；compact = 反馈
  showFrontmatter?: boolean;          // YAML 编辑栏
  uploadHandler?: (file: File) => Promise<string>;  // 返回上传后 URL
  mentions?: {
    users?: () => Promise<UserBrief[]>;
    articles?: () => Promise<ArticleBrief[]>;
  };
  className?: string;
}
```

### 2.2 `<MarkdownReader>`

```typescript
interface MarkdownReaderProps {
  source: string;                      // markdown
  showSourceToggle?: boolean;          // 用户可切到源码视图
  shikiTheme?: "github-light" | "github-dark";
  onAnchorChange?: (id: string) => void;  // 用于 TOC 高亮
}
```

### 2.3 `<ViewModeToggle>`（保留现 spec）

```
[渲染] [源码] [并排]
```

**默认渲染**，但用户偏好通过 cookie + DB 双写持久化。

---

## 3. 阅读视图（Reading Mode）

### 3.1 路由 `/articles/[id]`

布局：

```
┌─────────────────────────────────────┐
│  [← back]   ScrollProgressBar       │
│                                     │
│   ┌──────────┐  ┌──────────────┐   │
│   │   TOC    │  │   Content    │   │
│   │ (sticky) │  │ (max-w-prose)│   │
│   │          │  │              │   │
│   │ • 标题1  │  │ # 文章标题   │   │
│   │ • 标题2  │  │              │   │
│   │ • 标题3  │  │ 正文 ...     │   │
│   │          │  │              │   │
│   └──────────┘  └──────────────┘   │
│                                     │
│   [floating actions右下角]          │
│   ⚙️ ⭐ 📤 🖨️ ⤓                     │  (lucide 图标)
└─────────────────────────────────────┘
```

### 3.2 必备组件（沿用 / 扩展现有）

| 组件 | 文件 | 状态 |
|---|---|---|
| `<ReaderLayout>` | `components/articles/reader-layout.tsx` | 已有 |
| `<TableOfContents>` | `components/articles/table-of-contents.tsx` | 已有 |
| `<ScrollProgressBar>` | `components/layout/scroll-progress-bar.tsx` | 已有 |
| `<ReadingSettings>` | `components/articles/reading-settings.tsx` | 扩展 |
| `<AnnotationToolbar>` | 新增 | 选中文本浮出 |
| `<ArticleActions>` | `components/articles/article-actions.tsx` | 已有 |
| `<RelatedArticles>` | 新增 | 阅读器底部 |
| `<EstimatedReadTime>` | `components/articles/estimated-read-time.tsx` | 已有 |

### 3.3 阅读偏好

```typescript
// apps/web/src/stores/reading-store.ts (已有，扩展)
interface ReadingPrefs {
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  lineHeight: 'compact' | 'normal' | 'relaxed';
  theme: 'light' | 'dark' | 'sepia';
  fontFamily: 'sans' | 'serif';
  measure: 'narrow' | 'normal' | 'wide';     // 行宽
  showSource: boolean;
}
```

持久化：
- 客户端：localStorage
- 服务端：`PUT /api/v1/me/preferences`（user_preferences JSONB 列）

冲突解决：服务端 last-write-wins，客户端打开时 fetch 一次同步。

### 3.4 标注 / 高亮

新增 `annotations` 表（migration 066）：

```sql
CREATE TABLE annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    quote TEXT NOT NULL,                  -- 选中文本
    note TEXT,                            -- 用户备注 (markdown)
    color TEXT DEFAULT 'yellow',          -- yellow|green|blue|pink|purple
    range_start INTEGER NOT NULL,         -- 字符偏移
    range_end INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, article_id, range_start, range_end)
);
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY annotations_user_self ON annotations
    USING (user_id::text = current_setting('app.current_user_id', true));
```

**XSS 防护**：用户输入 note 经 DOMPurify 清洗（已有 dependency）。

### 3.5 估读 + 稍后再读 + PDF 导出

- 估读：字数 / 280 字每分钟
- 稍后再读：写 `bookmarks` 表（如未存在，新增 migration）
- PDF 导出：服务端 `puppeteer` 不引入（重）→ 客户端用 `print-friendly.css` + window.print()，浏览器另存为 PDF。Premium+ 显示 "服务端高质量 PDF" 选项（占位，先 v1 不做）。

---

## 4. Banner（横幅）

### 4.1 数据模型（migration 057 已有，扩展）

```sql
ALTER TABLE banners
    ADD COLUMN IF NOT EXISTS audience_role_tiers TEXT[] DEFAULT '{basic_user,verified_user,premium_user}',
    ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dismissable BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS schedule_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS schedule_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gradient_key TEXT DEFAULT 'primary',  -- key into design tokens
    ADD COLUMN IF NOT EXISTS cta_label TEXT,
    ADD COLUMN IF NOT EXISTS cta_url TEXT,
    ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'banner';        -- banner|toast|modal
```

### 4.2 Admin UI `/admin/banners`

- 列表（排序：priority desc, schedule_start desc）
- 创建：标题 + 内容（Milkdown 编辑器）+ 受众（multi-select role tiers + categories）+ 排期（datetime 范围）+ 渐变选 (key)+ CTA
- 预览面板（受众视角实时预览）

### 4.3 用户端 `<BannerStack>` 

```tsx
// apps/web/src/components/user/banner-stack.tsx
function BannerStack() {
    const { data: banners } = useBanners();   // role-tier 过滤
    const dismissed = useBannerDismissedStore();
    const visible = banners.filter(b =>
        !dismissed.has(b.id) &&
        b.schedule_start <= new Date() &&
        (!b.schedule_end || b.schedule_end >= new Date())
    ).sort((a, b) => b.priority - a.priority);
    return (
        <div className="space-y-3">
            {visible.slice(0, 3).map(b => <BannerCard key={b.id} {...b} />)}
        </div>
    );
}
```

显示位置：`/me/feed` 顶部，`/articles` 顶部。

`max 3 active banners` 同时显示，剩余通过 "查看更多" 折叠。

---

## 5. Pin（置顶，仅 admin）

### 5.1 数据模型（migration 058 已有）

```sql
article_pins (
    id UUID PK,
    tenant_id UUID,
    article_id UUID,
    scope TEXT,            -- 'global' | 'channel'
    channel_id UUID NULL,
    priority INTEGER,      -- 0 = 最高
    pin_window TSTZRANGE,  -- 失效时间
    pinned_by UUID,
    pinned_at TIMESTAMPTZ
)
```

### 5.2 Admin UI `/admin/pins`

- DragDrop 排序（dnd-kit / react-beautiful-dnd）
- 全局 / 按频道 标签切换
- 失效时间选择（立即 / 24h / 7d / 30d / 自定义 / 永久）
- 操作 → audit log

### 5.3 用户端 `<PinnedSection>`

`/me/feed` 与 `/articles` 顶部独立 section（非混在 feed 内）。

```tsx
function PinnedSection({ scope, channelId }: { scope: 'global'|'channel'; channelId?: string }) {
    const { data: pins } = usePins({ scope, channelId });
    if (!pins?.length) return null;
    return (
        <section aria-label="置顶文章" className="mb-6">
            <h2 className="...">
                <Pin className="h-4 w-4" /> 置顶
            </h2>
            <div className="grid grid-cols-2 gap-4">
                {pins.map(p => <PinnedCard key={p.id} {...p} />)}
            </div>
        </section>
    );
}
```

视觉：左侧彩色边条 (`border-l-4`) 作为 pinned 标识。

---

## 6. 文章卡片（FeedCard / ArticleCard）

复用现有 `feed-card.tsx`，扩展：

| 元素 | 显示 |
|---|---|
| 分类徽章 | category color + lucide icon |
| 来源 | basic 仅 name；verified+ 含 url；premium+ 含 reliability score |
| 1 句摘要 | hover 显示 |
| 关键词 tags | TopN 3 个 |
| 估读 | "{x} 分钟" + Clock icon |
| risk 等级 | (premium+ 可见) |
| pinned 标记 | Pin icon + 边条 |
| AI insights flag | Sparkles icon (有/无) |

---

## 7. 路由与 API

| API | 方法 | 描述 |
|---|---|---|
| `/api/v1/me/feed` | GET | 已存在，按 roleTier 过滤 |
| `/api/v1/articles` | GET | 扩展，按 category / channel / tag 过滤 + tier 截断 |
| `/api/v1/articles/{id}` | GET | 扩展，basic 截断 200 字 |
| `/api/v1/articles/{id}/related` | GET | 新增，bge-m3 cosine top 5 |
| `/api/v1/me/annotations` | CRUD | 标注 |
| `/api/v1/me/preferences` | GET/PUT | 阅读偏好 |
| `/api/v1/admin/banners` | CRUD | 横幅 |
| `/api/v1/admin/pins` | CRUD | 置顶 |
| `/api/v1/banners` | GET | 用户端读取（按 tier + 时间）|
| `/api/v1/pins` | GET | 用户端读取 |

---

## 8. 验收

- [ ] Milkdown 7 编辑器在 `/admin/banners/new`、`/admin/reports/templates/{id}`、`/admin/articles/{id}` 可用，源码 + 渲染同时可见
- [ ] MDXEditor 3 在 `/feedback/new` 可用
- [ ] `/articles/{id}` TOC 自动生成 + sticky + 滚动联动高亮
- [ ] 阅读偏好 5 项（字号 / 行高 / 主题 / 字体 / 行宽）持久化生效
- [ ] 选中文本可标注 / 高亮，DB + UI 同步
- [ ] `/me/feed` 顶部显示 ≤ 3 banners，按 roleTier 过滤
- [ ] `/me/feed` 顶部显示 pinned section，admin 可在 `/admin/pins` 编辑
- [ ] PDF 打印 CSS 干净（无 sidebar / topbar / actions）
- [ ] 全程 0 emoji（lucide icons only）
