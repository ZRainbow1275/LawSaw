# 命题三：统计功能实现 — 总体规划

> **项目**: LawSaw (Law Eye) — LegalMind 法律生态系统资讯平台
> **命题**: 实现统计功能：地域性统计、行业性统计、重要性统计
> **版本**: v2.0 (批判性审查后重写)
> **日期**: 2026-02-12

---

## 一、现状诊断 (Critical Audit)

### 1.1 已完成且可用的统计功能

| 功能 | DB | 数据填充 | API | 前端 | 状态 |
|------|:--:|:-------:|:---:|:----:|:----:|
| 文章总量统计 | articles | 自然增长 | `/articles/stats` | Dashboard + Analytics | **完整** |
| 状态分布 (5态) | articles.status | 业务流 | `/articles/analytics-summary` | Analytics 页面 CSS 条形图 | **完整** |
| 风险分布 (5级) | articles.risk_score | AI评估 | `/articles/analytics-summary` | Analytics 页面 CSS 条形图 | **完整** |
| 情感分布 (5类) | articles.sentiment | AI评估 | `/articles/analytics-summary` | Analytics 页面 CSS 条形图 | **完整** |
| 每日趋势 (N天) | articles.created_at | 自然增长 | `/articles/trends?days=N` | Analytics 页面 CSS 柱状图 | **完整** |
| 分类统计 (10类) | articles.category_id | AI分类 | `/articles/category-counts` | Analytics 页面网格 | **完整** |
| 数据源统计 | sources | 自然运行 | `/sources/stats` | Dashboard + Analytics | **完整** |
| 知识图谱统计 | entities/relations | AI提取 | `/knowledge/stats` | Knowledge 页面 | **完整** |

### 1.2 存在但为空壳的字段 (Root Cause Analysis)

| 字段 | DB列 | AI类型定义 | 数据填充 | API聚合 | 前端展示 | 根因 |
|------|:----:|:--------:|:-------:|:------:|:-------:|------|
| `importance` (1-5) | 001_initial | `ImportanceScore` in types.rs | **无** | **无** | **无** | AI Service 的 `ArticleAiResult` 不包含 importance；无计算逻辑 |
| `domain_root` | 030_crawler | 无类型约束 | **无** | **无** | **无** | 爬虫 pipeline 中无 domain_root 赋值逻辑 |
| `domain_sub` | 030_crawler | 无类型约束 | **无** | **无** | **无** | 同上 |
| `authority_level` (1-10) | 030_crawler | 无类型约束 | **无** | **无** | **无** | 无任何代码填充 |
| `region_code` | 030_crawler | 爬虫可提取 | **部分** | **无** | **无** | 爬虫 MetadataExtractionStage 可提取但无聚合端点 |

### 1.3 前一轮AI的产出评价

前一轮 `03-statistics-analytics/` 目录为**完全空**，未产出任何规划文档或代码变更。统计功能仍停留在初始状态。

### 1.4 recharts 安装但未使用

`recharts@^2.15.0` 已在 `package.json` 中声明，但所有图表均为纯 CSS `div + width%` 实现，视觉效果和交互性不足。

---

## 二、目标定义

### 2.1 核心交付物

**三大统计维度** — 每个维度都必须实现 **数据填充 → API聚合 → 前端可视化** 的完整链路：

1. **地域性统计 (Regional Analytics)**
   - 按中国 34 省级行政区 (GB/T 2260) 聚合文章分布
   - 中国地图热力可视化
   - 省份排名、趋势变化

2. **行业性统计 (Industry/Domain Analytics)**
   - 按 8 大法律领域 (legislation/regulation/enforcement/industry/compliance/technology/academic/international) 聚合
   - 二级领域 (domain_sub) 下钻
   - 领域间对比、趋势

3. **重要性统计 (Importance Analytics)**
   - 5 级重要性评分分布 (1-5)
   - 按权威等级 (authority_level 1-10) 聚合
   - 重要性与风险、领域的交叉分析

### 2.2 附加交付物 (企业级增强)

4. **交叉维度分析** — 地域×行业、行业×风险、重要性×权威等级
5. **时序趋势分析** — 按维度分组的每日/每周/每月趋势
6. **发布机构统计** — 按 issuer (发布机关) 聚合
7. **recharts 图表升级** — 将全部 CSS 手动图表替换为交互式 recharts 组件
8. **ECharts 中国地图** — 使用 echarts-for-react 实现省份级地图热力图

---

## 三、技术架构

### 3.1 分层架构

