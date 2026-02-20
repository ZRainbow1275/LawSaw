use super::government::{GovernmentSiteAdapter, SiteProfile};
use law_eye_common::Result;

/// 全国人大网 (npc.gov.cn) — 立法类
pub fn npc_gov() -> SiteProfile {
    SiteProfile {
        kind: "npc_gov",
        display_name: "全国人大网",
        default_url: "http://www.npc.gov.cn/npc/c2/c183/flfg_list.shtml",
        list_selector: "ul.list > li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".article_content, .detail"),
        date_selector: Some(".date, span.time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 国家法律法规数据库 (flk.npc.gov.cn) — 立法类，需要动态渲染
pub fn flk_npc() -> SiteProfile {
    SiteProfile {
        kind: "flk_npc",
        display_name: "国家法律法规数据库",
        default_url: "https://flk.npc.gov.cn/index.html",
        list_selector: ".el-table__body-wrapper tr",
        title_selector: "td:nth-child(2)",
        link_selector: "td:nth-child(2) a[href]",
        content_selector: Some(".law-content, .detail-con"),
        date_selector: Some("td:nth-child(4)"),
        delay_ms: 3000,
        render_mode: "dynamic",
        encoding: None,
        wait_for_selector: Some(".el-table__body-wrapper"),
        wait_timeout_ms: Some(15000),
    }
}

/// 司法部 (moj.gov.cn) — 立法类
pub fn moj_gov() -> SiteProfile {
    SiteProfile {
        kind: "moj_gov",
        display_name: "司法部",
        default_url: "http://www.moj.gov.cn/pub/sfbgw/zcjd/zcjdzcfg/",
        list_selector: "ul.newsList > li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 中国证监会 (csrc.gov.cn) — 监管类
pub fn csrc_gov() -> SiteProfile {
    SiteProfile {
        kind: "csrc_gov",
        display_name: "中国证监会",
        default_url: "http://www.csrc.gov.cn/csrc/c100028/common_list.shtml",
        list_selector: ".list-content li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".detail-content, .TRS_Editor"),
        date_selector: Some("span.time, .date"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 国家金融监管总局 (原银保监会 cbirc.gov.cn) — 监管类
pub fn cbirc_gov() -> SiteProfile {
    SiteProfile {
        kind: "cbirc_gov",
        display_name: "国家金融监管总局",
        default_url: "https://www.cbirc.gov.cn/cn/view/pages/zhengcefagui/zhengcefagui.html",
        list_selector: "ul.list > li, .doclist li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".Section0, .TRS_Editor, .detail-content"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 国家互联网信息办公室 (cac.gov.cn) — 监管类
pub fn cac_gov() -> SiteProfile {
    SiteProfile {
        kind: "cac_gov",
        display_name: "国家互联网信息办公室",
        default_url: "http://www.cac.gov.cn/zcfg.htm",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 中国人民银行 (pbc.gov.cn) — 监管类，GBK 编码
pub fn pbc_gov() -> SiteProfile {
    SiteProfile {
        kind: "pbc_gov",
        display_name: "中国人民银行",
        default_url: "http://www.pbc.gov.cn/zhengcehuobisi/125207/125213/125431/125475/index.html",
        list_selector: "table.newslist tr, .list_conr li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some("#zoom, .TRS_Editor"),
        date_selector: Some("td:last-child, span.hui12"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: Some("gbk"),
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 最高人民法院 (court.gov.cn) — 执法类
pub fn court_gov() -> SiteProfile {
    SiteProfile {
        kind: "court_gov",
        display_name: "最高人民法院",
        default_url: "https://www.court.gov.cn/fabu/sfjs/",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".article_content, .detail"),
        date_selector: Some("span.time, .date"),
        delay_ms: 3000, // Higher delay — anti-crawl measures
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 市场监管总局 (samr.gov.cn) — 综合类
pub fn samr_gov() -> SiteProfile {
    SiteProfile {
        kind: "samr_gov",
        display_name: "市场监管总局",
        default_url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .detail-content"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 工业和信息化部 (miit.gov.cn) — 综合类
pub fn miit_gov() -> SiteProfile {
    SiteProfile {
        kind: "miit_gov",
        display_name: "工业和信息化部",
        default_url: "https://www.miit.gov.cn/zwgk/zcwj/index.html",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .xxgk_con"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

// ============================================================
// Batch 8d: 扩展数据源
// ============================================================

/// 上海市人大常委会 (spcsc.sh.gov.cn) — 地方法规类
pub fn shanghai_rd() -> SiteProfile {
    SiteProfile {
        kind: "shanghai_rd",
        display_name: "上海市人大",
        default_url: "http://www.spcsc.sh.cn/n1939/n2440/n3334/index.html",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content, .detail"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 北京市人大常委会 (bjrd.gov.cn) — 地方法规类
pub fn beijing_rd() -> SiteProfile {
    SiteProfile {
        kind: "beijing_rd",
        display_name: "北京市人大",
        default_url: "http://www.bjrd.gov.cn/zyfb/dfxfg/",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content, .detail"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 广东省人大常委会 (rd.gd.gov.cn) — 地方法规类
pub fn guangdong_rd() -> SiteProfile {
    SiteProfile {
        kind: "guangdong_rd",
        display_name: "广东省人大",
        default_url: "http://www.rd.gd.cn/rdlf/flfg/",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content, .detail"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// GDPR Enforcement Tracker (enforcementtracker.com) — 国际法律类
pub fn gdpr_tracker() -> SiteProfile {
    SiteProfile {
        kind: "gdpr_tracker",
        display_name: "GDPR Enforcement Tracker",
        default_url: "https://www.enforcementtracker.com/",
        list_selector: "table.table tbody tr",
        title_selector: "td:nth-child(5) a, td:nth-child(5)",
        link_selector: "td:nth-child(5) a[href]",
        content_selector: Some(".detail-content, .article-content"),
        date_selector: Some("td:nth-child(1)"),
        delay_ms: 3000,
        render_mode: "dynamic",
        encoding: None,
        wait_for_selector: Some("table.table tbody tr"),
        wait_timeout_ms: Some(15000),
    }
}

/// 中国互联网协会 (isc.org.cn) — 行业协会类
pub fn china_isc() -> SiteProfile {
    SiteProfile {
        kind: "china_isc",
        display_name: "中国互联网协会",
        default_url: "https://www.isc.org.cn/zxzx/xhdt/",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content, .detail"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// 中国银行业协会 (china-cba.net) — 行业协会类
pub fn china_cba() -> SiteProfile {
    SiteProfile {
        kind: "china_cba",
        display_name: "中国银行业协会",
        default_url: "https://www.china-cba.net/Index/show/catid/14.html",
        list_selector: "ul.list > li, .newsList li",
        title_selector: "a",
        link_selector: "a[href]",
        content_selector: Some(".TRS_Editor, .article-content, .detail"),
        date_selector: Some("span.date, .time"),
        delay_ms: 2000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// CNVD 国家信息安全漏洞共享平台 (cnvd.org.cn) — 技术安全类
pub fn cnvd() -> SiteProfile {
    SiteProfile {
        kind: "cnvd",
        display_name: "CNVD 漏洞库",
        default_url: "https://www.cnvd.org.cn/flaw/list.htm",
        list_selector: "table.tlist tbody tr",
        title_selector: "td:nth-child(1) a",
        link_selector: "td:nth-child(1) a[href]",
        content_selector: Some(".detail_content, .tableDetail td"),
        date_selector: Some("td:nth-child(5)"),
        delay_ms: 3000,
        render_mode: "static",
        encoding: None,
        wait_for_selector: None,
        wait_timeout_ms: None,
    }
}

/// All built-in government site profiles.
pub fn all_profiles() -> Vec<SiteProfile> {
    vec![
        // Batch 3: 核心数据源 (10)
        npc_gov(),
        flk_npc(),
        moj_gov(),
        csrc_gov(),
        cbirc_gov(),
        cac_gov(),
        pbc_gov(),
        court_gov(),
        samr_gov(),
        miit_gov(),
        // Batch 8d: 扩展数据源 (7)
        shanghai_rd(),
        beijing_rd(),
        guangdong_rd(),
        gdpr_tracker(),
        china_isc(),
        china_cba(),
        cnvd(),
    ]
}

/// Create `GovernmentSiteAdapter` instances for all profiles.
pub fn all_adapters() -> Result<Vec<GovernmentSiteAdapter>> {
    all_profiles()
        .into_iter()
        .map(GovernmentSiteAdapter::new)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::SourceAdapter;

    #[test]
    fn all_profiles_have_unique_kinds() {
        let profiles = all_profiles();
        let mut kinds: Vec<&str> = profiles.iter().map(|p| p.kind).collect();
        let original_len = kinds.len();
        kinds.sort_unstable();
        kinds.dedup();
        assert_eq!(kinds.len(), original_len, "duplicate kind values detected");
    }

    #[test]
    fn all_profiles_have_non_empty_fields() {
        for profile in all_profiles() {
            assert!(
                !profile.kind.is_empty(),
                "kind is empty for {}",
                profile.display_name
            );
            assert!(
                !profile.display_name.is_empty(),
                "display_name is empty for {}",
                profile.kind
            );
            assert!(
                !profile.default_url.is_empty(),
                "default_url is empty for {}",
                profile.kind
            );
            assert!(
                !profile.list_selector.is_empty(),
                "list_selector is empty for {}",
                profile.kind
            );
            assert!(
                !profile.title_selector.is_empty(),
                "title_selector is empty for {}",
                profile.kind
            );
            assert!(
                !profile.link_selector.is_empty(),
                "link_selector is empty for {}",
                profile.kind
            );
        }
    }

    #[test]
    fn profile_count_is_seventeen() {
        assert_eq!(all_profiles().len(), 17);
    }

    #[test]
    fn pbc_gov_uses_gbk_encoding() {
        let profile = pbc_gov();
        assert_eq!(profile.encoding, Some("gbk"));
    }

    #[test]
    fn flk_npc_uses_dynamic_rendering() {
        let profile = flk_npc();
        assert_eq!(profile.render_mode, "dynamic");
        assert!(profile.wait_for_selector.is_some());
        assert!(profile.wait_timeout_ms.is_some());
    }

    #[test]
    fn court_gov_has_higher_delay() {
        let profile = court_gov();
        assert!(
            profile.delay_ms >= 3000,
            "court.gov.cn should have higher delay for anti-crawl"
        );
    }

    #[test]
    fn all_adapters_can_be_created() {
        std::env::set_var("LAW_EYE__SPIDER__NO_PROXY", "1");
        let adapters = all_adapters().unwrap();
        assert_eq!(adapters.len(), 17);

        for adapter in &adapters {
            assert!(!adapter.kind().is_empty());
            assert!(!adapter.display_name().is_empty());
        }
    }
}
