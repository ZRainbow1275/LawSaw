# 地图与可视化组件规范

> 最后更新: 2026-03-22
> 参考原型: `prototype/app.html` 第 2125-2384 行
> 库依赖: ECharts 5.5.0+

---

## 1. 整体架构

Dashboard 可视化区域由一个暗色卡片容器承载，内含两个可切换视图：

```
viz-card (暗色背景)
├── viz-header (选项卡切换)
│   ├── 地图视图 tab (默认激活)
│   ├── 行业分析 tab
│   └── 返回世界地图按钮 (仅中国钻取时显示)
└── viz-body
    ├── map-view (ECharts 世界地图 / 中国热力图)
    └── industry-view (ECharts 行业分析图表)
```

### 容器样式

```css
background: linear-gradient(145deg, #0B1120, #111827);
border-radius: var(--radius-xl);  /* 1rem */
box-shadow: 0 4px 24px rgba(0,0,0,0.15);
/* 装饰性径向渐变 */
background-overlay: radial-gradient(ellipse at 30% 20%, rgba(255,107,53,0.04) 0%, transparent 60%);
```

### 选项卡样式

```css
默认: color rgba(255,255,255,0.4), font-size 13px, font-weight 600
hover: color rgba(255,255,255,0.8)
active: color #ff6b35 (primary-500), border-bottom 2px solid #ff6b35
```

---

## 2. 世界地图配置

### 2.1 GeoJSON 数据源

```
世界地图: https://fastly.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json
中国地图: https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
```

**注意**: GeoJSON 文件应在首次加载后缓存，避免重复请求。

### 2.2 世界地图 ECharts 选项

```javascript
{
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: {
      color: '#E2E8F0',
      fontSize: 12,
      fontFamily: 'Inter, Noto Sans SC, sans-serif'
    }
  },
  geo: {
    map: 'world',
    roam: true,
    zoom: 1.5,
    center: [60, 20],
    itemStyle: {
      areaColor: '#1a2332',
      borderColor: 'rgba(255,255,255,0.06)',
      borderWidth: 0.5
    },
    emphasis: {
      itemStyle: { areaColor: '#243447' },
      label: { show: true, color: '#fff', fontSize: 11 }
    },
    regions: [{
      name: 'China',
      itemStyle: { areaColor: '#2a1f15' },
      emphasis: { itemStyle: { areaColor: '#3d2a18' } }
    }]
  }
}
```

### 2.3 热点标记 (effectScatter)

预设热点城市坐标：

| 城市 | 经度 | 纬度 | 示例数值 |
|---|---|---|---|
| 北京 | 116.4 | 39.9 | 42 |
| 华盛顿 | -77.0 | 38.9 | 18 |
| 布鲁塞尔 | 4.35 | 50.85 | 27 |
| 东京 | 139.7 | 35.7 | 15 |
| 新加坡 | 103.8 | 1.35 | 12 |
| 伦敦 | -0.12 | 51.5 | 14 |
| 圣保罗 | -46.6 | -23.5 | 8 |
| 悉尼 | 151.2 | -33.9 | 9 |

```javascript
{
  type: 'effectScatter',
  coordinateSystem: 'geo',
  symbolSize: v => Math.max(8, v[2] / 3),
  rippleEffect: { brushType: 'stroke', scale: 4, period: 3 },
  showEffectOn: 'render',
  label: {
    show: true,
    formatter: '{b}',
    position: 'right',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: 500
  },
  itemStyle: { color: '#FF5A36' },
  zlevel: 2
}
```

### 2.4 数据流弧线 (lines)

```javascript
{
  type: 'lines',
  coordinateSystem: 'geo',
  lineStyle: {
    color: '#FF5A36',
    width: 1.2,
    opacity: 0.3,
    curveness: 0.3
  },
  effect: {
    show: true,
    period: 5,
    trailLength: 0.3,
    symbol: 'circle',
    symbolSize: 4,
    color: '#FF8A66'
  },
  zlevel: 1
}
```

预设连线：
```
北京 → 华盛顿
北京 → 布鲁塞尔
北京 → 东京
华盛顿 → 布鲁塞尔
北京 → 新加坡
```

实际数据应从后端 API 获取文章的地域分布统计。

---

## 3. 中国钻取热力图

### 3.1 触发条件

- 用户在世界地图上点击 "China" 区域
- `currentMapLevel` 从 `'world'` 切换为 `'china'`
- 显示"返回世界"按钮

### 3.2 省份名称（必须含完整后缀）

GeoJSON 匹配要求省份名称包含完整行政区划后缀：

