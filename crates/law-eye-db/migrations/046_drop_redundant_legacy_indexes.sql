-- 046_drop_redundant_legacy_indexes.sql
-- 目的: 清理租户化后遗留的全局索引，减少写放大与 VACUUM 负担。
--
-- 背景:
-- 早期 migration（001/003/005）存在不带 tenant_id 的全局索引。
-- 在 RLS + tenant-scoped 查询主路径下，这些索引已被复合租户索引覆盖：
--   - articles: idx_articles_tenant_created_at / idx_articles_tenant_published_cursor
--   - feedbacks: idx_feedbacks_tenant_user / idx_feedbacks_tenant_cursor
--   - audit_logs: idx_audit_logs_tenant_created / idx_audit_logs_tenant_resource / idx_audit_logs_tenant_user_action
--
-- 说明:
-- 使用 IF EXISTS 保证幂等执行；仅移除已确认被 tenant 复合索引覆盖的旧索引。

-- ---------------------------------------------------------------------------
-- Articles: remove legacy global time-ordered indexes
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_articles_created;
DROP INDEX IF EXISTS idx_articles_published;

-- ---------------------------------------------------------------------------
-- Feedbacks: remove legacy global indexes
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_feedbacks_created;
DROP INDEX IF EXISTS idx_feedbacks_user;

-- ---------------------------------------------------------------------------
-- Audit logs: remove legacy global indexes
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_audit_created;
DROP INDEX IF EXISTS idx_audit_resource;
DROP INDEX IF EXISTS idx_audit_user;

