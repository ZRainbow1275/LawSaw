# 🏛️ 法眼 (Law Eye) 宏观架构蓝图

## I. 战略三部曲：演进路线 (Evolution Path)

我们不追求一步登天，而是追求每一步都稳健且可用。

| 阶段        | 代号                               | 核心目标         | 产品形态              | 关键技术特征                              | 商业/应用价值                            |
| :---------- | :--------------------------------- | :--------------- | :-------------------- | :---------------------------------------- | :--------------------------------------- |
| **Phase 1** | **The Curator**<br>(资讯整理者)    | **美学与自动化** | HTML 每日简报         | RSS聚合 + 单体AI + 基础数据库             | 建立品牌，通过“瑞典秩序”美学获取种子用户 |
| **Phase 2** | **The Analyst**<br>(情报分析师)    | **结构与可视化** | 深度周报 + 统计图表   | 爬虫/清洗 + **流水线多Agent** + 宽表数仓  | 为律所/法务提供“合规趋势”与“立法动态”    |
| **Phase 3** | **The Platform**<br>(数字决策中台) | **检索与交互**   | SaaS 仪表盘 + RAG对话 | 向量数据库 + **路由式多Agent** + 前端交互 | 成为法律从业者的“外脑”与生产力工具       |

---

## II. 系统架构全景图 (System Architecture)

这是最终形态（Phase 3）的完整逻辑，Phase 1 和 2 是这个图的子集。

```mermaid
graph TB
    %% --- 数据源层 (Ingestion) ---
    subgraph "Layer 1: 感知触角 (Ingestion)"
        S1[RSS Feeds] 
        S2[Gov API/Browserless爬虫]
        S3[微信公众号/PDF解析]
        S4[Social Media (Twitter/X)]
    end

    %% --- 调度与清洗层 (Orchestration) ---
    subgraph "Layer 2: 中枢神经 (n8n Orchestration)"
        ETL[ETL 清洗与去重]
        Router{Agent 路由分发}
    end

    %% --- 智能体层 (The Virtual Firm) ---
    subgraph "Layer 3: 虚拟律所 (Multi-Agent System)"
        A1(初级书记员 Agent<br>分类/清洗)
        A2(立法专家 Agent<br>层级/法理分析)
        A3(行业分析师 Agent<br>影响/趋势)
        A4(技术情报官 Agent<br>CVE/漏洞/暗网)
        A5(合伙人审核 Agent<br>评分/质检)
    end

    %% --- 记忆层 (Memory & Knowledge) ---
    subgraph "Layer 4: 核心记忆 (Supabase)"
        DB1[(结构化宽表<br>Metadata)]
        DB2[(向量数据库<br>Embeddings)]
        DB3[(用户/订阅表<br>SaaS Auth)]
    end

    %% --- 表现层 (Presentation) ---
    subgraph "Layer 5: 交付界面 (Delivery)"
        Out1[HTML 邮件渲染引擎]
        Out2[统计图表生成 (QuickChart)]
        Out3[SaaS Web Dashboard (Next.js)]
        Out4[RAG Chatbot API]
    end

    %% 连线关系
    S1 & S2 & S3 & S4 --> ETL
    ETL -->|查重/入库| DB1
    ETL --> Router
    Router -->|立法类| A2
    Router -->|行业类| A3
    Router -->|技术类| A4
    A1 & A2 & A3 & A4 --> A5
    A5 -->|最终数据| DB1 & DB2
    
    DB1 -->|每日/周任务| Out1 & Out2
    DB1 & DB2 & DB3 -->|API调用| Out3 & Out4
```

---

## III. 数据库成长史 (Database Schema Evolution)

数据库是项目的地基。我们使用 **Supabase (PostgreSQL)**，它能完美支持从 V1 到 V3 的平滑升级。

### Phase 1: 基础缓存表 (`articles_v1`)
*目的：仅用于去重和生成日报。*

```sql
CREATE TABLE articles_v1 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  link TEXT UNIQUE NOT NULL, -- 核心去重字段
  pub_date TIMESTAMP,
  source_name TEXT, -- 如 "36Kr"
  summary TEXT, -- 简单的AI摘要
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 2: 情报宽表 (`law_eye_archives`)
*目的：支撑“八大领域”分类、统计图表、结构化输出。*

```sql
CREATE TABLE law_eye_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- [核心索引]
  uuid_ref TEXT, -- 引用号，如 "(2025)最高法..."
  link TEXT UNIQUE NOT NULL,
  
  -- [多维分类 - 对应你的导图]
  domain_root TEXT NOT NULL, -- 枚举: 立法, 监管, 执法, 行业, 合规, 技术, 学术, 国际
  domain_sub TEXT, -- 二级分类: 法律, 行政法规, 部门规章...
  
  -- [法律属性]
  authority_level INT, -- 1-6 (宪法到标准)
  issuer TEXT, -- 发布机构: 网信办, 工信部
  effective_date DATE, -- 生效日期 (做合规日历用)
  region_code TEXT, -- 行政区划码: 310000 (上海)
  
  -- [内容本体]
  title TEXT,
  summary_struct JSONB, -- { "fact": "...", "core": "...", "impact": "..." }
  tags TEXT[], -- ["金融", "反垄断"]
  
  -- [量化指标]
  risk_score INT, -- 1-10
  
  -- [系统状态]
  status TEXT DEFAULT 'pending', -- pending -> processed -> published
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 3: 向量知识库 (`law_eye_vectors`)
*目的：支撑 RAG（检索增强生成），让用户能提问。*