```
北京市, 上海市, 天津市, 重庆市,
广东省, 浙江省, 江苏省, 山东省, 四川省, 湖北省,
福建省, 河南省, 安徽省, 湖南省, 河北省, 辽宁省,
陕西省, 云南省, 贵州省, 江西省, 黑龙江省, 吉林省,
甘肃省, 海南省, 青海省, 山西省,
广西壮族自治区, 内蒙古自治区,
新疆维吾尔自治区, 西藏自治区, 宁夏回族自治区,
香港特别行政区, 澳门特别行政区
```

**注意**: 使用简称（如"广东"而非"广东省"）会导致热力图匹配失败。

### 3.3 热力图配置

```javascript
{
  visualMap: {
    min: 0,
    max: 90,
    show: true,
    left: 16,
    bottom: 16,
    text: ['高', '低'],
    textStyle: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
    inRange: {
      color: [
        '#1a2332',   // 最低 - 深蓝灰
        '#2a1f15',   // 低
        '#4a2a10',   // 中低
        '#8B3A0F',   // 中
        '#CC4A1F',   // 中高
        '#FF5A36',   // 高 (primary-600 近似)
        '#FF8A66'    // 最高
      ]
    },
    calculable: true,
    orient: 'vertical',
    itemWidth: 12,
    itemHeight: 100
  },
  series: [{
    type: 'map',
    map: 'china',
    roam: true,
    zoom: 1.2,
    label: {
      show: true,
      color: 'rgba(255,255,255,0.4)',
      fontSize: 9
    },
    itemStyle: {
      areaColor: '#1a2332',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1
    },
    emphasis: {
      label: { show: true, color: '#fff', fontSize: 12, fontWeight: 'bold' },
      itemStyle: { areaColor: '#3d2a18' }
    },
    select: {
      label: { show: true },
      itemStyle: { areaColor: '#4a2a10' }
    }
  }]
}
```

---

## 4. 地图弹出卡片系统

### 4.1 触发事件

| 地图级别 | 事件类型 | 触发条件 |
|---|---|---|
| 世界地图 | `effectScatter` 点击 | 点击城市热点标记 |
| 世界地图 | `geo` 点击 (China) | 进入中国钻取 |
| 世界地图 | `geo` 点击 (其他国家) | 显示该国文章弹窗 |
| 中国地图 | `map` 点击 | 点击省份显示文章弹窗 |

### 4.2 弹窗组件结构

```html
<div class="map-popup">
  <!-- 头部 -->
  <div class="popup-header">
    <span class="popup-region">北京市</span>        <!-- 地区名称 -->
    <span class="popup-count">42 条</span>           <!-- 文章数量 pill -->
    <button class="popup-close">x</button>            <!-- 关闭按钮 -->
  </div>

  <!-- 文章列表（可滚动，max-height 260px） -->
  <div class="popup-body">
    <div class="popup-article">
      <span class="popup-cat-dot" style="background:#3498db"></span>  <!-- 分类色点 -->
      <div class="popup-article-info">
        <div class="popup-article-title">文章标题</div>
        <div class="popup-article-meta">
          <span>立法前沿</span>
          <span>5小时前</span>
          <span style="color:#c62828">高风险</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 底部 -->
  <div class="popup-footer">
    <button class="popup-view-all">查看该地区全部资讯 →</button>
  </div>
</div>
```

### 4.3 弹窗样式

```css
position: absolute;
z-index: 300;
background: white;
border: 1px solid var(--neutral-200);
border-radius: var(--radius-xl);
box-shadow: 0 16px 48px rgba(0,0,0,0.18);
width: 340px;
max-height: 400px;
/* 定位在可视化卡片右上区域 */
top: 60px;
right: 20px;
/* 入场动画 */
animation: popup-in 0.25s ease;
```

### 4.4 数据来源

实际开发中，弹窗文章列表应从后端 API 获取：

```
GET /api/v1/articles?region={region_name}&limit=5&sort=published_at:desc
```

返回字段需包含：`title`, `category_name`, `category_color`, `published_at`, `risk_level`

---

## 5. 行业分析图表

### 5.1 双面板布局

行业分析视图使用 ECharts 的多 grid 布局：

```
左侧 (44% 宽): 趋势折线图（监管动向 + 业界资讯）
右侧 (40% 宽): 热门领域横向柱状图
```

### 5.2 折线图配置

```javascript
// 监管动向 线条
{
  name: '监管动向',
  type: 'line',
  smooth: true,
  lineStyle: { width: 2, color: '#FF5A36' },
  itemStyle: { color: '#FF5A36' },
  areaStyle: {
    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(255,90,54,0.2)' },
      { offset: 1, color: 'rgba(255,90,54,0)' }
    ])
  },
  symbol: 'circle',
  symbolSize: 4
}

// 业界资讯 线条
{
  name: '业界资讯',
  type: 'line',
  smooth: true,
  lineStyle: { width: 2, color: '#3B82F6' },
  itemStyle: { color: '#3B82F6' },
  areaStyle: {
    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: 'rgba(59,130,246,0.15)' },
      { offset: 1, color: 'rgba(59,130,246,0)' }
    ])
  },
  symbol: 'circle',
  symbolSize: 4
}
```