```
┌─────────────────────────────────────────────────────┐
│  Layer 5: Frontend Visualization                     │
│  ├── recharts (条形图/饼图/折线图/雷达图)            │
│  ├── echarts-for-react (中国地图热力图)              │
│  └── 自定义组件 (统计卡片/表格/下钻)                │
├─────────────────────────────────────────────────────┤
│  Layer 4: API Endpoints (law-eye-api)               │
│  ├── GET /api/v1/statistics/regional                 │
│  ├── GET /api/v1/statistics/industry                 │
│  ├── GET /api/v1/statistics/importance                │
│  ├── GET /api/v1/statistics/authority                 │
│  ├── GET /api/v1/statistics/issuer                   │
│  ├── GET /api/v1/statistics/cross-dimensional        │
│  └── GET /api/v1/statistics/timeline                 │
├─────────────────────────────────────────────────────┤
│  Layer 3: Core Services (law-eye-core)              │
│  ├── StatisticsService (new)                         │
│  │   ├── regional_distribution()                     │
│  │   ├── industry_distribution()                     │
│  │   ├── importance_distribution()                   │
│  │   ├── authority_distribution()                    │
│  │   ├── issuer_distribution()                       │
│  │   ├── cross_dimensional()                         │
│  │   └── timeline_by_dimension()                     │
│  └── ArticleService (enhanced)                       │
│      └── backfill_computed_fields()                  │
├─────────────────────────────────────────────────────┤
│  Layer 2: AI Processing (law-eye-ai)                │
│  ├── ImportanceAssessor (new)                        │
│  ├── DomainClassifier (new)                          │
│  └── AuthorityDetector (new)                         │
├─────────────────────────────────────────────────────┤
│  Layer 1: Database (law-eye-db)                     │
│  ├── articles 表字段 (已存在，待填充)                │
│  ├── 条件索引 (已存在)                               │
│  └── 物化视图 (新增，用于高频统计查询)               │
└─────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
新文章入库 → AI Pipeline 处理
  ├── 分类 (ClassifyResult → category_id)        [已有]
  ├── 风险评估 (RiskAssessment → risk_score)      [已有]
  ├── 情感分析 (sentiment)                        [已有]
  ├── 实体提取 (entities)                         [已有]
  ├── 重要性评估 (ImportanceScore → importance)   [新增]
  ├── 领域分类 (→ domain_root, domain_sub)        [新增]
  └── 权威等级 (→ authority_level)                [新增]

爬虫阶段已有:
  ├── region_code 提取 (MetadataExtractionStage)  [已有，但需增强]
  ├── issuer 提取                                 [已有]
  └── effective_date 提取                         [已有]
```

---

## 四、任务分解 (Work Breakdown)

### Phase 1: 数据基础层 — AI 评估器 + 数据回填

| 任务 | 负责层 | 优先级 | 依赖 |
|------|--------|--------|------|
| T1.1 实现 ImportanceAssessor | law-eye-ai | P0 | 无 |
| T1.2 实现 DomainClassifier | law-eye-ai | P0 | 无 |
| T1.3 实现 AuthorityDetector | law-eye-ai | P0 | 无 |
| T1.4 修改 AI Service Pipeline 集成新评估器 | law-eye-ai/service.rs | P0 | T1.1-T1.3 |
| T1.5 增强 region_code 提取覆盖率 | law-eye-crawler | P1 | 无 |
| T1.6 历史数据回填脚本/命令 | law-eye-worker | P1 | T1.4 |

### Phase 2: 统计服务层 — Core Service + API

| 任务 | 负责层 | 优先级 | 依赖 |
|------|--------|--------|------|
| T2.1 创建 StatisticsService (数据模型 + 查询) | law-eye-core | P0 | Phase 1 |
| T2.2 创建 statistics API 路由模块 | law-eye-api | P0 | T2.1 |
| T2.3 注册到 OpenAPI spec | law-eye-api | P1 | T2.2 |
| T2.4 物化视图 + 刷新策略 (可选优化) | law-eye-db | P2 | T2.1 |

### Phase 3: 前端可视化层

| 任务 | 负责层 | 优先级 | 依赖 |
|------|--------|--------|------|
| T3.1 安装 echarts-for-react | apps/web | P0 | 无 |
| T3.2 创建 statistics hooks | apps/web/hooks | P0 | T2.2 |
| T3.3 创建中国地图热力图组件 | apps/web/components | P0 | T3.1 |
| T3.4 创建行业分布图表组件 | apps/web/components | P0 | T3.1 |
| T3.5 创建重要性分布图表组件 | apps/web/components | P0 | T3.1 |
| T3.6 升级 Analytics 页面为 tab 布局 | apps/web/app/analytics | P0 | T3.2-T3.5 |
| T3.7 将现有 CSS 图表迁移到 recharts | apps/web/app/analytics | P1 | T3.6 |
| T3.8 交叉维度分析面板 | apps/web/components | P1 | T3.6 |

