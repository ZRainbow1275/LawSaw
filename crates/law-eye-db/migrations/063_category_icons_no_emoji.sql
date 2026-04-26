UPDATE categories
SET icon = CASE slug
    WHEN 'legislation' THEN 'scroll-text'
    WHEN 'regulation' THEN 'building-2'
    WHEN 'enforcement' THEN 'scale'
    WHEN 'industry' THEN 'briefcase'
    WHEN 'compliance' THEN 'shield-check'
    WHEN 'data' THEN 'bar-chart-3'
    WHEN 'security' THEN 'shield'
    WHEN 'academic' THEN 'graduation-cap'
    WHEN 'events' THEN 'flame'
    WHEN 'international' THEN 'globe-2'
    ELSE COALESCE(NULLIF(icon, ''), 'file-text')
END
WHERE deleted_at IS NULL;
