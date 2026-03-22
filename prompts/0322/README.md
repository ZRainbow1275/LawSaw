# prompts/0322 — 用户端开发 Spec 目录

更新时间：2026-03-22

---

## 目录说明

本目录包含 LawSaw 用户端开发的全部规范与指导文档。

| 文件 | 说明 | 用途 |
|------|------|------|
| `README.md` | 本文件 | 目录索引与使用指南 |
| `CODEX_PROMPT.md` | Codex CLI 驱动提示词 | 直接粘贴到 Codex CLI 启动开发 |
| `DEVELOPMENT_RUNBOOK.md` | 开发主运行手册 | 阶段定义、门禁、验证命令 |

后续可能新增的文件：

| 文件（规划中） | 说明 |
|----------------|------|
| `PAGE_SPEC_DASHBOARD.md` | Dashboard 页面详细 Spec |
| `PAGE_SPEC_ARTICLES.md` | 文章系统详细 Spec |
| `PAGE_SPEC_READER.md` | 阅读器详细 Spec |
| `PAGE_SPEC_REPORTS.md` | 报告系统详细 Spec |
| `PAGE_SPEC_KNOWLEDGE.md` | 知识图谱详细 Spec |
| `COMPONENT_SPEC_*.md` | 各通用组件 Spec |

---

## 如何使用

### 1. 使用 CODEX_PROMPT.md 驱动开发

`CODEX_PROMPT.md` 是精炼的 Codex CLI 提示词，可直接复制粘贴到 Codex CLI 中启动开发会话。

它包含：
- 项目目标与质量标准
- 强制约束（禁 Emoji、禁 Mock 等）
- 全部参考文件路径
- 开发工作流（Spec 驱动 + Ralph-Loop）
- Agent 团队规范
- 7 个开发阶段大纲
- 验收标准

**使用方法：**
1. 打开 Codex CLI
2. 复制 `CODEX_PROMPT.md` 全文作为初始提示词
3. Codex 会按阶段顺序执行开发
4. 每个阶段通过 Gate 门禁后进入下一阶段

### 2. 使用 DEVELOPMENT_RUNBOOK.md 跟踪进度

`DEVELOPMENT_RUNBOOK.md` 是详细的运行手册，包含：
- 前置检查清单（环境/Docker/端口）
- 7 个开发阶段的详细交付内容
- 每个阶段的 Gate 门禁条件
- 验证命令速查
- 测试策略
- 部署与回滚流程
- 故障排查指南
- 原型页面与组件映射
- 图标映射表

---

## Spec 与实现的关系

```
prompts/0322/CODEX_PROMPT.md     ──> 启动开发的顶层指令
         |
         v
prompts/0322/DEVELOPMENT_RUNBOOK.md ──> 阶段划分与门禁
         |
         v
.trellis/spec/frontend/         ──> 前端代码规范（组件/Hook/状态/类型）
.trellis/spec/backend/          ──> 后端代码规范（数据库/错误/日志）
         |
         v
prototype/app.html              ──> UI/交互参考基准
         |
         v
apps/web/src/                   ──> 实际代码实现
```

**关键原则：**
- Spec 文档是单一事实源（Single Source of Truth）
- 原型是 UI 基准，实现必须与原型视觉一致
- 代码实现必须满足 Spec 中的全部要求
- 完成后更新 Spec 状态（已实现/待实现）

---

## 开发 -> 审查 -> 部署 流水线

```
Phase 1-7 开发
    |
    v
自检（typecheck + lint + test）
    |
    v
子代理代码审查
    |
    +──> 发现问题 ──> 修复 ──> 回到审查 (循环)
    |
    v (零问题)
E2E 测试
    |
    v
Docker 部署
    |
    v
生产验证
    |
    v
完成报告
```

**审查循环规则：**
1. 子代理以审查员身份检查代码
2. 如有问题，修复后重新提交审查
3. 仅当审查零问题后才进入测试阶段
4. 测试通过后进行 Docker 部署
5. 部署后进行生产验证

---

## 与其他目录的关系

| 目录 | 作用 | 与 0322 的关系 |
|------|------|----------------|
| `prompts/0225/` | 上轮 ReBAC + AI 治理规范 | 0322 引用其 ReBAC spec |
| `prompts/NEXT_ROUND_LOCAL_RUNBOOK.md` | 本机启动手册 | 0322 引用其环境参数 |
| `.trellis/spec/` | 通用代码规范 | 0322 引用其编码规范 |
| `prototype/` | 前端参考原型 | 0322 以此为 UI 基准 |

---

## 约束说明

- 本轮新增的 Spec 文档存放在 `prompts/0322/`
- `.trellis/spec/` 中的通用规范保持不动，仅引用
- 不在 `docs/` 目录新增 Spec 正文
- 运行手册可引用任何目录的 Spec，但不重复维护正文
