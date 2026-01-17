# n8n 工作流配置

本目录包含 Law Eye 项目的 n8n 工作流配置文件。

## 工作流列表

### 1. daily-digest.json - 每日摘要邮件

**触发时间**: 每天早上 8:00 (cron: `0 8 * * *`)

**功能**:
1. 从 API 获取当天发布的文章
2. 按分类分组，识别高优先级要闻
3. 调用邮件模板 API 生成 HTML
4. 发送邮件到订阅用户

**环境变量**:
- `LAW_EYE_API_URL`: API 服务地址
- `EMAIL_FROM`: 发件人邮箱
- `EMAIL_TO`: 收件人邮箱（支持多个，逗号分隔）

### 2. rss-crawler.json - RSS 采集任务

**触发时间**: 每小时整点 (cron: `0 * * * *`)

**功能**:
1. 获取所有活跃的 RSS 源
2. 逐个触发采集任务
3. 请求之间间隔 5 秒，避免过快访问

**环境变量**:
- `LAW_EYE_API_URL`: API 服务地址

## 导入方式

1. 启动 n8n: `docker-compose up -d n8n`
2. 访问 http://localhost:5678
3. 进入 Settings -> Import
4. 选择对应的 JSON 文件导入

## 凭证配置

在 n8n 中配置 HTTP Header Auth 凭证:

1. 进入 Settings -> Credentials
2. 添加 "Header Auth" 类型凭证
3. Name: `Law Eye API`
4. Header Name: `Authorization`
5. Header Value: `Bearer <your-api-key>`

## 自定义配置

如需调整触发时间，修改 `scheduleTrigger` 节点的 `cronExpression`:

```json
{
  "expression": "0 8 * * *"  // 每天 8:00
}
```

常用 cron 表达式:
- `0 8 * * *` - 每天 08:00
- `0 8,12,18 * * *` - 每天 08:00, 12:00, 18:00
- `0 * * * *` - 每小时整点
- `*/30 * * * *` - 每 30 分钟
