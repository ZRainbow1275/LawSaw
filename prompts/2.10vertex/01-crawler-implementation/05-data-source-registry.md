# 05 - 数据源注册表：法律信息源清单

> 整理日期: 2026-02-10
> 目标: 覆盖中国法律生态系统核心信息源 20+

---

## 1. 数据源分类体系

按宏观架构蓝图的「八大领域」分类：

| 领域代码 | 领域名称 | 说明 |
|----------|----------|------|
| `legislation` | 立法 | 法律、行政法规、部门规章、地方性法规 |
| `regulation` | 监管 | 监管政策、行政处罚、合规要求 |
| `enforcement` | 执法 | 司法判决、执法通报 |
| `industry` | 行业 | 行业动态、市场分析 |
| `compliance` | 合规 | 企业合规指南、标准 |
| `technology` | 技术 | 数据安全、网络安全、技术法规 |
| `academic` | 学术 | 法学研究、论文 |
| `international` | 国际 | 国际法律、跨境合规 |

---

## 2. 核心数据源清单（Batch 3 — 前 10 个）

### 2.1 立法类

| # | 数据源名称 | URL | 类型 | 渲染模式 | 编码 | 复杂度 | 适配器 |
|---|-----------|-----|------|----------|------|--------|--------|
| 1 | 全国人大网 | npc.gov.cn | spider | static | UTF-8 | 🟡 中 | `npc_gov` |
| 2 | 国家法律法规数据库 | flk.npc.gov.cn | spider | dynamic | UTF-8 | 🔴 高 | `flk_npc` |
| 3 | 司法部 | moj.gov.cn | spider | static | UTF-8 | 🟡 中 | `moj_gov` |

**全国人大网适配器详情**：
- 列表页: `http://www.npc.gov.cn/npc/c2/c183/flfg_list.shtml`
- 列表选择器: `ul.list > li`
- 标题选择器: `a`
- 链接选择器: `a[href]`
- 详情页内容: `.article_content` 或 `.detail`
- 日期选择器: `.date` 或 `span.time`
- 分页方式: URL 参数翻页

**国家法律法规数据库适配器详情**：
- 需要 JavaScript 渲染（Vue.js SPA）
- 搜索接口: POST API 调用
- 等待选择器: `.el-table__body-wrapper`
- 需要处理分页：API 参数 `page` + `size`

### 2.2 监管类

| # | 数据源名称 | URL | 类型 | 渲染模式 | 编码 | 复杂度 | 适配器 |
|---|-----------|-----|------|----------|------|--------|--------|
| 4 | 中国证监会 | csrc.gov.cn | spider | static | UTF-8 | 🟡 中 | `csrc_gov` |
| 5 | 国家金融监管总局 | cbirc.gov.cn | spider | static | UTF-8 | 🟡 中 | `cbirc_gov` |
| 6 | 国家互联网信息办公室 | cac.gov.cn | spider | static | UTF-8 | 🟡 中 | `cac_gov` |
| 7 | 中国人民银行 | pbc.gov.cn | spider | static | GBK | 🟡 中 | `pbc_gov` |

**证监会适配器详情**：
- 信息公开栏目: `http://www.csrc.gov.cn/csrc/c100028/common_list.shtml`
- 列表选择器: `.list-content li`
- 注意: 部分页面使用 GBK 编码
- 子栏目: 行政处罚、规章制度、公告通知

**人民银行适配器详情**：
- ⚠️ 编码为 GBK，需要编码检测
- 政策栏目: `http://www.pbc.gov.cn/zhengcehuobisi/`
- 列表格式: 表格行 `tr > td > a`

### 2.3 执法类

| # | 数据源名称 | URL | 类型 | 渲染模式 | 编码 | 复杂度 | 适配器 |
|---|-----------|-----|------|----------|------|--------|--------|
| 8 | 最高人民法院 | court.gov.cn | spider | static | UTF-8 | 🔴 高 | `court_gov` |

**最高人民法院适配器详情**：
- 司法解释栏目: `https://www.court.gov.cn/fabu/sfjs/`
- ⚠️ 反爬较强：频率限制、IP 封禁
- 需要: 代理轮换、延迟控制
- 裁判文书网 (wenshu.court.gov.cn) 反爬极强，暂不纳入第一批

### 2.4 综合类