### 5.3 横向柱状图配置

```javascript
{
  name: '排行',
  type: 'bar',
  barWidth: 18,
  itemStyle: {
    borderRadius: [0, 6, 6, 0],
    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: 'rgba(255,90,54,0.3)' },
      { offset: 1, color: '#FF5A36' }
    ])
  },
  label: {
    show: true,
    position: 'right',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: 600
  }
}
```

### 5.4 暗色主题全局配置

```javascript
{
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, Noto Sans SC, sans-serif' },
  tooltip: {
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderColor: 'rgba(255,255,255,0.1)',
    textStyle: { color: '#E2E8F0', fontSize: 12 }
  },
  // 坐标轴
  axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
  axisLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  splitLine: { lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.04)' } }
}
```

---

## 6. 时间段筛选器

### 6.1 选项

| 按钮文本 | 值 | 数据范围 |
|---|---|---|
| 今日 | `day` | 最近 24 小时 |
| 本周 | `week` | 最近 7 天 |
| 本月 | `month` | 最近 30 天 |
| 全年 | `year` | 最近 365 天 |

### 6.2 滑块样式

```css
.time-filters {
  display: flex;
  background: white;
  border-radius: var(--radius-sm);
  border: 1px solid var(--neutral-200);
  overflow: hidden;
  position: relative;
}

.time-btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--neutral-500);
  /* active 状态: color: white */
}

.time-slider {
  position: absolute;
  background: var(--primary-500);  /* #ff6b35 */
  border-radius: 6px;
  transition: all 400ms cubic-bezier(0.25, 0.8, 0.25, 1);
  top: 3px; bottom: 3px;
  /* left/width 通过 JS 计算当前活跃按钮位置 */
}
```

### 6.3 行为

- 切换时间段后，地图热点数值和行业图表数据应重新从 API 获取
- 滑块动画使用 CSS transition 跟随当前激活按钮
- X 轴标签根据时间段自动调整（日→小时，周→星期，月→日期，年→月份）

---

## 7. 地理筛选器

### 7.1 区域层级

```
全球 → 亚太 → 欧洲 → 北美 → 其他
       └── 中国 → 北京 → 上海 → 广东 → ...
```

### 7.2 筛选 Pill 样式

```css
.geo-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--neutral-200);
  background: white;
  color: var(--neutral-600);
}

.geo-chip.active {
  background: var(--neutral-800);  /* #343a40 */
  color: white;
  border-color: var(--neutral-800);
}
```

### 7.3 行为

- 选择地区后过滤 feed 中的文章（联动下方文章列表）
- 地图视图同步聚焦到选定区域
- API 调用示例：`GET /api/v1/articles?region=asia-pacific&limit=20`

---

## 8. 响应式与交互约束

### 8.1 ECharts 实例管理

```javascript
// 初始化时检查实例是否已存在
if (!mapChart) {
  mapChart = echarts.init(document.getElementById('mapChart'));
}

// 窗口 resize 处理
window.addEventListener('resize', () => mapChart && mapChart.resize());

// 选项卡切换后延迟 resize
setTimeout(() => industryChart && industryChart.resize(), 50);
```

### 8.2 内存管理

- 切换视图时不销毁 ECharts 实例，仅隐藏 DOM
- 页面卸载时调用 `chart.dispose()` 释放资源
- React 组件使用 `useEffect` 清理函数管理生命周期

### 8.3 React 集成建议

```tsx
// 推荐使用 useRef 持有 ECharts 实例
const chartRef = useRef<ECharts | null>(null);
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!containerRef.current) return;
  chartRef.current = echarts.init(containerRef.current);
  // ... setOption
  return () => {
    chartRef.current?.dispose();
    chartRef.current = null;
  };
}, []);
```

---

## 9. 数据 API 集成

实际开发中，以下 API 端点需要提供地理统计数据：

| 端点 | 用途 |
|---|---|
| `GET /api/v1/articles/geo-stats` | 按地区统计文章数量（地图热点） |
| `GET /api/v1/articles/geo-stats/china` | 中国各省文章数量（热力图） |
| `GET /api/v1/articles/industry-trends` | 行业趋势数据（折线图） |
| `GET /api/v1/articles/industry-ranking` | 热门领域排行（柱状图） |
| `GET /api/v1/articles?region={name}` | 特定地区文章列表（弹窗） |

所有端点支持 `period` 查询参数：`day` | `week` | `month` | `year`
