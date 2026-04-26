# SPEC-05 — 内容分类分级体系

**状态**: Draft v1.0  
**版本**: 1.0.0 / 2026-04-25  
**依赖**: `SPEC-01-REBAC-AUTHZ.md`, `crates/law-eye-db/migrations/{050..063}_*.sql`, 现有 `categories` / `channels` 表

---

## 1. 分类（Category）模型

### 1.1 三级层级

```
Category (一级，固定 13 个)
  └─ Subcategory (二级，每分类 3-7 个)
       └─ Tag (三级，自由打标，多对多)
```

**一级**：业务核心，固定不可随便增（除超级管理员加 migration）。  
**二级**：管理员可在 `/admin/categories` 增删改，按一级归属。  
**Tag**：来自 AI 抽取 + 用户自由打标的并集，无固定列表。

### 1.2 法律资讯 13 个一级分类

| code | 中文名 | 英文名 | 图标 (lucide) | 颜色 (var) | 描述 |
|---|---|---|---|---|---|
| `legislation` | 立法动态 | Legislation | `ScrollText` | `--color-regulation` | 全国 / 地方人大、国务院新颁立法 |
| `regulation` | 监管动态 | Regulation | `Building2` | `--color-info` | 部委规章、监管文件、行业指引 |
| `enforcement` | 执法案例 | Enforcement | `Scale` | `--color-warning` | 行政处罚、合规检查、执法案例 |
| `judicial` | 司法案例 | Judicial | `Gavel` | `--color-purple-500` | 最高法 / 各级法院判例、指导性案例 |
| `industry` | 行业合规 | Industry | `Briefcase` | `--color-cyan-500` | 行业专项合规、行业自律 |
| `compliance` | 合规风控 | Compliance | `ShieldCheck` | `--color-emerald-500` | 企业合规、风控、内控 |
| `data` | 数据合规 | Data | `BarChart3` | `--color-blue-500` | 数据保护、个保法、跨境传输 |
| `security` | 网络安全 | Security | `Shield` | `--color-rose-500` | 网络安全法、关基保护、漏洞管理 |
| `antitrust` | 反垄断 | Antitrust | `Lock` | `--color-orange-500` | 反垄断、反不正当竞争、经营者集中 |
| `ip` | 知识产权 | IP | `Lightbulb` | `--color-yellow-500` | 专利、商标、版权、商业秘密 |
| `labor` | 劳动用工 | Labor | `Users` | `--color-teal-500` | 劳动法、用工合规、社保 |
| `finance` | 金融监管 | Finance | `Banknote` | `--color-green-500` | 金融、证券、保险、支付监管 |
| `international` | 国际动态 | International | `Globe2` | `--color-indigo-500` | 跨境合规、国际制裁、国际条约 |

### 1.3 二级子分类示例（部分，admin 可扩）

```
立法动态
  ├─ 全国人大
  ├─ 国务院
  ├─ 地方人大
  └─ 法律修订征求意见

监管动态
  ├─ 网信办
  ├─ 国家市场监督管理总局
  ├─ 银保监会 / 证监会
  ├─ 工信部
  ├─ 公安部
  └─ 海关总署

数据合规
  ├─ 个人信息保护
  ├─ 数据出境
  ├─ 数据分类分级
  ├─ 算法治理
  └─ 重要数据识别

司法案例
  ├─ 最高人民法院
  ├─ 高级人民法院
  ├─ 互联网法院
  └─ 知识产权法院
```

完整列表见 `seed_categories.sql`（见 §4）。

---

## 2. 频道（Channel）模型

频道与分类**正交**：分类是文章主题维度，频道是订阅源 + 受众组合。

### 2.1 字段（已存在表，含 RLS）

```sql
channels (
    id UUID PK,
    tenant_id UUID,
    slug TEXT UNIQUE,
    name TEXT,
    description TEXT,
    visibility TEXT,         -- 'public' | 'restricted' | 'verified' | 'premium'
    category_codes TEXT[],   -- 关联的一级分类 codes
    icon_key TEXT,           -- lucide icon name
    color_key TEXT,          -- color CSS var name
    is_active BOOLEAN,
    created_by UUID,
    created_at TIMESTAMPTZ
)

channel_access_policies (
    channel_id UUID,
    subject_type TEXT,
    subject_key TEXT,
    can_read BOOLEAN,
    can_read_source_meta BOOLEAN,
    can_access_reports BOOLEAN,
    priority INTEGER
)

channel_sources (
    channel_id UUID,
    source_id UUID,
    PRIMARY KEY (channel_id, source_id)
)
```

### 2.2 visibility 策略

| visibility | 谁可见 | 文章可见性 | 来源 metadata |
|---|---|---|---|
| `public` | basic+ | 完整 | basic 仅名称；verified+ 含 url |
| `restricted` | 命中 channel_access_policies | 完整 | 按 policy |
| `verified` | verified_user+ | 完整 | 完整 |
| `premium` | premium_user+ | 完整 + AI 深度分析 | 完整 + reliability score |

