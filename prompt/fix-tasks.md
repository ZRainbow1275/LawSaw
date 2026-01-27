# LawSaw 修复任务文档

**生成日期**：2026-01-27
**审计轮次**：第十轮（共十轮）
**审计基线**：Git `ff93975`
**通过率**：38/40（95%）

---

## 📋 待修复任务清单

### 🔴 必须修复（CRITICAL）

#### [FE-MOBILE-601] 移动端侧边栏不自动收起

**优先级**：HIGH
**影响范围**：移动端用户体验
**复现条件**：视口宽度 ≤ 768px（如 iPhone 13: 390x844）

**问题描述**：
在移动端视口下，侧边栏默认展开状态，占用大量屏幕空间，导致主内容区域被遮挡。用户需要手动点击"收起菜单"按钮才能查看主内容。

**当前行为**：
- 移动端（390x844）打开页面时，侧边栏宽度为 280px（展开状态）
- 显示完整导航菜单和"收起菜单"按钮
- 主内容区域被严重压缩

**期望行为**：
- 移动端（视口宽度 ≤ 768px）时，侧边栏应默认收起（collapsed = true）
- 侧边栏收起时宽度为 64px（仅显示图标）
- 用户可点击展开按钮临时查看完整菜单

**涉及文件**：

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `apps/web/src/stores/sidebar-store.ts` | 修改 | 添加响应式初始化逻辑 |
| `apps/web/src/components/layout/sidebar.tsx` | 修改 | 添加视口变化监听 |

**修复方案**：

##### 方案 A：Store 层响应式初始化（推荐）

**步骤 1**：修改 `apps/web/src/stores/sidebar-store.ts`

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

// 检测是否为移动端视口
const isMobileViewport = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 768;
};

interface SidebarState {
  collapsed: boolean;
  readerMode: boolean;
  hovered: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
  setReaderMode: (readerMode: boolean) => void;
  setHovered: (hovered: boolean) => void;
  // 新增：根据视口同步收起状态
  syncWithViewport: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      // 移动端默认收起
      collapsed: isMobileViewport(),
      readerMode: false,
      hovered: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setReaderMode: (readerMode) => set({ readerMode }),
      setHovered: (hovered) => set({ hovered }),
      // 新增：响应视口变化
      syncWithViewport: () => {
        if (isMobileViewport()) {
          set({ collapsed: true });
        }
      },
    }),
    {
      name: "law-eye-sidebar",
      partialize: (state) => ({ collapsed: state.collapsed }),
      // 关键：hydrate 后根据当前视口覆盖持久化状态
      onRehydrateStorage: () => (state) => {
        if (state && isMobileViewport()) {
          state.setCollapsed(true);
        }
      },
    },
  ),
);
```

**步骤 2**：修改 `apps/web/src/components/layout/sidebar.tsx`

在 `Sidebar` 组件中添加视口变化监听：

```typescript
// 在组件顶部导入
import { useEffect } from "react";

// 在 Sidebar 组件内部添加
export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle, setCollapsed, syncWithViewport } = useSidebarStore();
  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data ?? [];
  const categoryCount = categories.length;

  // 新增：监听视口变化，移动端自动收起
  useEffect(() => {
    const MOBILE_BREAKPOINT = 768;

    const handleResize = () => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) {
        setCollapsed(true);
      }
    };

    // 初始化时同步
    handleResize();

    // 监听 resize 事件
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setCollapsed]);

  // ... 其余代码保持不变
}
```

**验证步骤**：

1. 启动前端开发服务器：`pnpm -C apps/web dev`
2. 打开 Chrome DevTools → Toggle Device Toolbar
3. 选择 iPhone 13（390x844）或自定义 ≤768px 宽度
4. 访问 `http://localhost:8849/`
5. 验证：
   - [ ] 侧边栏默认收起（宽度 64px）
   - [ ] 仅显示图标，不显示文字
   - [ ] 点击展开按钮可临时展开
   - [ ] 切换到桌面视口（>768px）后，侧边栏状态恢复用户偏好

