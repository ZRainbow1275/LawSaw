# Disaster Recovery Runbook（DB + Object Storage + Queue）

## 目标

在生产故障（误删、数据损坏、区域故障）后，按可审计流程恢复 Law Eye 的核心状态：
- PostgreSQL（业务真相源）
- 对象存储（报告导出文件、附件）
- Redis 队列（延迟/重试任务）

## 前置要求

1. 所有操作在隔离的恢复窗口执行，先冻结写流量（API 维护模式或入口熔断）。
2. 必须保留恢复工单号、操作人、执行时间、输入备份快照标识。
3. 恢复前后都执行健康检查与关键路径回归（登录、报告生成/下载、检索）。

## 备份策略

### 1) PostgreSQL（加密备份）

已提供脚本：
- `scripts/enterprise/backup-encrypted.sh`
- `scripts/enterprise/restore-encrypted.sh`

备份：

```bash
export LAW_EYE__DATABASE__URL='postgresql://...'
export LAW_EYE_BACKUP_PASSPHRASE='***'
export LAW_EYE_BACKUP_DIR='/var/backups/law-eye'
bash scripts/enterprise/backup-encrypted.sh
```

恢复（危险操作，默认阻断）：

```bash
export LAW_EYE_RESTORE_BACKUP_FILE='/var/backups/law-eye/postgres-20260216T120000Z.dump.enc'
export LAW_EYE_BACKUP_PASSPHRASE='***'
export LAW_EYE_RESTORE_DATABASE_URL='postgresql://...'
export LAW_EYE_RESTORE_CONFIRM='YES_I_UNDERSTAND_THIS_WILL_OVERWRITE_DATA'
bash scripts/enterprise/restore-encrypted.sh
```

### 2) Object Storage（MinIO/S3）

推荐使用对象版本化 + 跨区域复制；若需要手工恢复，使用对象同步：

```bash
# 备份
aws s3 sync s3://law-eye-prod-objects s3://law-eye-dr-objects --exact-timestamps --delete

# 恢复
aws s3 sync s3://law-eye-dr-objects s3://law-eye-prod-objects --exact-timestamps --delete
```

恢复后抽样校验：
- 任意 10 条 `reports.export_*_key` 在对象存储中可读取
- 下载接口 `GET /api/v1/reports/{id}/download/{format}` 返回 200

### 3) Queue（Redis）

生产建议启用 AOF + RDB 双持久化；定期导出 RDB：

```bash
redis-cli -h <redis-host> -a '<password>' --rdb /var/backups/law-eye/redis-$(date -u +%Y%m%dT%H%M%SZ).rdb
```

恢复方式：
1. 停止写入流量与 worker。
2. 替换 Redis 数据目录为目标 `dump.rdb`（或通过临时实例加载后迁移 key）。
3. 启动 Redis，再启动 worker。
4. 观察 `DLQ` 与重试队列是否有异常堆积。

## 演练流程（每月一次）

1. 在 staging 执行一次完整恢复演练（DB + Object + Queue）。
2. 记录 RTO（恢复时间目标）与 RPO（数据丢失窗口）。
3. 必做回归：
- `curl -fsS http://<api>/health/ready`
- 登录、文章检索、报告生成、报告导出下载
- `psql` 执行 `scripts/enterprise/reports-tenant-fk-verify.sql`

## 验收标准

1. API 健康检查全部通过。
2. 租户隔离回归（reports 复合外键）通过。
3. 报告下载链路可用且对象键无断链。
4. 队列积压回落至基线。

## 演练记录模板

```text
Date(UTC):
Operator:
Change Ticket:
Backup Snapshot IDs:
RTO:
RPO:
DB Restore Result:
Object Restore Result:
Queue Restore Result:
Post-check Summary:
```