### 2.3 默认频道（每 tenant seed）

```
public-headlines       (visibility=public,    categories=ALL)
legislation-feed       (visibility=verified,  categories=[legislation])
regulation-feed        (visibility=verified,  categories=[regulation])
data-compliance        (visibility=premium,   categories=[data, security])
financial-radar        (visibility=premium,   categories=[finance, antitrust])
international-watch    (visibility=verified,  categories=[international])
```

---

## 3. 标签（Tag）模型

```sql
tags (
    id UUID PK,
    tenant_id UUID,
    slug TEXT,
    name TEXT,
    source TEXT,             -- 'ai-extracted' | 'editor' | 'user'
    extra JSONB DEFAULT '{}' NOT NULL,
    usage_count BIGINT DEFAULT 0,
    UNIQUE (tenant_id, slug)
)

article_tags (
    article_id UUID,
    tag_id UUID,
    confidence FLOAT,         -- AI 抽取的置信度（手动打的 = 1.0）
    PRIMARY KEY (article_id, tag_id)
)
```

### 3.1 来源

- **`ai-extracted`**：知识图谱抽取流水线（详见 SPEC-03）顺带产生的 tag
- **`editor`**：admin 在 `/admin/articles/{id}` 手动打的
- **`user`**：用户在收藏 / 笔记时打的（私有）

### 3.2 治理

- 周期性 dedup：bge-m3 embedding 余弦相似度 > 0.92 → 提示 admin 合并
- TopN（usage_count desc）展示在 `/articles?tag=` 筛选

---

## 4. 文章 ↔ 分类 多对多

### 4.1 表

```sql
article_categories (
    article_id UUID,
    category_code TEXT,        -- 一级
    subcategory_id UUID,       -- 二级（nullable）
    is_primary BOOLEAN,        -- 仅一条 primary
    confidence FLOAT,
    source TEXT,               -- 'ai' | 'editor' | 'rule'
    created_at TIMESTAMPTZ,
    PRIMARY KEY (article_id, category_code, subcategory_id)
)
```

### 4.2 写入规则

- 每篇文章必有 ≥ 1 条 `is_primary=true`
- AI 自动分类（rule + Qwen3-8B）写入后，admin 可在 `/admin/articles/{id}` 确认 / 调整
- 二级 nullable（可仅打一级）

### 4.3 索引

```sql
CREATE INDEX idx_article_categories_code ON article_categories(category_code);
CREATE INDEX idx_article_categories_primary ON article_categories(article_id) WHERE is_primary;
```

---

## 5. Migration `064_taxonomy_v2.sql`

### 5.1 新增表

```sql
-- 二级子分类
CREATE TABLE IF NOT EXISTS subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    parent_code TEXT NOT NULL,            -- references categories.code
    code TEXT NOT NULL,
    name_zh TEXT NOT NULL,
    name_en TEXT NOT NULL,
    icon_key TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, parent_code, code)
);

-- 文章-分类映射
CREATE TABLE IF NOT EXISTS article_categories (
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    category_code TEXT NOT NULL,
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    confidence DOUBLE PRECISION DEFAULT 1.0,
    source TEXT NOT NULL CHECK (source IN ('ai','editor','rule')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (article_id, category_code, subcategory_id)
);

-- 标签
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('ai-extracted','editor','user')),
    extra JSONB DEFAULT '{}'::jsonb NOT NULL,
    usage_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS article_tags (
    article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    confidence DOUBLE PRECISION DEFAULT 1.0,
    PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX idx_article_categories_code ON article_categories(category_code);
CREATE INDEX idx_article_categories_primary ON article_categories(article_id) WHERE is_primary;
CREATE INDEX idx_article_tags_tag ON article_tags(tag_id);
CREATE INDEX idx_subcategories_parent ON subcategories(parent_code, tenant_id);
CREATE INDEX idx_tags_tenant_usage ON tags(tenant_id, usage_count DESC);
```

### 5.2 RLS

```sql
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_subcat ON subcategories
    USING (tenant_id::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.cross_tenant', true) = 'true');

CREATE POLICY tenant_isolation_articat ON article_categories
    USING (article_id IN (SELECT id FROM articles));    -- inherit via articles RLS

CREATE POLICY tenant_isolation_tags ON tags
    USING (tenant_id::text = current_setting('app.current_tenant_id', true)
        OR current_setting('app.cross_tenant', true) = 'true');

CREATE POLICY tenant_isolation_artag ON article_tags
    USING (article_id IN (SELECT id FROM articles));
```

### 5.3 Seed 一级分类（idempotent UPSERT）

