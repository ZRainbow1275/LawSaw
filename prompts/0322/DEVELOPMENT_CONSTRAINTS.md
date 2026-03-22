# 开发约束与护栏

> 最后更新: 2026-03-22
> 适用范围: 所有开发者与 AI Agent 在 LawSaw 项目上的工作

---

## 1. Windows 环境约束

### 1.1 Shell 环境

- 使用 Git Bash（`/usr/bin/bash`），**不使用** PowerShell 或 CMD
- 路径使用正斜杠：`D:/Desktop/LawSaw`（不是 `D:\Desktop\LawSaw`）
- 环境变量使用 Linux 语法：`$PATH`，不是 `%PATH%` 或 `$env:PATH`
- 命令连接使用 `&&`，不是 `; then`

### 1.2 命令差异

| 场景 | Windows (Git Bash) | Linux |
|---|---|---|
| Python | `python` | `python3` |
| 路径分隔符 | `/` 或 `\\`（推荐 `/`） | `/` |
| 空设备 | `/dev/null`（Git Bash 映射） | `/dev/null` |
| 进程列表 | `tasklist` | `ps aux` |
| 杀进程 | `taskkill /PID xxx /F` | `kill -9 xxx` |

### 1.3 大小写敏感性

Windows 文件系统不区分大小写，但 Linux（部署环境）区分。
- Import 路径必须与文件名大小写**完全一致**
- 示例：文件名 `ArticleCard.tsx`，import 必须是 `./ArticleCard`，不是 `./articleCard`

### 1.4 换行符

项目使用 `core.autocrlf = true`：
- 检出时 LF → CRLF
- 提交时 CRLF → LF

---

## 2. Docker 安全规则

### 2.1 前置检查（强制）

执行任何 Docker 操作前**必须**进行：

```bash
# 1. 检查冲突端口
netstat -ano | grep -E ":(3000|3001|3002|5432|6379|9000)" || true

# 2. 检查已有容器
docker ps -a --filter "name=law-eye" --format "{{.Names}}\t{{.Status}}"

# 3. 检查已有镜像
docker images --filter "reference=law-eye*" --format "{{.Repository}}:{{.Tag}}\t{{.Size}}"

# 4. 检查磁盘空间
docker system df
```

### 2.2 操作约束

- **禁止** `docker system prune -af`（会删除所有未使用的资源）
- **禁止**在未确认端口空闲时启动容器
- **禁止**重复构建相同镜像（先检查是否已存在）
- 使用 `docker compose` 而非 `docker-compose`（Compose V2）
- 容器命名必须带 `law-eye` 前缀以便识别

### 2.3 端口分配

| 端口 | 服务 | 说明 |
|---|---|---|
| 3000 | Next.js Web | 前端开发服务器 |
| 3001 | Rust API | 后端 API 服务 |
| 3002 | Worker | Worker 健康检查 |
| 5432 | PostgreSQL | 数据库 |
| 6379 | Redis | 缓存/队列 |
| 9000 | MinIO | 对象存储（可选） |

---

## 3. Node 进程管理

### 3.1 禁止操作

- **禁止** `killall node` 或 `taskkill /IM node.exe /F`（会杀死所有 Node 进程，包括 VSCode）
- **禁止** `pkill -f next` 无差别杀进程

### 3.2 正确做法

```bash
# 找到特定进程
netstat -ano | grep ":3000"
# 仅杀死目标 PID
taskkill /PID <具体PID> /F
```

---

## 4. 数据真实性策略

### 4.1 零 Mock 数据

- **严禁**在前端或后端使用 Mock 数据、硬编码数据或占位符数据
- 所有数据必须来自真实 API 调用
- 如果 API 尚未就绪，使用正确的 loading/error/empty 状态处理
- 测试数据通过数据库 seed 脚本或测试 fixture 提供，不在组件中硬编码

### 4.2 异常处理

- 网络请求必须处理 loading / error / empty 三种状态
- 使用 `EmptyState` 组件展示空数据状态
- 使用 `isLoading` / `isError` 条件渲染骨架屏或错误提示

---

## 5. 图标策略

### 5.1 强制使用 Lucide React

```typescript
import { FileText, Shield, BarChart3 } from "lucide-react";
```

### 5.2 禁止

- **禁止** Emoji 作为图标（`📊` `📝` `🔒`）
- **禁止** Phosphor Icons（原型专用，不进入生产代码）
- **禁止** Heroicons、Font Awesome 或其他图标库
- **禁止** Unicode 字符作为图标替代

---

## 6. Playwright 测试策略

### 6.1 复用策略

- 优先复用已有的 Playwright 配置（`apps/web/playwright.config.ts`）
- 不要创建新的 Playwright 配置文件
- 测试文件放在 `apps/web/tests/` 目录

