# 06 - 回归测试计划

> 制定日期: 2026-02-10
> 原则: 每个 Batch 完成后必须通过全部回归测试，方可进入下一个 Batch

---

## 1. 测试策略总览

```
┌─────────────────────────────────────────────────────┐
│                    测试金字塔                        │
│                                                     │
│                    ┌──────┐                          │
│                    │ E2E  │  ← 全链路端到端测试       │
│                   ┌┴──────┴┐                         │
│                   │ 集成   │  ← 模块间集成测试        │
│                  ┌┴────────┴┐                        │
│                  │  单元    │  ← 函数/模块级别测试     │
│                 ┌┴──────────┴┐                       │
│                 │  编译检查   │  ← Rust 类型系统保证   │
│                 └────────────┘                       │
└─────────────────────────────────────────────────────┘
```

| 测试层级 | 数量目标 | 执行频率 | 工具 |
|----------|---------|----------|------|
| 编译检查 | N/A | 每次修改 | `cargo check` |
| 单元测试 | 100+ | 每次提交 | `cargo test` |
| 集成测试 | 30+ | 每个 Batch | `cargo test --test integration` |
| E2E 测试 | 10+ | 每个 Batch | Playwright + Docker Compose |

---

## 2. 各 Batch 回归测试清单

### Batch 0: 基础设施升级

#### 数据库迁移测试
- [ ] `0013_crawler_enhancement.sql` 迁移成功执行
- [ ] 现有数据不丢失（articles、sources 表数据完整）
- [ ] 新增字段默认值正确（domain_root=NULL, priority=5, health_status='unknown'）
- [ ] 新增索引创建成功
- [ ] `crawl_logs` 表可正常 INSERT/SELECT
- [ ] 回滚迁移测试（DOWN migration）

#### 编码检测测试
- [ ] UTF-8 编码页面正常解码
- [ ] GBK 编码页面正常解码（模拟人民银行网站）
- [ ] GB2312 编码页面正常解码
- [ ] GB18030 编码页面正常解码
- [ ] HTTP Header charset 检测优先级正确
- [ ] HTML meta charset 检测优先级正确
- [ ] 字节嗅探 fallback 正确
- [ ] 无 charset 声明时 UTF-8 fallback 正确

#### 现有功能回归
- [ ] `spider.rs` 原有 6 个单元测试全部通过
- [ ] Articles CRUD API 正常（GET/POST/PUT/DELETE）
- [ ] Sources CRUD API 正常（GET/POST/PUT/DELETE）
- [ ] 手动触发 source sync 正常
- [ ] Worker 启动正常，无 panic
- [ ] 前端 articles 页面正常渲染
- [ ] 前端 sources 页面正常渲染

### Batch 1: Pipeline 增强

#### Pipeline 单元测试
- [ ] HtmlCleaningStage：HTML 标签正确清除
- [ ] HtmlCleaningStage：中文标点正确处理
- [ ] HtmlCleaningStage：有意义结构保留（标题层级）
- [ ] DeduplicationStage：相同链接去重
- [ ] DeduplicationStage：相似标题去重（SimHash 阈值）
- [ ] DeduplicationStage：相同内容哈希去重
- [ ] DeduplicationStage：不同内容不误去重
- [ ] ContentQualityStage：空内容过滤
- [ ] ContentQualityStage：过短内容过滤
- [ ] ContentQualityStage：广告关键词过滤
- [ ] ContentQualityStage：正常内容通过
- [ ] MetadataExtractionStage：提取发布机构（"国务院"等）
- [ ] MetadataExtractionStage：提取法律文号（"国发〔2026〕1号"）
- [ ] MetadataExtractionStage：提取生效日期
- [ ] MetadataExtractionStage：匹配行政区划码
- [ ] ValidationStage：必填字段校验
- [ ] ValidationStage：字段格式校验

#### Pipeline 组合测试
- [ ] 标准管线（无AI）：完整处理 10 篇测试文章
- [ ] 管线中间阶段失败时的跳过逻辑
- [ ] `process_batch` 批量处理正确

#### 现有功能回归
- [ ] 所有 Batch 0 测试仍通过
- [ ] Worker source_sync 使用新 Pipeline 正常工作
- [ ] Articles 入库包含新字段

### Batch 2: 动态渲染集成

#### 动态渲染测试
- [ ] Browserless 服务启动正常（Docker 容器健康检查）
- [ ] 静态页面（render_mode=static）行为不变
- [ ] 动态页面（render_mode=dynamic）获取 JS 渲染后 HTML
- [ ] wait_for_selector 等待逻辑正确
- [ ] 渲染超时正确处理（返回错误而非 hang）
- [ ] 截图功能正常（保存到 MinIO）
- [ ] Browserless 服务不可用时的优雅降级
- [ ] Docker Compose 启动无端口冲突
- [ ] Browserless 并发限制（MAX_CONCURRENT_SESSIONS）正常

