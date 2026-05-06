# wave6 Route Runner — 实时记录

> 端口：8849 / 已登录：admin@qa.lawsaw.local / viewport：1440×900
> 历史包 console 噪声：登录前 2 条 `/api/v1/auth/login 401`（密码 retry 产生），不计入 per-route。
> 真值清单来源：`prompts/0506/route-inventory.md` (46 routes)

## 列定义
- **idx**：截图编号
- **route**：URL path
- **HTTP**：navigation 后页面是否成功渲染（200 / 5xx / hydration error）
- **console err**：路由首屏后新增 console error 数（不含全局历史）
- **note**：异常或视觉 callout

## ZH 客户端路由

| idx | route | HTTP | console err | note |
|-----|-------|------|-------------|------|
| 01 | /zh/dashboard | OK | 0 (新增) | hero+4KPI+分类概览+最新资讯 完整匹配 prototype |

## EN 客户端路由（待跑）

## ZH Admin 路由（待跑）

## EN Admin 路由（待跑）
