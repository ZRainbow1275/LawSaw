# LawSaw 用户端开发 — Codex CLI 驱动提示词

版本：v1.0
日期：2026-03-22
状态：Production-Ready

---

## 1. 项目概述与目标

### 1.1 项目定义

开发一个与现有后端完全集成的用户端前端应用。该用户端必须：
- 以 `D:\Desktop\LawSaw\prototype\app.html` 为参考基准，实现其中全部页面与交互
- 在参考基准之上，基于市面优秀实践进行功能拓展，保证每个功能的实现绝对完善
- 接入现有 ReBAC 权限体系，实现基于角色的内容与功能控制
- 与后端 API 完全真实联调，严禁 Mock 数据

### 1.2 质量标准

- **100% 可用性**：所有功能必须真实可用，全链路跑通
- **100% 丰富性**：基于原型扩展，参照 Readink、Notion、语雀等优秀平台的最佳实践
- **100% 完善性**：边缘场景全覆盖，防御性编码，冗余开发
- **企业级规范**：代码、架构、文档均达到企业级交付标准

---

## 2. 核心约束（强制执行）

### 2.1 绝对禁止

| 编号 | 禁止项 | 说明 |
|------|--------|------|
| C-01 | **Emoji 图标** | 全项目禁止使用 Emoji 作为图标，使用 `lucide-react` |
| C-02 | **Mock 数据** | 禁止模拟数据/模拟操作，所有数据来自真实 API |
| C-03 | **重复构建** | 禁止反复 `docker build`/`pnpm build`，占用磁盘 |
| C-04 | **强制终止进程** | 不 kill 非本项目的 Node 进程 |
| C-05 | **Playwright 下载** | 使用已安装的浏览器，禁止重复下载 |
| C-06 | **python3 命令** | Windows 系统使用 `python`，不是 `python3` |
| C-07 | **编辑器风格变更** | 现有编辑器风格不可改动 |

### 2.2 Docker 操作规范

```
任何 Docker 操作前必须执行前置检查：
1. docker ps — 检查运行中容器
2. docker images — 检查已有镜像
3. 端口冲突检查 — 13003, 8850, 3002
4. 确认不对已有 container 造成冲突
5. 确认不额外创建 image 占用内存
```

### 2.3 Node 进程保护

```
当前有其他 Node 进程在运行：
- 不做全局强制终止
- 只终止本项目（LawSaw）相关进程
- 使用精确匹配而非通配符 kill
```

---

## 3. 参考资料与 Spec 路径

### 3.1 核心参考

| 文件 | 路径 | 用途 |
|------|------|------|
| 前端原型 | `D:\Desktop\LawSaw\prototype\app.html` | UI/交互参考基准 |
| 开发运行手册 | `D:\Desktop\LawSaw\prompts\0322\DEVELOPMENT_RUNBOOK.md` | 阶段定义与门禁 |
| ReBAC 规范 | `D:\Desktop\LawSaw\prompts\0225\REBAC_AI_GOVERNANCE_SPEC_2026-02-25.md` | 权限体系设计 |
| 本机启动手册 | `D:\Desktop\LawSaw\prompts\NEXT_ROUND_LOCAL_RUNBOOK.md` | 后端栈启动参考 |

### 3.2 Spec 目录

| 目录 | 内容 |
|------|------|
| `D:\Desktop\LawSaw\prompts\0322\` | 本轮开发 Spec + Runbook |
| `D:\Desktop\LawSaw\.trellis\spec\frontend\` | 前端开发规范（组件/Hook/状态/类型） |
| `D:\Desktop\LawSaw\.trellis\spec\backend\` | 后端规范（数据库/错误处理/日志） |
| `D:\Desktop\LawSaw\.trellis\spec\shared\` | 共享规范 |

### 3.3 技术栈

```
框架: Next.js 16 (App Router) + React 19
状态: Zustand 5 + TanStack React Query 5
样式: Tailwind CSS 4
图表: ECharts 6 + echarts-for-react
图标: lucide-react（严禁 Emoji）
动画: framer-motion 11
类型: TypeScript 5 (strict mode)
Lint: Biome
测试: Vitest + Playwright
构建: webpack (via next build --webpack)
```

---

## 4. 开发工作流

### 4.1 Spec 驱动开发循环

```
每个功能的开发必须遵循以下循环：

1. 阅读 Spec          — 理解 prompts/0322/ 中的规范要求
2. 阅读原型          — 对照 prototype/app.html 确认 UI 细节
3. 实现代码          — 严格按 spec + 原型实现
4. 自检              — pnpm typecheck && pnpm lint
5. 功能验证          — 在浏览器中验证交互
6. 对照 Spec 审查    — 逐条确认 spec 要求被满足
7. 完成报告          — 记录实现内容与验证结果
```

### 4.2 Ralph-Loop（递归验证循环）

```
对于每个已实现的功能，执行至少 3 轮 Ralph-Loop：

Round 1: 功能正确性
  - 所有交互是否与原型一致
  - API 数据是否正确渲染
  - 边缘场景（空数据/错误/加载态）是否处理

Round 2: 代码质量
  - TypeScript 类型是否严格
  - 组件是否遵循 spec 中的模式
  - 是否有不必要的重复代码

Round 3: 视觉与体验
  - 动画是否流畅（对照原型 CSS 过渡参数）
  - 响应式是否正确
  - 暗色模式是否适配
```

### 4.3 审查-修复-再审查循环

```
代码审查流程：

1. 完成开发 -> 自查 -> 提交审查
2. 开启子代理以审查员身份审查代码
3. 发现问题 -> 修复 -> 重新提交审查
4. 循环直到审查零问题
5. 零问题后进行测试 -> Docker 部署 -> CI/CD
```

---

## 5. Agent 团队工作规范

### 5.1 团队结构

```
可并行启动最多 3 个 Agent（可多次启动）：
- Agent 1: 页面组件实现
- Agent 2: Hook/状态/API 集成
- Agent 3: 测试/验证/文档

