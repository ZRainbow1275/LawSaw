# 知识图谱模块：现状审计与架构设计

> 审计日期: 2026-02-12 | 基线: master 分支 (29427fb)

## 1. 现状审计

### 1.1 核心发现：管道断裂

**严重程度: P0 — 知识图谱管道完全断开，所有代码为空壳**

```
文章入库 → QUEUE_AI → process_ai_task()
  → Classify ✅
  → Summarize ✅
  → RiskAssess ✅
  → ExtractTags ✅
  → Embed ✅
  → [ExtractEntities] ❌ 不存在
  → KnowledgeService::process_article() ❌ 从未调用
```

### 1.2 各层现状

| 层级 | 文件 | 状态 | 质量 | 问题 |
|------|------|------|------|------|
| DB Schema | `004_knowledge_graph.sql` | ✅ 已部署 | 9/10 | HNSW索引已建但从未被查询 |
| DB Models | `models.rs:431-490` | ✅ 编译通过 | 7/10 | `embedding` 字段 `#[sqlx(skip)]`，永远为 None |
| AI提取器 | `entity.rs` | ✅ 完整实现 | 6/10 | 静默吞错(unwrap_or_else)；Prompt 仅英文 |
| AI嵌入器 | `embedding.rs` | ✅ 完整实现 | 7/10 | N+1 串行调用；字符分块非语义分块 |
| Core服务 | `knowledge.rs` | ✅ 完整实现 | 7/10 | N+1 嵌入调用；无批量处理 |
| Queue类型 | `lib.rs:863-872` | ❌ 缺失 | — | AiTaskType 无 ExtractEntities |
| Worker集成 | `main.rs:2466-2719` | ❌ 缺失 | — | process_ai_task 无知识图谱分支 |
| API路由 | `knowledge/queries.rs` | ✅ 完整 | 7/10 | Backfill 仅SQL级别，不调用LLM |
| 前端UI | `knowledge/*.tsx` | ✅ 完整 | 8/10 | 三面板布局，但数据为空 |

### 1.3 关键缺陷清单

1. **AiTaskType 缺少 ExtractEntities** — `law-eye-queue/src/lib.rs:863-872`
2. **Worker 从未调用 KnowledgeService** — `law-eye-worker/src/main.rs` 无 import
3. **EntityExtractor 静默失败** — `entity.rs:80` 使用 `unwrap_or_else` 返回空结果
4. **N+1 嵌入调用** — `knowledge.rs:40` 每个实体串行调用 embed API
5. **Entity.embedding sqlx(skip)** — `models.rs:441` 反序列化跳过向量字段
6. **LLM Prompt 仅英文** — 中文法律领域应使用中文提取提示
7. **Backfill 非LLM驱动** — 仅从 sources/categories 表名创建实体
8. **语义搜索未实现** — HNSW 索引存在但无向量查询代码
9. **无实体消歧** — 相同实体不同名称无法合并
10. **Semaphore 共享** — chat 和 embed 共用并发限制

---

## 2. 架构设计

### 2.1 目标架构

```
Article Ingest
    │
    ▼
QUEUE_AI (AiTask)
    │
    ├── AiTaskType::Full
    │   ├── classify → summarize → risk_assess → extract_tags
    │   └── extract_entities (NEW) ← KnowledgeService::process_article()
    │
    ├── AiTaskType::ExtractEntities (NEW)
    │   └── KnowledgeService::process_article()
    │
    └── AiTaskType::Embed
        └── embed_chunks (existing)
```

### 2.2 实现策略：增量集成，零破坏

**原则**: 在现有 Worker 的 `process_ai_task()` 方法中追加 `ExtractEntities` 分支，复用已有的降级和错误处理模式。

#### 2.2.1 Queue 层变更
```rust
// law-eye-queue/src/lib.rs
pub enum AiTaskType {
    Classify,
    Summarize,
    RiskAssess,
    ExtractTags,
    Embed,
    ExtractEntities, // NEW
    Full,
}
```

#### 2.2.2 Worker 层变更

在 `AiTaskType::Full` 分支的 `extract_tags` 之后追加 `extract_entities` 步骤：

```rust
// After extract_tags in Full pipeline:
let entities_stage = match knowledge_service.process_article(
    tenant_id, task.article_id, &article.title, content
).await {
    Ok(ids) => AiStageReport::success("extract_entities"),
    Err(err) => {
        warn!("Entity extraction failed: {}", err);
        AiStageReport::degraded("extract_entities", sanitize_error_message(err.to_string()))
    }
};
stage_reports.push(entities_stage);
```

新增独立 `ExtractEntities` 分支（与 Classify/Summarize 同模式）。

#### 2.2.3 性能优化

- **批量嵌入**: 收集所有实体名称后一次性调用 embed API（消除 N+1）
- **并发控制**: 独立 semaphore 或与 embed 共享但增大限制
- **Prompt 双语化**: 中文系统提示 + 中英双语实体类型

### 2.3 修复优先级

| 优先级 | 任务 | 影响 |
|--------|------|------|
| P0 | AiTaskType + Worker 集成 | 管道打通 |
| P0 | EntityExtractor 错误传播 | 可观测性 |
| P1 | N+1 嵌入批量化 | 性能 |
| P1 | Prompt 中文化 | 提取质量 |
| P2 | Entity embedding sqlx 修复 | 语义搜索基础 |
| P2 | 语义搜索实现 | 用户功能 |
| P3 | 实体消歧 | 数据质量 |
| P3 | 图算法服务 | 高级功能 |

---

## 3. 实施计划

### Phase 1: 管道打通 (T2)
1. 在 AiTaskType 添加 ExtractEntities
2. Worker `process_ai_task()` 新增分支
3. Full 管道追加 extract_entities 步骤
4. Worker 初始化时创建 KnowledgeService 实例

### Phase 2: 质量提升 (T3 + T7)
1. EntityExtractor 错误正确传播（移除 unwrap_or_else）
2. Prompt 中文化 + 中文法律实体类型
3. N+1 批量嵌入优化
4. 实体消歧基础逻辑

### Phase 3: 搜索与算法 (T4 + T5)
1. Entity embedding 字段 sqlx 修复
2. HNSW 向量语义搜索
3. PageRank / 中心度算法
4. API 路由补充

### Phase 4: 前端增强 (T6)
1. 图谱实时数据展示
2. 语义搜索 UI
3. 导出功能
