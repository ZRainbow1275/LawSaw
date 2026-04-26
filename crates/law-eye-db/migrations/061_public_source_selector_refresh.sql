SET search_path TO public;

UPDATE sources
SET url = 'http://www.csrc.gov.cn/csrc/c100028/common_list.shtml',
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'list_selector', 'ul#list > li',
        'title_selector', 'a',
        'link_selector', 'a[href]',
        'content_selector', '.content .detail-news, .detail-news',
        'date_selector', 'meta[name=''PubDate''], .content p.fl',
        'wait_for_selector', 'ul#list > li',
        'wait_timeout_ms', 10000,
        'render_mode', 'static'
    ),
    updated_at = NOW()
WHERE type = 'csrc_gov'
  AND deleted_at IS NULL;

UPDATE sources
SET url = 'https://www.court.gov.cn/fabu/gengduo/16.html',
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
        'list_selector', '.sec_list > ul > li',
        'title_selector', 'a',
        'link_selector', 'a[href]',
        'content_selector', '.detail .txt_txt, .txt_txt',
        'date_selector', '.detail_mes .message li:last-child',
        'wait_for_selector', '.sec_list > ul > li',
        'wait_timeout_ms', 10000,
        'render_mode', 'static'
    ),
    updated_at = NOW()
WHERE type = 'court_gov'
  AND deleted_at IS NULL;
