# Phase 1: AI 评估器设计 — ImportanceAssessor + DomainClassifier + AuthorityDetector

> 数据基础层：为统计功能提供数据填充能力

---

## 1. ImportanceAssessor (重要性评估器)

### 1.1 设计原理

参照现有 `RiskAssessor` (law-eye-ai/src/risk.rs) 的双层架构：
- **规则预评估层**：基于关键词和元数据的快速评分
- **LLM 精评层**：对高分文章进行 LLM 精细评估

### 1.2 评分因子

```rust
pub struct ImportanceAssessor {
    llm_client: Arc<dyn LlmClient>,
}

// 重要性因子权重
const AUTHORITY_WEIGHT: f32 = 0.30;   // 法律层级权重
const SCOPE_WEIGHT: f32 = 0.25;       // 影响范围权重
const NOVELTY_WEIGHT: f32 = 0.20;     // 时效性/新颖性权重
const ENFORCEMENT_WEIGHT: f32 = 0.15; // 强制力权重
const MEDIA_WEIGHT: f32 = 0.10;       // 媒体关注度权重
```

### 1.3 规则预评估

```rust
fn rule_assess(&self, article: &Article) -> u8 {
    let mut score: f32 = 0.0;

    // 1. 权威等级因子 (如果已知)
    if let Some(auth) = article.authority_level {
        score += match auth {
            1 => 5.0,      // 宪法
            2 => 4.5,      // 全国人大法律
            3 => 4.0,      // 国务院行政法规
            4 => 3.5,      // 部门规章
            5..=6 => 3.0,  // 地方性法规
            7..=8 => 2.0,  // 规范性文件
            _ => 1.0,      // 其他
        } * AUTHORITY_WEIGHT;
    }

    // 2. 标题关键词 → 影响范围因子
    let title = article.title.to_lowercase();
    let high_scope_keywords = [
        "全国", "全面", "重大", "改革", "修订", "新法",
        "生效", "施行", "废止", "国务院", "全国人大",
    ];
    let medium_scope_keywords = [
        "行业", "领域", "规范", "标准", "指南", "通知",
    ];

    let scope_score = if high_scope_keywords.iter().any(|k| title.contains(k)) {
        4.5
    } else if medium_scope_keywords.iter().any(|k| title.contains(k)) {
        3.0
    } else {
        1.5
    };
    score += scope_score * SCOPE_WEIGHT;

    // 3. 发布机构因子
    if let Some(ref issuer) = article.issuer {
        let issuer_score = match issuer.as_str() {
            "全国人大常委会" | "国务院" => 5.0,
            "最高人民法院" | "最高人民检察院" => 4.5,
            "国家网信办" | "工信部" | "中国人民银行" | "证监会" | "银保监会" => 4.0,
            _ if issuer.contains("部") || issuer.contains("委") => 3.5,
            _ if issuer.contains("局") || issuer.contains("办") => 3.0,
            _ => 2.0,
        };
        score += issuer_score * ENFORCEMENT_WEIGHT;
    }

    // 归一化到 1-5
    ((score / 5.0 * 4.0) + 1.0).round().min(5.0).max(1.0) as u8
}
```

### 1.4 集成到 AI Pipeline

修改 `law-eye-ai/src/service.rs` 的 `ArticleAiResult`:

```rust
pub struct ArticleAiResult {
    pub category_slug: Option<String>,
    pub summary: Option<String>,
    pub risk_score: u8,
    pub risk_level: String,
    pub tags: Vec<String>,
    pub keywords: Vec<String>,
    pub sentiment: String,
    // --- 新增 ---
    pub importance: u8,           // 1-5
    pub domain_root: Option<String>,
    pub domain_sub: Option<String>,
    pub authority_level: Option<u8>, // 1-10
}
```

---

## 2. DomainClassifier (领域分类器)

### 2.1 分类映射

