# 02 - 差距分析：现有能力 vs 企业级需求

> 审计日期: 2026-02-10
> 对标标准: 大型公司商用 10 年以上法律资讯采集系统

---

## 1. 差距总览矩阵

| 能力维度 | 现有实现 | 企业级需求 | 差距等级 | 修复优先级 |
|----------|----------|-----------|----------|-----------|
| 静态HTML爬取 | ✅ CSS Selector | 多策略解析 | 🟡 中 | P1 |
| 动态页面渲染 | ❌ 无 | Headless Browser | 🔴 严重 | P0 |
| RSS/Atom订阅 | ✅ feed-rs | 条件请求+自动发现 | 🟡 中 | P2 |
| 编码处理 | ❌ 假设UTF-8 | 自动检测(GBK/GB2312/UTF-8) | 🔴 严重 | P0 |
| 反爬对抗 | ❌ 无 | 代理池+指纹伪装+频率控制 | 🔴 严重 | P1 |
| 分页爬取 | ❌ 无 | 自动分页/无限滚动 | 🔴 严重 | P1 |
| 增量爬取 | ❌ 无 | ETag/Last-Modified/内容哈希 | 🟡 中 | P1 |
| robots.txt | ❌ 无 | 完整遵守 | 🟡 中 | P1 |
| 数据清洗管线 | ⚠️ 仅HTML标签清除 | 多阶段清洗+AI增强 | 🔴 严重 | P0 |
| 内容去重 | ⚠️ 仅链接去重 | 标题+内容相似度去重 | 🟡 中 | P1 |
| 法律元数据提取 | ❌ 无 | 机构/层级/区划/生效日期 | 🔴 严重 | P0 |
| AI结构化提取 | ❌ 无 | LLM分类+摘要+风险评估 | 🔴 严重 | P0 |
| 并发爬取 | ❌ 串行 | 并发控制+连接池 | 🟡 中 | P1 |
| 调度系统 | ⚠️ 基础cron | 优先级调度+失败重试队列 | 🟡 中 | P2 |
| 监控告警 | ❌ 仅日志 | Prometheus指标+告警规则 | 🟡 中 | P2 |
| 数据源适配器 | ❌ 通用爬虫 | 专用适配器(20+法律源) | 🔴 严重 | P0 |
| 错误恢复 | ⚠️ 基础重试 | 断点续传+死信队列 | 🟡 中 | P2 |
| 数据模型 | ⚠️ 基础字段 | 法律领域宽表 | 🔴 严重 | P0 |
| 爬取历史 | ❌ 无 | 完整爬取日志+统计 | 🟡 中 | P2 |
| 测试覆盖 | ⚠️ Spider单元测试 | 全链路E2E+集成测试 | 🟡 中 | P2 |

---

## 2. 关键差距详细分析

### 2.1 🔴 P0 — 动态页面渲染（差距最大）

**现状**：`spider.rs` 使用 `reqwest` 做 HTTP GET + `scraper` 解析静态 HTML。

**问题**：中国政府网站（如国家法律法规数据库 flk.npc.gov.cn、裁判文书网 wenshu.court.gov.cn）
大量使用 JavaScript 渲染内容。静态 HTML 爬取获取到的是空壳页面。

**企业级需求**：
- Headless Browser（Chromium）渲染 JS 页面
- 支持 Playwright/Puppeteer 远程控制
- 等待特定 DOM 元素加载完成
- 处理 AJAX 延迟加载的数据
- 截图存档（法律取证用途）

**解决方案**：
- 集成 `chromiumoxide` (Rust Chromium DevTools Protocol) 或 `thirtyfour` (WebDriver)
- 备选：通过 HTTP API 调用独立部署的 Browserless/Nstbrowser 服务
- 在 `SpiderConfig` 中新增 `render_mode: 'static' | 'dynamic'` 字段

### 2.2 🔴 P0 — 编码处理

**现状**：`reqwest` 默认 `.text()` 按 UTF-8 解码。

**问题**：
- 中国政府网站常用 GBK / GB2312 / GB18030 编码
- `response.text()` 遇到非 UTF-8 编码会出现乱码或解码错误
- 部分网站 HTTP Header 中的 charset 声明与实际编码不一致

**企业级需求**：
- HTTP Content-Type charset 检测
- HTML meta charset 检测
- 字节流编码嗅探（chardet 算法）
- 编码转换为 UTF-8

**解决方案**：
- 使用 `encoding_rs` crate 进行编码检测和转换
- 在 `fetch_html_with_retry` 中用 `response.bytes()` 替代 `response.text()`
- 实现三级编码检测：HTTP Header → HTML meta → 字节嗅探

### 2.3 🔴 P0 — 数据清洗管线不足

**现状**：`Pipeline` 框架设计良好（trait-based），但仅有 `CleaningStage`。

**企业级需求的 Pipeline 阶段**：

