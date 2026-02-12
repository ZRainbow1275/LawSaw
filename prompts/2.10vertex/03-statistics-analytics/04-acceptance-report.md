# 命题三：统计功能实现 — 验收报告

> **状态**: 实施完成 / 编译通过
> **日期**: 2026-02-12

---

## 一、交付物清单

### 1. 后端 — AI 评估器层 (law-eye-ai)

| 文件 | 功能 | 行数 |
|------|------|------|
| `crates/law-eye-ai/src/importance.rs` | ImportanceAssessor — 规则化重要性评分 (1-5) | 134 |
| `crates/law-eye-ai/src/domain.rs` | DomainClassifier — 领域分类 (8+N 领域) | ~200 |
| `crates/law-eye-ai/src/authority.rs` | AuthorityDetector — 权威等级检测 (1-10) | ~135 |

**AI Pipeline 集成**: `service.rs` 已更新，`ArticleAiResult` 新增 importance/domain_root/domain_sub/authority_level 字段。

### 2. 后端 — 统计服务层 (law-eye-core)

| 文件 | 功能 | 行数 |
|------|------|------|
| `crates/law-eye-core/src/statistics.rs` | 完整 StatisticsService | 871 |

包含：
- 34 省级行政区 REGION_MAP (GB/T 2260)
- 8 大法律领域 label 映射
- 10 级权威等级 label 映射
- 7 个聚合查询方法 (regional/industry/importance/authority/issuer/cross/timeline)
- 1 个 overview 聚合方法
- 完整的数据类型定义

### 3. 后端 — API 路由层 (law-eye-api)

| 文件 | 功能 | 行数 |
|------|------|------|
| `crates/law-eye-api/src/routes/statistics/mod.rs` | 路由定义 + utoipa 注解 | 218 |
| `crates/law-eye-api/src/routes/statistics/handlers.rs` | Handler 实现 | ~200 |
| `crates/law-eye-api/src/routes/statistics/dto.rs` | DTO + ToSchema | ~120 |

**8 个 API 端点**:
1. `GET /api/v1/statistics/regional` — 地域分布
2. `GET /api/v1/statistics/industry` — 行业分布 (含二级下钻)
3. `GET /api/v1/statistics/importance` — 重要性分布
4. `GET /api/v1/statistics/authority` — 权威等级分布
5. `GET /api/v1/statistics/issuer` — 发布机构排名
6. `GET /api/v1/statistics/cross` — 交叉维度分析
7. `GET /api/v1/statistics/timeline` — 多维度时序分析
8. `GET /api/v1/statistics/overview` — 统计覆盖率概要

### 4. 前端 — 统计 Hooks

| 文件 | 功能 | 行数 |
|------|------|------|
| `apps/web/src/hooks/use-statistics.ts` | 7 个 SWR hooks + 完整类型 | 236 |

### 5. 前端 — 统计可视化组件 (18 个文件)

| 分组 | 组件 | 功能 |
|------|------|------|
| **Tab 导航** | analytics-tabs.tsx | 5 Tab 切换 |
| **常量** | constants.ts | 颜色/标签映射 |
| **概览 (3)** | risk-distribution-chart.tsx | recharts 风险条形图 |
| | sentiment-chart.tsx | recharts 情感条形图 |
| | trend-chart.tsx | recharts 趋势面积图 |
| **地域 (3)** | china-map.tsx | ECharts 中国地图热力图 |
| | region-ranking-table.tsx | 省份排名表格 |
| | regional-panel.tsx | 地域分析面板容器 |
| **行业 (3)** | domain-pie-chart.tsx | recharts 领域饼图 |
| | domain-bar-chart.tsx | recharts 领域条形图 |
| | industry-panel.tsx | 行业分析面板容器 |
| **重要性 (4)** | importance-bar-chart.tsx | recharts 重要性条形图 |
| | authority-chart.tsx | recharts 权威等级条形图 |
| | issuer-ranking.tsx | 发布机构排名表格 |
| | importance-panel.tsx | 重要性面板容器 |
| **交叉 (3)** | cross-heatmap.tsx | ECharts 交叉热力图 |
| | timeline-chart.tsx | recharts 多维度时序线图 |
| | cross-panel.tsx | 交叉分析面板容器 |

### 6. 页面升级

`apps/web/src/app/analytics/page.tsx` — Tab 布局重构 (521 行):
- **Overview** tab: 保留原有功能，CSS 图表升级为 recharts
- **Regional** tab: 中国地图 + 省份排名
- **Industry** tab: 领域分布饼图 + 条形图
- **Importance** tab: 重要性/权威等级/发布机构
- **Cross-Analysis** tab: 交叉维度 + 时序分析

---

## 二、编译验证

| 检查项 | 结果 |
|--------|------|
| `cargo check` (Rust 后端) | **通过** (0 errors) |
| `tsc --noEmit` (TypeScript 前端) | **通过** (0 errors) |
| Unused imports | 已清理 (cargo fix) |
| Recharts 类型兼容性 | 已修复 (4 处 Tooltip formatter) |

---

## 三、前一轮AI遗留问题修复

| 问题 | 状态 |
|------|------|
| `importance` 字段空壳 — 无计算逻辑 | **已修复**: ImportanceAssessor 实现 |
| `domain_root/domain_sub` 无填充 | **已修复**: DomainClassifier 实现 |
| `authority_level` 无填充 | **已修复**: AuthorityDetector 实现 |
| `region_code` 无聚合统计 | **已修复**: regional API + 中国地图 |
| recharts 已安装未使用 | **已修复**: 全面启用 |
| CSS 手动图表视觉效果差 | **已修复**: 迁移到 recharts 交互图表 |
| Analytics 页面功能单一 | **已修复**: 5 Tab 布局 |
| OpenAPI 缺少统计端点 | **已修复**: 8 端点全部注册 |

---

## 四、新增依赖

| 包 | 版本 | 用途 |
|----|------|------|
| echarts | latest | ECharts 核心 (地图/热力图) |
| echarts-for-react | latest | ECharts React wrapper |

---

## 五、架构决策记录

1. **统计路由独立模块** — `/api/v1/statistics/*` 而非混入 `/articles/*`，遵循关注点分离
2. **权限复用** — 统计端点复用 `articles:read` 权限，无需新增权限类型
3. **租户隔离** — 所有查询第一参数为 `tenant_id`，保持 RLS 一致性
4. **实时聚合** — 初期使用实时 GROUP BY，数据量增长后可引入物化视图
5. **ECharts 地图** — 运行时从 CDN 加载 GeoJSON，避免 bundle 膨胀
6. **recharts + ECharts 共存** — recharts 用于标准图表，ECharts 用于地图/热力图