注意：
- 如发现文件被改动（其他实例在工作），及时同步和合并
- 如发现冲突，需要协调解决
- 每个 Agent 完成后更新 Task 状态
```

### 5.2 冲突处理

```
当多个 Agent 同时工作时：
1. 检查 git status 确认文件变更状态
2. 如果发现文档/代码被其他实例修改，先 pull/merge
3. 如遇端口占用或资源冲突，等待或协调
4. 保持 Task 列表实时更新
```

---

## 6. 开发阶段大纲

按 `prompts/0322/DEVELOPMENT_RUNBOOK.md` 中定义的 7 个阶段执行：

| 阶段 | 内容 | 门禁 |
|------|------|------|
| Phase 1 | 页面骨架 + 路由 + 侧栏 + 顶栏 | 全路由可达，侧栏折叠流畅 |
| Phase 2 | Dashboard + 地图 + 统计 + Feed | 地图交互流畅，数据真实 |
| Phase 3 | 文章列表 + 阅读器 + 搜索 | 阅读器 TOC 同步，搜索覆盖层 |
| Phase 4 | 报告 + 分析面板 | 报告状态流转，导出可用 |
| Phase 5 | 知识图谱 + 反馈 + 设置 | 图谱交互，反馈提交 |
| Phase 6 | ReBAC 权限集成 | 角色切换生效，权限控制 |
| Phase 7 | 动画 + 响应式 + 暗色模式 | Lighthouse >= 80 |

**每个阶段完成后必须通过 Gate 门禁才可进入下一阶段。**

---

## 7. 功能拓展方向

在原型基础之上，参照市面优秀平台进行拓展：

### 7.1 Markdown 编辑器

- 以 Markdown 原始文本呈现为重心
- 支持即时渲染预览
- 编辑器中展现 Markdown 语法支持
- 参照 Notion/Typora/语雀 的 WYSIWYG 体验
- **不改动现有编辑器风格**

### 7.2 高级交互

- 快捷键系统（Ctrl+K 搜索、Ctrl+B 侧栏、Ctrl+S 保存等）
- 拖拽排序（文章收藏列表、知识图谱节点）
- 虚拟滚动（长列表性能优化）
- 骨架屏加载态
- Toast 通知系统

### 7.3 冗余开发

- 每个输入框都有校验和提示
- 每个操作都有确认/撤销能力
- 每个错误都有用户可理解的提示
- 每个加载态都有骨架屏或进度指示

---

## 8. 集成化实现注意事项

在集成各模块与库时，特别注意：

| 维度 | 要求 |
|------|------|
| 端口映射 | API 代理 8850 -> 13003，确认 proxy 配置 |
| 模块匹配 | 前端 hook 与后端 API 一一对应 |
| 数据模型 | 使用 `pnpm gen:api-types` 保持类型同步 |
| 权限控制 | 所有受保护路由/操作必须检查 ReBAC 权限 |
| 错误处理 | API 错误统一拦截，用户友好提示 |

---

## 9. 文档驱动

### 9.1 文档维护

- 开发过程中及时更新 Spec 文档
- 以文档作为开发驱动力
- 完成报告格式：

```markdown
## 实现完成报告

### 已修改文件
- `src/components/Feature.tsx` — 新组件
- `src/hooks/useFeature.ts` — 新 Hook

### 实现摘要
1. 创建了 Feature 组件...
2. 添加了 useFeature Hook...

### 验证结果
- TypeCheck: 通过
- Lint: 通过
- 功能验证: 通过（含截图/描述）

### Spec 对照
- [x] 要求 1: 已实现
- [x] 要求 2: 已实现
```

### 9.2 文档更新触发

- 新增组件/页面时更新目录结构文档
- 新增 Hook 时更新 Hook 文档
- API 变更时重新生成类型
- 完成阶段后更新 Runbook 中的 Gate 状态

---

## 10. 执行指令

```
执行方式：
1. 进入 ultrathink 模式
2. 使用 Sequential Thinking 加深分析深度
3. 按阶段顺序执行，每阶段通过 Gate 后进入下一阶段
4. 每个功能至少 3 轮 Ralph-Loop 验证
5. 启动 Agent Teams（最多 3 个），可多次启动
6. 及时更新 Tasks 状态
7. 持续工作直到所有任务完成

工具使用：
- Sequential Thinking: 加深思考深度和维度
- Context7: 获取库/框架最新实践
- Grok Search: 搜索最新技术方案和市面优秀实践
- GitHub MCP / DeepWiki: 读取优秀开源项目参考

最终验证：
1. pnpm typecheck — 零类型错误
2. pnpm lint — 零 lint 错误
3. pnpm test:unit — 单元测试全通过
4. pnpm build — 生产构建成功
5. 浏览器手动验证全部页面和交互
6. Docker 部署验证
```

---

## 11. 验收标准

| 维度 | 标准 |
|------|------|
| 功能完整性 | prototype/app.html 中全部页面和交互均已实现 |
| 数据真实性 | 无任何 Mock 数据，全部来自真实 API |
| 代码质量 | TypeScript strict，零 `any`，Biome lint 通过 |
| 视觉还原 | 与原型视觉一致度 >= 95% |
| 交互体验 | 所有动画参数与原型 CSS 一致 |
| 权限控制 | ReBAC 三级角色控制生效 |
| 性能 | Lighthouse Performance >= 80 |
| 响应式 | 桌面/平板/移动端布局正确 |
| 可访问性 | 键盘导航、aria 标签完备 |
| 文档 | Spec 文档与实现同步 |