```
RawArticle
  → EncodingFixStage        // 编码修复
  → HtmlCleaningStage       // HTML标签清除（已有，需增强）
  → DeduplicationStage      // 标题+内容相似度去重
  → ContentQualityStage     // 内容质量评估（过滤广告/垃圾）
  → LegalMetadataStage      // 法律元数据提取（AI辅助）
  → CategorizationStage     // 八大领域分类（AI辅助）
  → StructuredSummaryStage  // 结构化摘要生成（AI辅助）
  → RiskScoringStage        // 风险评分（AI辅助）
  → ValidationStage         // 最终校验
  → EnrichedArticle
```

### 2.4 🔴 P0 — 法律元数据提取

**现状**：文章表仅有 title/link/content/author/published_at 基础字段。

**企业级需求（对应宏观架构蓝图中的 `law_eye_archives` 宽表）**：

| 字段 | 说明 | 提取方式 |
|------|------|----------|
| `domain_root` | 八大领域（立法/监管/执法/行业/合规/技术/学术/国际） | AI分类 |
| `domain_sub` | 二级分类（法律/行政法规/部门规章...） | AI分类 |
| `authority_level` | 法律层级(1-6) | AI + 规则引擎 |
| `issuer` | 发布机构 | 正则提取 + AI |
| `effective_date` | 生效日期 | 正则提取 |
| `region_code` | 行政区划码 | 规则引擎 |
| `tags` | 标签数组 | AI提取 |
| `risk_score` | 风险评分(1-10) | AI评估 |
| `summary_struct` | 结构化摘要 JSON | AI生成 |
| `uuid_ref` | 法律文书引用号 | 正则提取 |

### 2.5 🔴 P0 — 数据源适配器

**现状**：通用的 `WebSpider`，通过 CSS Selector 配置解析不同网站。

**问题**：中国法律信息源结构差异巨大，通用 CSS Selector 无法覆盖所有场景。

**企业级需求**：针对每类数据源建立专用适配器。

**需要适配的核心数据源**（详见 `05-data-source-registry.md`）：

| 类别 | 数据源 | 复杂度 |
|------|--------|--------|
| 立法 | 国家法律法规数据库 (flk.npc.gov.cn) | 🔴 高（JS渲染） |
| 立法 | 中国人大网 (npc.gov.cn) | 🟡 中 |
| 监管 | 中国证监会 (csrc.gov.cn) | 🟡 中 |
| 监管 | 中国银保监会 (cbirc.gov.cn) | 🟡 中 |
| 监管 | 国家网信办 (cac.gov.cn) | 🟡 中 |
| 执法 | 最高人民法院 (court.gov.cn) | 🔴 高（反爬强） |
| 行业 | 36氪 (36kr.com) | 🟢 低（有RSS） |
| 行业 | 虎嗅 (huxiu.com) | 🟢 低（有RSS） |
| 技术 | CNVD国家信息安全漏洞共享平台 | 🟡 中 |
| 国际 | EUR-Lex (eur-lex.europa.eu) | 🟢 低（有API） |

---

## 3. 对标分析：市面上优秀的法律信息系统

### 3.1 北大法宝 (pkulaw.com)
- 全量法律法规数据库
- 多维检索（按法律层级、发布机关、时效性）
- 法律关系图谱
- 启示：数据分类维度设计

### 3.2 威科先行 (wkinfo.com.cn)
- 企业合规智能监控
- 行业定制化内容推送
- 启示：行业分类和推送策略

### 3.3 天眼查/企查查法律模块
- 企业涉诉信息采集
- 风险评估和预警
- 启示：风险评分机制

### 3.4 Scrapy (Python框架) 的设计模式参考
- Spider → 适配器模式
- Pipeline → 多阶段处理链
- Scheduler → 优先级队列+去重
- Downloader Middleware → 代理/重试/限速
- 启示：中间件/管道/调度器三层架构

---

## 4. 差距修复路线

| 批次 | 内容 | 依赖 |
|------|------|------|
| **Batch 0** | 编码处理 + 数据模型升级（迁移） | 无 |
| **Batch 1** | Pipeline 增强（去重/清洗/质量评估） | Batch 0 |
| **Batch 2** | 动态页面渲染集成 | Batch 0 |
| **Batch 3** | 数据源适配器（前10个核心源） | Batch 0-2 |
| **Batch 4** | AI 增强（分类/摘要/风险评分/元数据提取） | Batch 0-1 |
| **Batch 5** | 反爬对抗（代理池/指纹伪装） | Batch 2 |
| **Batch 6** | 增量爬取 + 并发控制 | Batch 3 |
| **Batch 7** | 监控告警 + 爬取历史 | Batch 1-6 |
| **Batch 8** | 数据源适配器（后10个扩展源） | Batch 3 |
| **Batch 9** | 全链路 E2E 测试 + 性能测试 | All |