```sql
-- 启用 pgvector 插件
CREATE EXTENSION vector;

CREATE TABLE article_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID REFERENCES law_eye_archives(id),
  chunk_content TEXT, -- 文章切片
  embedding VECTOR(1536) -- 向量数据 (OpenAI Ada-002 或其他模型)
);
```

---

## IV. 虚拟律所：Multi-Agent 实现路径

在 n8n 中，我们不写复杂的 Python Class，而是用 **Sub-workflow (子工作流)** 封装每个 Agent。

### 1. 书记员 Agent (The Clerk)
*   **Prompt**: "你是一个严谨的数据录入员。你的任务是阅读原文，判断它是否属于法律/合规/科技范畴。如果是垃圾广告或无关内容，标记为 Reject。提取发布时间和来源。"
*   **技术实现**: n8n AI Agent 节点 (Model: GPT-4o-mini / Qwen-Turbo)。

### 2. 八大领域专家 (The Specialists)
这里使用 **Router 模式**。在 n8n 中使用 `Switch` 节点，根据书记员的初步判断分流。

*   **立法专家 Agent**:
    *   **Prompt**: "专注于法律层级分析。提取 `authority_level` (1-6)，判断 `effective_date`。如果文中提到上位法，请指出。"
*   **技术情报官 Agent**:
    *   **Prompt**: "专注于数据安全技术。提取 CVE 编号、APT 组织名称、受影响的系统版本。翻译英文技术术语。"

### 3. 合伙人 Agent (The Partner / Reviewer)
*   **Prompt**: "你是一丝不苟的合规总监。审查下属提交的 JSON 数据。
    1. 评分 (1-10)：基于对企业合规的实际影响。
    2. 校验：'部门规章'是否被错误标记为了'法律'？
    3. 决策：如果不合格，输出修正后的 JSON。"
*   **技术实现**: n8n AI Agent 节点 (Model: GPT-4o / Claude-3.5-Sonnet)。**这是质量的防火墙。**

---

## V. 技术栈清单 (Tech Stack)

| 组件               | 推荐技术                     | 理由                                                        |
| :----------------- | :--------------------------- | :---------------------------------------------------------- |
| **工作流引擎**     | **n8n** (Self-hosted)        | 强大的可视化编排，完美支持 LangChain，适合复杂逻辑。        |
| **数据库**         | **Supabase**                 | 基于 PostgreSQL，自带 Vector 扩展，自带 API，开发极其便利。 |
| **大模型 (LLM)**   | **OpenRouter API**           | 一个接口调用所有模型 (GPT-4o, Claude 3.5, Qwen, DeepSeek)。 |
| **浏览器自动化**   | **Browserless / Nstbrowser** | 解决政府网站无 RSS、有反爬虫的问题。                        |
| **图表生成**       | **QuickChart.io**            | 通过 URL 生成静态图表图片，完美嵌入邮件。                   |
| **前端 (Phase 3)** | **Next.js + Vercel**         | 部署 SaaS 面板，通过 API 读取 Supabase 数据。               |
| **渲染引擎**       | **Handlebars / MJML**        | n8n 内置，生成响应式、兼容性好的 HTML 邮件。                |

---

## VI. 实施行动指南 (Action Plan)

### 第一步：奠基 (本周)
1.  **部署 Supabase**: 创建项目，执行 `articles_v1` 建表 SQL。
2.  **改造 n8n**:
    *   将目前的 RSS 流程改为：`RSS -> Check DB (去重) -> AI Summary -> Insert DB -> Send Email`。
    *   **关键点**：先别管多 Agent，先把数据存进去，把日报发出来。
    *   **美学**：应用之前的“瑞典秩序”HTML 模板。

### 第二步：升维 (下个月)
1.  **数据库升级**: 执行 `law_eye_archives` 建表 SQL。
2.  **引入 Multi-Agent**:
    *   拆分 n8n 流程。主流程只管调度，建立子流程 `Sub_Agent_Legislative`, `Sub_Agent_Tech` 等。
    *   引入 "合伙人 Reviewer" 节点，提升数据质量。
3.  **图表集成**:
    *   在周五的 Cron Job 中，增加 SQL 查询 (`SELECT region, count(*) ...`) -> QuickChart -> 生成图片 -> 插入周报 HTML。

### 第三步：平台化 (半年后)
1.  **历史数据向量化**: 写一个脚本，把 Supabase 里积累的半年数据全部生成 Vector 存入。
2.  **开发 Dashboard**: 用 Next.js 写一个简单的网页，展示你的统计图表和合规日历。
3.  **开放 API**: 允许企业用户订阅你的数据接口。