### 6.2 运行约束

- 测试前确认开发服务器已启动
- 使用 `--project=chromium` 减少资源占用（不必跑所有浏览器）
- CI 中使用 `--reporter=list`，本地使用 `--reporter=html`

---

## 7. 磁盘空间保护

### 7.1 避免重复构建

```bash
# 构建前检查是否已有最新构建
ls -la apps/web/.next/BUILD_ID 2>/dev/null && echo "Build exists, skip rebuild"

# Docker 构建前检查
docker images law-eye-api --format "{{.CreatedAt}}" | head -1
```

### 7.2 清理策略

- 定期清理 Docker 悬空镜像：`docker image prune -f`
- 清理 node_modules 缓存：`pnpm store prune`
- 不要删除 `.next/cache`（增量构建依赖）

---

## 8. 多 Agent 冲突避免

### 8.1 文件锁定原则

- 同一时间只有一个 Agent 修改同一个文件
- 修改前先读取文件最新内容（`Read` 工具）
- 使用 `Edit` 工具而非 `Write` 工具修改已有文件

### 8.2 Git 工作流

- 不同 Agent 工作在不同文件或不同功能模块
- Agent 不自行 commit / push / merge
- 团队 lead 统一管理 Git 操作

### 8.3 端口避让

- 如果端口被占用，不要杀死占用进程
- 报告冲突，等待协调

---

## 9. Git 工作流

### 9.1 分支策略

```
main          ← 生产分支（保护）
  └── master  ← 开发主分支
      └── feature/xxx  ← 功能分支
```

### 9.2 Commit 约定

格式：`<type>(<scope>): <description>`

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `refactor` | 重构（无功能变化） |
| `test` | 测试 |
| `chore` | 构建/工具链 |
| `perf` | 性能优化 |

示例：
```
feat(web): add personalized feed page with role tier display
fix(api): correct channel visibility filtering for verified users
docs(spec): update ReBAC integration spec
```

### 9.3 Agent Git 限制

Agent（implement agent）**禁止**执行以下 Git 命令：
- `git commit`
- `git push`
- `git merge`
- `git rebase`
- `git reset --hard`

这些操作由团队 lead 或用户手动执行。

---

## 10. 测试要求

### 10.1 提交前检查（按顺序）

```bash
# 1. TypeScript 类型检查
cd apps/web && pnpm tsc --noEmit

# 2. ESLint
cd apps/web && pnpm lint

# 3. 单元测试
cd apps/web && pnpm test

# 4. Rust 检查（如修改了后端）
cargo check --workspace
cargo clippy --workspace -- -D warnings
```

### 10.2 测试文件约定

| 类型 | 位置 | 命名 |
|---|---|---|
| 单元测试 | 与源文件同目录 | `*.test.ts` / `*.test.tsx` |
| E2E 测试 | `apps/web/tests/` | `*.spec.ts` |
| Rust 测试 | `crates/*/tests/` | `*_tests.rs` |

---

## 11. 开发周期

### 11.1 Spec 驱动开发流程

```
1. 开发 (Develop)      — 按 spec 实现功能
2. 自验证 (Self-check)  — typecheck + lint + 功能检查
3. 审计 (Audit)         — 对照 spec 逐项确认
4. 重验证 (Re-verify)   — 修复审计发现的问题
5. 确认 (Confirm)       — 最终确认所有检查通过
6. 报告 (Report)        — 向团队 lead 报告实现结果
```

### 11.2 递归修复

- 修复完成后必须自行验证
- 如果验证失败，递归修复**至少 3 轮**
- 每轮修复后重新运行检查
- 3 轮后仍未通过则上报团队 lead

---

## 12. 代码质量约束

### 12.1 TypeScript

- 使用 Strict Mode
- 禁止 `any` 类型（使用 `unknown` + 类型守卫）
- 所有组件 props 使用 `interface` 定义
- React hooks 的依赖数组必须完整

### 12.2 Rust

- 所有 `clippy` 警告视为错误（`-D warnings`）
- 使用 `thiserror` 定义错误类型
- 数据库操作使用事务
- 所有公开函数需要文档注释

### 12.3 CSS / 样式

- 优先使用 Tailwind 工具类
- 自定义 CSS 仅用于 CSS 变量、关键帧动画、全局样式
- 颜色/圆角/阴影必须使用设计系统 token
- 禁止内联 `style` 属性（除非动态计算值）

---

## 13. 安全约束

- 不提交 `.env` 文件或含有密钥的文件
- API 密钥、数据库 URL 等通过环境变量注入
- 前端不存储敏感数据（token 通过 httpOnly cookie 管理）
- 所有用户输入在后端验证（Schema validation）
- SQL 查询使用参数化（`$1, $2` 绑定），禁止字符串拼接