### Phase 4: 回归测试 + 文档

| 任务 | 负责层 | 优先级 | 依赖 |
|------|--------|--------|------|
| T4.1 后端编译验证 (cargo check) | 全局 | P0 | Phase 1-2 |
| T4.2 前端编译验证 (tsc + lint) | 全局 | P0 | Phase 3 |
| T4.3 API 端点手动测试 | 全局 | P0 | T4.1 |
| T4.4 更新 spec 文档 | .trellis/spec | P1 | Phase 3 |
| T4.5 更新 AGENTS.md | 根目录 | P1 | Phase 3 |

---

## 五、关键设计决策

### 5.1 重要性评分算法

采用 **规则预评估 + LLM 精评** 双层架构（参考现有 `RiskAssessor` 模式）：

```
importance = weighted_sum(
  authority_level_factor,    // 法律层级越高越重要
  issuer_factor,             // 发布机关级别
  affected_scope_factor,     // 影响范围
  novelty_factor,            // 时效性/新颖性
  enforcement_factor         // 强制力
)
```

importance 1-5 映射:
- 5: 国家级重大立法/监管变化
- 4: 部委级重要政策
- 3: 行业性规范/标准
- 2: 地方性法规/案例
- 1: 一般性资讯/学术

### 5.2 领域分类体系 (domain_root)

使用 8 大领域与现有 10 分类的映射关系:

| domain_root | 对应 category slug | 说明 |
|------------|-------------------|------|
| legislation | legislation | 立法前沿 |
| regulation | regulation | 监管动向 |
| enforcement | enforcement | 执法案例 |
| industry | industry | 业界资讯 |
| compliance | compliance | 合规前沿 |
| technology | data, security | 数据/安全合并为技术 |
| academic | academic | 学术文章 |
| international | international | 国际视野 |

domain_sub 为二级分类，由 AI 根据内容细分。

### 5.3 地图可视化方案

选择 **echarts-for-react** 而非纯 recharts：
- recharts 不原生支持 choropleth 地图
- ECharts 内置中国 GeoJSON + 省份级热力图
- echarts-for-react 是成熟的 React wrapper
- 与 recharts 可共存于同一项目

### 5.4 统计查询优化策略

- **实时聚合** — 数据量小时 (<100k 文章) 直接 `GROUP BY` + `COUNT(*) FILTER`
- **物化视图** — 数据量大时创建按日/周/月预聚合的物化视图
- **缓存层** — API 级别的短时缓存 (Redis/内存，TTL 5min)
- **条件索引** — 已有 `idx_articles_region`, `idx_articles_domain`, `idx_articles_authority`

---

## 六、验收标准

### 6.1 功能验收

- [ ] `GET /api/v1/statistics/regional` 返回 34 省级行政区的文章数聚合
- [ ] `GET /api/v1/statistics/industry` 返回 8 大领域 + 二级领域的文章数聚合
- [ ] `GET /api/v1/statistics/importance` 返回 1-5 级重要性分布
- [ ] `GET /api/v1/statistics/authority` 返回 1-10 级权威等级分布
- [ ] `GET /api/v1/statistics/issuer` 返回 TOP N 发布机构排名
- [ ] `GET /api/v1/statistics/cross-dimensional` 支持任意两维度交叉查询
- [ ] `GET /api/v1/statistics/timeline` 支持按维度分组的时间序列
- [ ] 前端中国地图热力图可正确渲染省份分布
- [ ] 前端行业分布饼图/条形图可正确渲染
- [ ] 前端重要性分布图表可正确渲染
- [ ] AI Pipeline 对新文章自动填充 importance/domain_root/authority_level
- [ ] 历史数据回填命令可执行

### 6.2 质量验收

- [ ] `cargo check` 零错误
- [ ] `cargo clippy` 零警告 (或预期忽略)
- [ ] TypeScript `tsc --noEmit` 零错误
- [ ] ESLint 零错误
- [ ] 所有 API 端点注册到 OpenAPI
- [ ] 所有新类型有完整的 Serialize/Deserialize
- [ ] 所有查询带 tenant_id 和 deleted_at IS NULL 过滤
- [ ] spec 文档已更新

---

## 七、参考资料

- [Darrow: Legal Tech Trends 2025](https://www.darrow.ai/resources/legal-tech-trends)
- [LawPay: Legal Technology Trends 2026](https://www.lawpay.com/about/blog/legal-technology-trends/)
- [Rsult: ERP for Legal Firms](https://rsult.one/erp-per-industry/erp-for-legal-firms-revolutionizing-law-firm-management/)
- [ECharts China Map](https://echarts.apache.org/examples/en/index.html#chart-type-map)
- [Recharts Official](https://recharts.org/)
