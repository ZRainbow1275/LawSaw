# Phase 3: 前端可视化设计 — 中国地图 + recharts + 统计面板

> 前端交付：从数据到可视化的完整体验

---

## 1. 技术选型

| 库 | 用途 | 状态 |
|----|------|------|
| recharts ^2.15.0 | 条形图/饼图/折线图/雷达图 | 已安装，待启用 |
| echarts-for-react | 中国地图热力图 | **需安装** |
| echarts | ECharts 核心 | **需安装** (echarts-for-react 的 peer dep) |

### 安装命令

```bash
cd apps/web && pnpm add echarts echarts-for-react
```

---

## 2. 页面结构改造

### 2.1 Analytics 页面 Tab 布局

```
/analytics
├── Tab: 概览 (Overview)        -- 保留现有内容，升级图表
├── Tab: 地域分析 (Regional)    -- 新增：中国地图 + 省份排名
├── Tab: 行业分析 (Industry)    -- 新增：领域分布 + 下钻
├── Tab: 重要性 (Importance)    -- 新增：重要性分布 + 权威等级
└── Tab: 交叉分析 (Cross)       -- 新增：多维度交叉矩阵
```

### 2.2 组件树

```
apps/web/src/
├── app/analytics/
│   └── page.tsx                          // 主页面 (Tab 容器)
├── components/statistics/
│   ├── analytics-tabs.tsx                // Tab 导航组件
│   ├── overview/
│   │   ├── stats-overview-panel.tsx      // 概览面板 (升级现有)
│   │   ├── risk-distribution-chart.tsx   // recharts 风险分布
│   │   ├── sentiment-chart.tsx           // recharts 情感分布
│   │   └── trend-chart.tsx              // recharts 趋势图
│   ├── regional/
│   │   ├── china-map.tsx                // ECharts 中国地图
│   │   ├── region-ranking-table.tsx     // 省份排名表格
│   │   └── regional-panel.tsx           // 地域分析面板
│   ├── industry/
│   │   ├── domain-pie-chart.tsx         // recharts 领域饼图
│   │   ├── domain-drilldown.tsx         // 二级领域下钻
│   │   └── industry-panel.tsx           // 行业分析面板
│   ├── importance/
│   │   ├── importance-bar-chart.tsx     // recharts 重要性条形图
│   │   ├── authority-chart.tsx          // 权威等级分布
│   │   ├── issuer-ranking.tsx           // 发布机构排名
│   │   └── importance-panel.tsx         // 重要性面板
│   └── cross/
│       ├── cross-heatmap.tsx            // 交叉维度热力图
│       ├── timeline-chart.tsx           // 多维度时序图
│       └── cross-panel.tsx              // 交叉分析面板
└── hooks/
    └── use-statistics.ts                // 统计 API hooks
```

---

## 3. Hooks 设计

### 3.1 `hooks/use-statistics.ts`

```typescript
import useSWR from "swr";
import { apiFetch } from "@/lib/api/client";

// --- 类型定义 ---
export interface RegionalCount {
  region_code: string;
  region_name: string;
  count: number;
  percentage: number;
}

export interface RegionalDistribution {
  items: RegionalCount[];
  total: number;
  coverage_rate: number;
}

export interface DomainCount {
  domain_root: string;
  domain_sub: string | null;
  label: string;
  count: number;
  percentage: number;
  sub_domains: { domain_sub: string; label: string; count: number }[] | null;
}

export interface IndustryDistribution {
  items: DomainCount[];
  total: number;
  coverage_rate: number;
}

export interface ImportanceDistribution {
  levels: [number, number, number, number, number];
  total: number;
  average: number;
  coverage_rate: number;
}

export interface AuthorityLevelCount {
  level: number;
  label: string;
  count: number;
  percentage: number;
}

export interface AuthorityDistribution {
  levels: AuthorityLevelCount[];
  total: number;
  coverage_rate: number;
}

export interface IssuerCount {
  issuer: string;
  count: number;
  percentage: number;
}

export interface IssuerDistribution {
  items: IssuerCount[];
  total: number;
  unique_issuers: number;
}

export interface CrossDimensionalCell {
  x_value: string;
  y_value: string;
  count: number;
}

export interface CrossDimensionalResult {
  dimension_x: string;
  dimension_y: string;
  cells: CrossDimensionalCell[];
}

export interface TimelinePoint {
  date: string;
  count: number;
}

export interface TimelineSeries {
  dimension_value: string;
  label: string;
  points: TimelinePoint[];
}

export interface TimelineByDimension {
  dimension: string;
  granularity: string;
  series: TimelineSeries[];
}

// --- Hooks ---
export function useRegionalStats(params?: { dateFrom?: string; dateTo?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params?.dateTo) searchParams.set("date_to", params.dateTo);
  const qs = searchParams.toString();

  return useSWR<RegionalDistribution>(
    `/api/v1/statistics/regional${qs ? `?${qs}` : ""}`,
    apiFetch
  );
}

export function useIndustryStats(params?: { includeSub?: boolean }) {
  const qs = params?.includeSub ? "?include_sub=true" : "";
  return useSWR<IndustryDistribution>(
    `/api/v1/statistics/industry${qs}`,
    apiFetch
  );
}

export function useImportanceStats() {
  return useSWR<ImportanceDistribution>(
    "/api/v1/statistics/importance",
    apiFetch
  );
}

export function useAuthorityStats() {
  return useSWR<AuthorityDistribution>(
    "/api/v1/statistics/authority",
    apiFetch
  );
}

export function useIssuerStats(limit?: number) {
  const qs = limit ? `?limit=${limit}` : "";
  return useSWR<IssuerDistribution>(
    `/api/v1/statistics/issuer${qs}`,
    apiFetch
  );
}

export function useCrossDimensional(dimX: string, dimY: string) {
  return useSWR<CrossDimensionalResult>(
    `/api/v1/statistics/cross?dim_x=${dimX}&dim_y=${dimY}`,
    apiFetch
  );
}

export function useTimelineByDimension(
  dimension: string,
  granularity: string = "daily",
  days: number = 30,
  topN: number = 5
) {
  return useSWR<TimelineByDimension>(
    `/api/v1/statistics/timeline?dimension=${dimension}&granularity=${granularity}&days=${days}&top_n=${topN}`,
    apiFetch
  );
}
```

