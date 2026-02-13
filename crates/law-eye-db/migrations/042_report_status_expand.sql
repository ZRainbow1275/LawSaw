-- 042: 扩展报告状态机，添加 generated 和 error 状态
-- generated: AI 生成完成，等待进入 review
-- error: 生成/导出过程中发生错误

-- PostgreSQL 的 CHECK 约束需要先删后加
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check
    CHECK (status IN ('draft', 'generating', 'generated', 'review', 'approved', 'published', 'archived', 'error'));

-- 更新状态机注释
COMMENT ON COLUMN reports.status IS '状态机：draft→generating→generated→review→approved→published→archived / generating→error→draft';