#### 现有功能回归
- [ ] 所有 Batch 0-1 测试仍通过
- [ ] 静态爬取的 sources 不受影响

### Batch 3: 核心数据源适配

#### 适配器注册表测试
- [ ] AdapterRegistry 正确注册所有适配器
- [ ] `get("rss")` 返回 RssAdapter
- [ ] `get("npc_gov")` 返回 NpcGovAdapter
- [ ] `get("unknown")` 返回 None

#### 真实数据源抓取测试（集成测试，需要网络）
- [ ] npc_gov 适配器：从全国人大网抓取 >= 5 篇文章
- [ ] flk_npc 适配器：从国家法律法规数据库抓取 >= 5 篇（需动态渲染）
- [ ] court_gov 适配器：从最高人民法院抓取 >= 5 篇
- [ ] csrc_gov 适配器：从证监会抓取 >= 5 篇
- [ ] cbirc_gov 适配器：从金融监管总局抓取 >= 5 篇
- [ ] cac_gov 适配器：从网信办抓取 >= 5 篇
- [ ] moj_gov 适配器：从司法部抓取 >= 5 篇
- [ ] samr_gov 适配器：从市场监管总局抓取 >= 5 篇
- [ ] miit_gov 适配器：从工信部抓取 >= 5 篇
- [ ] pbc_gov 适配器：从人民银行抓取 >= 5 篇（GBK 编码）

#### 抓取结果质量测试
- [ ] 每篇文章 title 非空
- [ ] 每篇文章 link 为有效 URL
- [ ] 内容非空（至少 80% 的文章有内容）
- [ ] 日期解析正确（非 null 的日期格式正确）
- [ ] 无乱码（编码检测正确）

#### 现有功能回归
- [ ] 所有 Batch 0-2 测试仍通过
- [ ] 现有 RSS sources 不受影响
- [ ] 现有 Spider sources 不受影响

### Batch 4: AI 增强管线

#### AI 阶段单元测试
- [ ] AiCategorizationStage：输出 domain_root 属于八大领域枚举
- [ ] AiCategorizationStage：输出 domain_sub 非空
- [ ] AiSummaryStage：输出 summary_struct 符合 JSON Schema
- [ ] AiSummaryStage：包含 fact/core/impact 三个字段
- [ ] AiRiskScoringStage：输出 risk_score 在 1-10 范围
- [ ] AiRiskScoringStage：包含评分理由

#### AI 降级测试
- [ ] LLM API 不可用时，Pipeline 不阻塞
- [ ] LLM 返回格式错误时，正确 fallback
- [ ] Token 超限时，内容截断后重试

#### 现有功能回归
- [ ] 所有 Batch 0-3 测试仍通过

### Batch 5-9: 后续批次（测试要点）

- **Batch 5 (反爬)**：代理切换、robots.txt 遵守、频率限制
- **Batch 6 (增量)**：ETag 缓存、分页爬取、并发控制
- **Batch 7 (监控)**：Prometheus 指标导出、告警触发
- **Batch 8 (扩展源)**：新数据源抓取验证
- **Batch 9 (全面测试)**：性能基线、压力测试、安全测试

---

## 3. 性能基线

| 指标 | 基线值 | 测量方法 |
|------|--------|----------|
| 单源静态爬取延迟 | < 5s / 页 | `cargo bench` |
| 单源动态渲染延迟 | < 15s / 页 | `cargo bench` |
| Pipeline 处理延迟（无AI） | < 100ms / 文章 | `cargo bench` |
| Pipeline 处理延迟（含AI） | < 3s / 文章 | `cargo bench` |
| 10 源并发爬取吞吐 | > 50 文章/分钟 | 集成测试 |
| Worker 内存占用 | < 512MB | `docker stats` |
| 数据库查询延迟（articles 列表） | < 50ms | `EXPLAIN ANALYZE` |

---

## 4. 安全测试清单

- [ ] SSRF 防护：内网 URL 被阻止
- [ ] XSS 清洗：HTML 内容中的脚本标签被移除
- [ ] SQL 注入：用户输入的 selector 不能注入 SQL
- [ ] 敏感信息：爬取日志不泄露 API Key/密码
- [ ] 速率限制：不对目标站点造成 DDoS
- [ ] 数据隔离：租户 A 的爬取结果不泄露到租户 B

---

## 5. 测试执行命令

```bash
# 编译检查
cargo check --workspace

# 单元测试（快速）
cargo test --workspace

# 集成测试（需要数据库和 Redis）
cargo test --workspace --test integration

# 特定模块测试
cargo test -p law-eye-crawler
cargo test -p law-eye-worker

# E2E 测试（需要 Docker Compose 完整启动）
cd apps/web && npx playwright test

# 性能基准测试
cargo bench -p law-eye-crawler

# 代码质量检查
cargo clippy --workspace -- -D warnings
cargo fmt --workspace -- --check
```