```sql
INSERT INTO categories (id, tenant_id, code, slug, name, color, icon, description, sort_order)
SELECT
    gen_random_uuid(),
    t.id,
    code,
    code,
    name,
    color,
    icon,
    description,
    sort_order
FROM (VALUES
    ('legislation', '立法动态', '#7c3aed', 'ScrollText', '全国/地方人大、国务院新颁立法', 1),
    ('regulation', '监管动态', '#3b82f6', 'Building2', '部委规章、监管文件、行业指引', 2),
    ('enforcement', '执法案例', '#f59e0b', 'Scale', '行政处罚、合规检查、执法案例', 3),
    ('judicial', '司法案例', '#a855f7', 'Gavel', '最高法/各级法院判例', 4),
    ('industry', '行业合规', '#06b6d4', 'Briefcase', '行业专项合规、行业自律', 5),
    ('compliance', '合规风控', '#10b981', 'ShieldCheck', '企业合规、风控、内控', 6),
    ('data', '数据合规', '#3b82f6', 'BarChart3', '数据保护、个保法、跨境传输', 7),
    ('security', '网络安全', '#f43f5e', 'Shield', '网络安全法、关基保护、漏洞管理', 8),
    ('antitrust', '反垄断', '#f97316', 'Lock', '反垄断、反不正当竞争、经营者集中', 9),
    ('ip', '知识产权', '#eab308', 'Lightbulb', '专利、商标、版权、商业秘密', 10),
    ('labor', '劳动用工', '#14b8a6', 'Users', '劳动法、用工合规、社保', 11),
    ('finance', '金融监管', '#22c55e', 'Banknote', '金融、证券、保险、支付监管', 12),
    ('international', '国际动态', '#6366f1', 'Globe2', '跨境合规、国际制裁、国际条约', 13)
) AS x(code, name, color, icon, description, sort_order)
CROSS JOIN tenants t
ON CONFLICT (tenant_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    color = EXCLUDED.color,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;
```

> 注意：当前 `categories` 表 schema 是已有 migration 定义，可能字段不完全匹配。具体 migration 实施时需先 `READ` 现有 `categories` 表 DDL，再做 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 兼容性追加。

---

## 6. AI 自动分类 / 打标签

### 6.1 流程

```
新文章入库（articles.status='ingested'）
  └─ outbox 队列 article.classify
      └─ Worker: law-eye-worker
          ├─ 规则匹配（关键词 / 来源 → category）
          ├─ Qwen3-8B 兜底（rule miss）
          └─ 写 article_categories (source='rule' 或 'ai')

  └─ outbox 队列 article.tag
      └─ Worker
          ├─ Qwen3-8B 抽取实体（详见 SPEC-03）
          ├─ entities → tags (slug, name, source='ai-extracted')
          └─ 写 article_tags
```

### 6.2 关键词规则示例

```yaml
# crates/law-eye-classifier/rules.yaml
rules:
  - category: legislation
    if_any:
      - keyword: ["《xx法》通过", "全国人大常委会"]
      - source_id_in: ["src-npc", "src-stand-cmt"]
  - category: data
    if_any:
      - keyword: ["个人信息保护", "PIPL", "数据出境", "重要数据"]
  - category: finance
    if_any:
      - keyword: ["证监会", "银保监会", "中国人民银行", "央行"]
  # ...
```

### 6.3 Admin 审核 UI

`/admin/articles/{id}/categorize` 显示：当前分类 + 子分类 + 标签 + AI 置信度。可手动覆盖。覆盖记录写入 `audit_logs`。

---

## 7. 用户端筛选

### 7.1 URL pattern

```
/articles?category=data&subcategory=cross-border&tag=pipl&channel=data-compliance
```

支持任意组合（多 tag 用逗号）。

### 7.2 Sidebar 分类菜单

`UserSidebar` 下半部分显示当前 tenant 的全部一级分类（按 sort_order）。点击 → `/category/{code}`。

### 7.3 Filter pill bar

`ArticlesPage` 顶部显示分类切换 pill：

```
[全部] [立法动态] [监管动态] [执法案例] [司法案例] [行业合规] ...
```

横向滚动，选中项高亮，配合该分类的 color + icon。

---

## 8. 验收

- [ ] §1.2 13 个一级分类 seed 落库（每 tenant）
- [ ] §2.3 6 个默认 channel 落库
- [ ] §5 migration 应用，含 RLS + 索引
- [ ] §6 文章入库后自动分类 + 打 tag（≥ 1 条记录）
- [ ] §7.1 URL 三级筛选可用
- [ ] §7.2 Sidebar 显示 13 个分类（含图标 + 颜色）
- [ ] `/articles?category=xxx` 渲染正确，分页 / 排序保留
- [ ] Admin 可在 `/admin/categories` 编辑二级 + 在 `/admin/articles/{id}` 调整文章分类