**测试命令**：
```bash
# 类型检查
pnpm -C apps/web typecheck

# Lint 检查
pnpm -C apps/web lint

# 构建验证
pnpm -C apps/web build
```

---

### 🟡 设计行为说明（无需代码修复）

#### [METRICS-601] /metrics 端点返回 404

**状态**：设计行为，非缺陷

**说明**：
- 非生产环境：`/metrics` 默认开放
- 生产环境：需设置 `LAW_EYE__METRICS__TOKEN` 环境变量
- 未配置 TOKEN 时返回 404（防止指标泄露）

**配置方式**：
```bash
# .env 或 docker-compose.yml
LAW_EYE__METRICS__TOKEN=your-secure-metrics-token
```

**访问方式**：
```bash
curl -H "Authorization: Bearer your-secure-metrics-token" http://localhost:3001/metrics
```

---

## 📊 审计总结

### 通过的维度（38/40）

| 维度 | 状态 |
|------|------|
| 1. 前端功能设计实现 | ✅ |
| 2. 后端连通设计 | ✅ |
| 3. 路由与导航设计 | ✅ |
| 4. 移动端适配 | ⚠️ FE-MOBILE-601 |
| 5. 离线支持与PWA | ✅ |
| 6. 状态同步与冲突解决 | ✅ |
| 7. 运维功能 | ✅ |
| 8. 业务流完整 | ✅ |
| 9. 服务设置合理 | ✅ |
| 10. 代码结构审查 | ✅ |
| 11. 性能 | ✅ |
| 12. 可访问 | ✅ |
| 13. 依赖项健康度 | ✅ |
| 14. 数据库设计 | ✅ |
| 15. API设计完备性/一致性 | ✅ |
| 16. 错误处理与日志 | ✅ |
| 17. 业务逻辑完整性 | ✅ |
| 18. 国际化/本地化 | ✅ |
| 19. 代码可维护性 | ✅ |
| 20. 身份颗粒度对齐 | ✅ |
| 21. 并发异步消息队列 | ✅ |
| 22. 数据一致性完整性同步性 | ✅ |
| 23. 通讯延迟与同步链路 | ✅ |
| 24. 可靠发布 | ✅ |
| 25. 数据同步幂等 | ✅ |
| 26. 顺序性与事件 | ✅ |
| 27. 跨模块一致性 | ✅ |
| 28. 结构化收缩 | ✅ |
| 29. 对象存储+元数据表 | ✅ |
| 30. 在线预览异步化 | ✅ |
| 31. 版本管理 | ✅ |
| 32. 全链路 HTTPS/TLS | ✅ |
| 33. 秘钥与配置 KMS | ✅ |
| 34. 租户隔离 | ✅ |
| 35. 数据加密 | ✅ |
| 36. 审计日志不可篡改 | ✅ |
| 37. 权限变更审计 | ✅ |
| 38. 操作审计 | ✅ |
| 39. 可预测性与故障处理 | ✅ |
| 40. 集成与扩展 | ✅ |

### 关键验证数据

| 指标 | 值 |
|------|-----|
| 文章总数 | 119 |
| 活跃信息源 | 6 |
| 待处理 | 118 |
| 已发布 | 1 |
| 板块数量 | 10 |
| 搜索结果（Trump） | 17 条，ts_rank 真实分数 |
| 健康检查 | PostgreSQL ✅ Redis ✅ |

---

## 🔧 Codex CLI 执行指令

```bash
# 修复 FE-MOBILE-601
codex "根据 prompt/fix-tasks.md 中的方案 A 修复移动端侧边栏问题。
修改 apps/web/src/stores/sidebar-store.ts 添加响应式初始化逻辑，
修改 apps/web/src/components/layout/sidebar.tsx 添加视口变化监听。
完成后运行 pnpm -C apps/web typecheck && pnpm -C apps/web lint && pnpm -C apps/web build 验证。"
```

---

**文档版本**：v1.0
**生成工具**：Claude Code 第十轮审计