---

## 4. 中国地图组件设计

### 4.1 `components/statistics/regional/china-map.tsx`

```tsx
"use client";

import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import chinaGeo from "./china-geo.json"; // 中国 GeoJSON

// 注册地图
echarts.registerMap("china", chinaGeo as any);

interface ChinaMapProps {
  data: Array<{ name: string; value: number }>;
  title?: string;
}

export function ChinaMap({ data, title }: ChinaMapProps) {
  const option = {
    title: { text: title, left: "center" },
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} 篇",
    },
    visualMap: {
      min: 0,
      max: Math.max(...data.map(d => d.value), 1),
      left: "left",
      top: "bottom",
      text: ["高", "低"],
      inRange: {
        color: [
          "#e0f3f8", "#abd9e9", "#74add1",
          "#4575b4", "#313695",
        ],
      },
    },
    series: [
      {
        name: "文章数",
        type: "map",
        map: "china",
        roam: true,
        label: { show: true, fontSize: 8 },
        data: data,
        emphasis: {
          label: { show: true, fontSize: 12 },
          itemStyle: { areaColor: "#ffd700" },
        },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: "500px", width: "100%" }}
      notMerge
    />
  );
}
```

### 4.2 GeoJSON 获取方案

不嵌入大型 GeoJSON 到 bundle：
- 使用 ECharts 官方 CDN 注册: `$.getJSON("https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json")`
- 或在 `public/geo/china.json` 放置精简版 GeoJSON (约 200KB)
- 动态 import 避免首屏加载

---

## 5. recharts 图表升级

### 5.1 风险分布 → recharts BarChart

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const RISK_COLORS = {
  unknown: "#a3a3a3",
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

export function RiskDistributionChart({ data }: { data: ArticleRiskCounts }) {
  const chartData = Object.entries(data).map(([key, value]) => ({
    name: key,
    count: value,
    fill: RISK_COLORS[key as keyof typeof RISK_COLORS],
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count">
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 5.2 重要性分布 → recharts PieChart

```tsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const IMPORTANCE_LABELS = ["一般资讯", "地方性", "行业性", "部委级", "国家级"];
const IMPORTANCE_COLORS = ["#94a3b8", "#60a5fa", "#34d399", "#f59e0b", "#ef4444"];

export function ImportanceDistributionChart({ levels }: { levels: number[] }) {
  const data = levels.map((count, i) => ({
    name: IMPORTANCE_LABELS[i],
    value: count,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%">
          {data.map((_, i) => (
            <Cell key={i} fill={IMPORTANCE_COLORS[i]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### 5.3 多维度时序图 → recharts LineChart

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

const DIMENSION_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

export function TimelineMultiDimensionChart({ series }: { series: TimelineSeries[] }) {
  // 将 series 转换为 recharts 需要的格式
  const allDates = new Set<string>();
  for (const s of series) {
    for (const p of s.points) allDates.add(p.date);
  }

  const chartData = [...allDates].sort().map(date => {
    const point: Record<string, string | number> = { date };
    for (const s of series) {
      const match = s.points.find(p => p.date === date);
      point[s.dimension_value] = match?.count ?? 0;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Line
            key={s.dimension_value}
            type="monotone"
            dataKey={s.dimension_value}
            name={s.label}
            stroke={DIMENSION_COLORS[i % DIMENSION_COLORS.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

---

## 6. 交叉分析热力图

使用 ECharts 的 heatmap 类型：

```tsx
export function CrossDimensionalHeatmap({ data, xLabels, yLabels }: Props) {
  const option = {
    tooltip: { position: "top" },
    grid: { top: "10%", left: "15%", right: "10%", bottom: "15%" },
    xAxis: { type: "category", data: xLabels, axisLabel: { rotate: 45 } },
    yAxis: { type: "category", data: yLabels },
    visualMap: {
      min: 0,
      max: Math.max(...data.map(d => d.count)),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: "0%",
    },
    series: [{
      type: "heatmap",
      data: data.map(d => [
        xLabels.indexOf(d.x_value),
        yLabels.indexOf(d.y_value),
        d.count,
      ]),
      label: { show: true },
    }],
  };

  return <ReactECharts option={option} style={{ height: "400px" }} />;
}
```

---

## 7. 响应式和国际化

- 所有文本通过 `useT()` 国际化
- 地图组件在移动端自动缩放
- 图表使用 `ResponsiveContainer` 自适应
- Tab 在移动端折叠为下拉菜单
