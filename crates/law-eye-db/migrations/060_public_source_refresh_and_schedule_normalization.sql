SET search_path TO public;

UPDATE sources
SET schedule = '0 ' || trim(schedule),
    updated_at = NOW()
WHERE schedule IS NOT NULL
  AND trim(schedule) <> ''
  AND array_length(regexp_split_to_array(trim(schedule), E'\s+'), 1) = 5;

UPDATE sources
SET url = 'https://www.bjrd.gov.cn/rdzl/dfxfgk/dfxfg/',
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'list_selector', '.fgk_nr .table_tr > ul',
        'title_selector', 'li.w60 a',
        'link_selector', 'li.w60 a[href]',
        'content_selector', '.view, .TRS_UEDITOR',
        'date_selector', 'meta[name=''PubDate'']',
        'render_mode', 'static'
    ),
    updated_at = NOW()
WHERE type = 'beijing_rd'
  AND deleted_at IS NULL;

UPDATE sources
SET url = 'https://www.isc.org.cn/category/7329.html',
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'list_selector', 'ul.news-list > li',
        'title_selector', 'a h3',
        'link_selector', 'a[href]',
        'content_selector', '.new-cont',
        'date_selector', '.new-tips span',
        'render_mode', 'static'
    ),
    updated_at = NOW()
WHERE type = 'china_isc'
  AND deleted_at IS NULL;