```rust
const DOMAIN_ROOTS: &[&str] = &[
    "legislation",   // 立法前沿
    "regulation",    // 监管动向
    "enforcement",   // 执法案例
    "industry",      // 业界资讯
    "compliance",    // 合规前沿
    "technology",    // 数据/安全/技术
    "academic",      // 学术文章
    "international", // 国际视野
];

// category_slug → domain_root 映射
fn category_to_domain(slug: &str) -> &str {
    match slug {
        "legislation" => "legislation",
        "regulation" => "regulation",
        "enforcement" => "enforcement",
        "industry" => "industry",
        "compliance" => "compliance",
        "data" | "security" => "technology",
        "academic" => "academic",
        "international" => "international",
        "events" => "enforcement",  // 重大事件多为执法类
        _ => "industry",           // 默认
    }
}
```

### 2.2 domain_sub 细分

通过 LLM 识别二级分类：

| domain_root | domain_sub 候选值 |
|------------|------------------|
| legislation | law, administrative_regulation, local_regulation, judicial_interpretation |
| regulation | financial, data_protection, antitrust, securities, environmental |
| enforcement | administrative_penalty, criminal_case, civil_case, arbitration |
| industry | fintech, healthcare, real_estate, education, energy |
| compliance | internal_audit, risk_management, due_diligence, aml_kyc |
| technology | cybersecurity, ai_regulation, data_governance, blockchain |
| academic | research_paper, case_study, legal_review, commentary |
| international | treaty, cross_border, sanctions, trade_compliance |

---

## 3. AuthorityDetector (权威等级检测器)

### 3.1 等级定义 (authority_level 1-10)

```rust
// GB 法律层级体系
const AUTHORITY_LEVELS: &[(u8, &str, &[&str])] = &[
    (1, "宪法", &["宪法", "修正案"]),
    (2, "法律", &["中华人民共和国", "法", "人大", "人民代表大会"]),
    (3, "行政法规", &["国务院", "条例", "暂行条例"]),
    (4, "部门规章", &["部令", "部门规章", "办法"]),
    (5, "地方性法规", &["省", "市", "自治区", "条例"]),
    (6, "地方政府规章", &["市政府", "省政府", "令"]),
    (7, "司法解释", &["最高人民法院", "最高人民检察院", "解释"]),
    (8, "规范性文件", &["通知", "意见", "指导", "指南"]),
    (9, "行业标准", &["标准", "规范", "GB", "行业"]),
    (10, "非正式", &["研究", "评论", "分析", "报告"]),
];
```

### 3.2 检测逻辑

```rust
fn detect_authority(title: &str, content: &str, issuer: Option<&str>) -> Option<u8> {
    // 1. 先根据 issuer 快速判断
    if let Some(iss) = issuer {
        if iss.contains("人大") { return Some(2); }
        if iss == "国务院" { return Some(3); }
        if iss.contains("部") || iss.contains("委") { return Some(4); }
        if iss.contains("省") || iss.contains("市") { return Some(5); }
        if iss.contains("法院") || iss.contains("检察院") { return Some(7); }
    }

    // 2. 标题关键词匹配
    for (level, _name, keywords) in AUTHORITY_LEVELS {
        if keywords.iter().any(|k| title.contains(k)) {
            return Some(*level);
        }
    }

    // 3. 默认为规范性文件
    Some(8)
}
```

---

## 4. 数据回填方案

### 4.1 回填命令

在 `law-eye-worker` 中添加回填子命令：

```bash
law-eye-worker backfill --field importance --batch-size 100 --dry-run
law-eye-worker backfill --field domain --batch-size 100
law-eye-worker backfill --field authority --batch-size 100
law-eye-worker backfill --field all --batch-size 50
```

### 4.2 回填策略

```rust
async fn backfill_field(pool: &PgPool, field: &str, batch_size: i64) {
    loop {
        // 1. 取一批 NULL 的记录
        let articles = sqlx::query_as!(Article,
            "SELECT * FROM articles
             WHERE deleted_at IS NULL AND {field} IS NULL
             ORDER BY created_at DESC
             LIMIT $1",
            batch_size
        ).fetch_all(pool).await?;

        if articles.is_empty() { break; }

        // 2. 逐条计算
        for article in &articles {
            let value = compute_field(article, field);
            update_field(pool, article.id, field, value).await?;
        }

        tracing::info!("Backfilled {} articles for {field}", articles.len());
    }
}
```

### 4.3 增量处理

新文章通过 AI Pipeline 自动获得所有字段。回填仅用于历史数据。