| # | 数据源名称 | URL | 类型 | 渲染模式 | 编码 | 复杂度 | 适配器 |
|---|-----------|-----|------|----------|------|--------|--------|
| 9 | 市场监管总局 | samr.gov.cn | spider | static | UTF-8 | 🟡 中 | `samr_gov` |
| 10 | 工业和信息化部 | miit.gov.cn | spider | static | UTF-8 | 🟡 中 | `miit_gov` |

---

## 3. 扩展数据源清单（Batch 8 — 后续扩展）

### 3.1 行业/科技资讯类（有 RSS）

| # | 数据源名称 | URL | 类型 | 说明 |
|---|-----------|-----|------|------|
| 11 | 36氪 | 36kr.com | rss | 科技/法律交叉资讯 |
| 12 | 虎嗅 | huxiu.com | rss | 商业/法律交叉资讯 |
| 13 | 第一财经 | yicai.com | rss | 金融法规资讯 |
| 14 | 财新网 | caixin.com | spider | 深度法律报道 |

### 3.2 技术安全类

| # | 数据源名称 | URL | 类型 | 说明 |
|---|-----------|-----|------|------|
| 15 | CNVD 漏洞库 | cnvd.org.cn | spider | 国家信息安全漏洞共享平台 |
| 16 | CNNVD | cnnvd.org.cn | spider | 国家信息安全漏洞库 |
| 17 | 国家网络安全通报中心 | cert.org.cn | spider | 安全通报 |

### 3.3 国际法律类

| # | 数据源名称 | URL | 类型 | 说明 |
|---|-----------|-----|------|------|
| 18 | EUR-Lex | eur-lex.europa.eu | api | 欧盟法律（有 REST API） |
| 19 | GDPR Enforcement Tracker | enforcementtracker.com | spider | GDPR 执法案例 |
| 20 | SEC EDGAR | sec.gov/edgar | api | 美国证券法规 |

### 3.4 地方性法规类

| # | 数据源名称 | URL | 类型 | 说明 |
|---|-----------|-----|------|------|
| 21 | 上海市人大 | spcsc.sh.gov.cn | spider | 上海地方性法规 |
| 22 | 北京市人大 | bjrd.gov.cn | spider | 北京地方性法规 |
| 23 | 广东省人大 | rd.gd.gov.cn | spider | 广东地方性法规 |

### 3.5 行业协会类

| # | 数据源名称 | URL | 类型 | 说明 |
|---|-----------|-----|------|------|
| 24 | 中国互联网协会 | isc.org.cn | spider | 互联网行业自律 |
| 25 | 中国银行业协会 | china-cba.net | spider | 银行业合规 |

---

## 4. 数据源配置模板

每个数据源在 `sources` 表中的配置结构：

```json
{
  "name": "全国人大网",
  "url": "http://www.npc.gov.cn/npc/c2/c183/flfg_list.shtml",
  "kind": "npc_gov",
  "category_id": "<legislation-category-uuid>",
  "sync_interval_secs": 3600,
  "priority": 9,
  "render_mode": "static",
  "encoding": "utf-8",
  "config": {
    "list_selector": "ul.list > li",
    "title_selector": "a",
    "link_selector": "a",
    "content_selector": ".article_content",
    "date_selector": ".date",
    "delay_ms": 2000,
    "pagination": {
      "type": "url_param",
      "param_name": "page",
      "start_page": 1,
      "max_pages": 10
    }
  }
}
```

---

## 5. 数据源健康检查标准

| 健康状态 | 条件 | 自动响应 |
|----------|------|----------|
| `healthy` | 最近 3 次爬取均成功 | 正常调度 |
| `degraded` | 最近 3 次有 1-2 次失败 | 增加间隔 50% |
| `unhealthy` | 最近 3 次均失败 | 暂停调度，发送告警 |
| `unknown` | 从未爬取过 | 首次爬取优先 |

---

## 6. 数据源优先级规则

| 优先级 | 分值范围 | 说明 | 示例 |
|--------|---------|------|------|
| P0 - 关键 | 9-10 | 法律法规核心源，影响合规判断 | 全国人大网、国家法律法规数据库 |
| P1 - 重要 | 7-8 | 监管动态，影响企业决策 | 证监会、银保监、网信办 |
| P2 - 标准 | 5-6 | 行业资讯，补充参考 | 36氪、虎嗅 |
| P3 - 补充 | 3-4 | 扩展信息，锦上添花 | 地方法规、学术论文 |
| P4 - 低优 | 1-2 | 国际参考，非核心 | EUR-Lex、SEC |
