pub const ROLE_TIER_BASIC_USER: &str = "basic_user";
pub const ROLE_TIER_VERIFIED_USER: &str = "verified_user";
pub const ROLE_TIER_PREMIUM_USER: &str = "premium_user";
pub const ROLE_TIER_TENANT_ADMIN: &str = "tenant_admin";
pub const ROLE_TIER_SUPER_ADMIN: &str = "super_admin";

/// Roles considered "admin-grade" for tier-aware payload filtering. Used to short-circuit
/// content trimming and policy lookups when the caller is staff.
pub const ADMIN_TIERS: &[&str] = &[ROLE_TIER_TENANT_ADMIN, ROLE_TIER_SUPER_ADMIN];

/// Category slugs visible to `basic_user` per SPEC-01 §2 (公共 3 类: 立法/监管/司法).
pub const BASIC_VISIBLE_CATEGORY_SLUGS: &[&str] = &["legislation", "regulation", "enforcement"];

/// Additional category slugs that `verified_user` gains access to on top of basic
/// (extends to 6 total: 立法/监管/司法/业界/合规/数据).
pub const VERIFIED_EXTRA_CATEGORY_SLUGS: &[&str] = &["industry", "compliance", "data"];

/// Maximum article body length that `basic_user` may receive in payload.
pub const BASIC_USER_BODY_PREVIEW_CHARS: usize = 200;

/// Resolve the canonical role tier (highest privilege) from a slice of role names.
///
/// Aliases honored: `admin` → `tenant_admin`, `editor` → `verified_user`.
pub fn derive_role_tier_from_names(role_names: &[String]) -> String {
    if role_names.iter().any(|role| role == ROLE_TIER_SUPER_ADMIN) {
        return ROLE_TIER_SUPER_ADMIN.to_string();
    }
    if role_names
        .iter()
        .any(|role| role == ROLE_TIER_TENANT_ADMIN || role == "admin")
    {
        return ROLE_TIER_TENANT_ADMIN.to_string();
    }
    if role_names.iter().any(|role| role == ROLE_TIER_PREMIUM_USER) {
        return ROLE_TIER_PREMIUM_USER.to_string();
    }
    if role_names
        .iter()
        .any(|role| role == ROLE_TIER_VERIFIED_USER || role == "editor")
    {
        return ROLE_TIER_VERIFIED_USER.to_string();
    }
    ROLE_TIER_BASIC_USER.to_string()
}

/// Numeric rank for a role tier. Higher = more privileges. Returns `0` for unknown values.
pub fn role_tier_rank(tier: &str) -> u8 {
    match tier {
        t if t == ROLE_TIER_SUPER_ADMIN => 4,
        t if t == ROLE_TIER_TENANT_ADMIN => 3,
        t if t == ROLE_TIER_PREMIUM_USER => 2,
        t if t == ROLE_TIER_VERIFIED_USER => 1,
        _ => 0,
    }
}

/// Returns true if `tier` is at least as privileged as `min`.
pub fn role_tier_at_least(tier: &str, min: &str) -> bool {
    role_tier_rank(tier) >= role_tier_rank(min)
}

/// Returns true if the given tier is `tenant_admin` or `super_admin`.
///
/// Convenience helper for handlers that bypass payload trimming for staff roles.
pub fn is_admin_tier(tier: &str) -> bool {
    role_tier_at_least(tier, ROLE_TIER_TENANT_ADMIN)
}

/// Mirrors `apps/web/src/app/[locale]/me/feed` channel filtering — applied uniformly
/// across `/api/v1/me/feed` and any handler that surfaces channel-grouped content.
///
/// - `super_admin` / `tenant_admin` / `premium_user`: all channels
/// - `verified_user`: everything except `premium`
/// - everyone else: only `public` and `restricted`
pub fn channel_visible_for_tier(visibility: &str, tier: &str) -> bool {
    match tier {
        t if t == ROLE_TIER_SUPER_ADMIN
            || t == ROLE_TIER_TENANT_ADMIN
            || t == ROLE_TIER_PREMIUM_USER =>
        {
            true
        }
        t if t == ROLE_TIER_VERIFIED_USER => visibility != "premium",
        _ => visibility == "public" || visibility == "restricted",
    }
}

/// Decide whether a category (identified by its slug) is visible to the given role tier.
///
/// Tier matrix (per SPEC-01 §2 + 03-current-state-gap §2.3):
/// - `basic_user`     → `BASIC_VISIBLE_CATEGORY_SLUGS` (3 categories)
/// - `verified_user`  → basic + `VERIFIED_EXTRA_CATEGORY_SLUGS` (6 categories)
/// - `premium_user`   → all categories
/// - `tenant_admin` / `super_admin` → all categories
///
/// Unknown / null tiers are treated as `basic_user`.
pub fn category_visible_for_tier(slug: &str, tier: &str) -> bool {
    if role_tier_at_least(tier, ROLE_TIER_PREMIUM_USER) {
        return true;
    }
    if role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER) {
        return BASIC_VISIBLE_CATEGORY_SLUGS.contains(&slug)
            || VERIFIED_EXTRA_CATEGORY_SLUGS.contains(&slug);
    }
    BASIC_VISIBLE_CATEGORY_SLUGS.contains(&slug)
}

/// Truncate an article body for tier-aware payload trimming.
///
/// Per SPEC-01 §2 and 0322 REBAC_USER_END §5.2:
/// - `basic_user` receives at most `BASIC_USER_BODY_PREVIEW_CHARS` Unicode scalar values
///   (truncation aware of multibyte characters, no panicking on byte boundaries).
/// - All other tiers receive the body unchanged.
///
/// Truncation appends an ellipsis `…` only when the input was actually clipped. Returns
/// `None` if the input was `None` to preserve the optionality on the wire.
pub fn truncate_body_for_tier(body: Option<&str>, tier: &str) -> Option<String> {
    let body = body?;
    if role_tier_at_least(tier, ROLE_TIER_VERIFIED_USER) {
        return Some(body.to_string());
    }

    let mut indices = body.char_indices();
    if let Some((boundary, _)) = indices.nth(BASIC_USER_BODY_PREVIEW_CHARS) {
        let mut trimmed = body[..boundary].to_string();
        trimmed.push('…');
        Some(trimmed)
    } else {
        Some(body.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(values: &[&str]) -> Vec<String> {
        values.iter().map(|v| v.to_string()).collect()
    }

    #[test]
    fn empty_role_list_resolves_to_basic_user() {
        assert_eq!(
            derive_role_tier_from_names(&names(&[])),
            ROLE_TIER_BASIC_USER
        );
    }

    #[test]
    fn unknown_role_resolves_to_basic_user() {
        assert_eq!(
            derive_role_tier_from_names(&names(&["viewer"])),
            ROLE_TIER_BASIC_USER
        );
    }

    #[test]
    fn editor_alias_resolves_to_verified_user() {
        assert_eq!(
            derive_role_tier_from_names(&names(&["editor"])),
            ROLE_TIER_VERIFIED_USER
        );
    }

    #[test]
    fn admin_alias_resolves_to_tenant_admin() {
        assert_eq!(
            derive_role_tier_from_names(&names(&["admin"])),
            ROLE_TIER_TENANT_ADMIN
        );
    }

    #[test]
    fn super_admin_takes_precedence() {
        assert_eq!(
            derive_role_tier_from_names(&names(&["super_admin", "viewer"])),
            ROLE_TIER_SUPER_ADMIN
        );
    }

    #[test]
    fn highest_role_wins_when_multiple_present() {
        assert_eq!(
            derive_role_tier_from_names(&names(&["editor", "premium_user"])),
            ROLE_TIER_PREMIUM_USER
        );
    }

    #[test]
    fn role_tier_at_least_is_inclusive() {
        assert!(role_tier_at_least(
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_TENANT_ADMIN
        ));
        assert!(role_tier_at_least(
            ROLE_TIER_SUPER_ADMIN,
            ROLE_TIER_TENANT_ADMIN
        ));
        assert!(!role_tier_at_least(
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_VERIFIED_USER
        ));
    }

    #[test]
    fn is_admin_tier_matches_admin_grades() {
        assert!(is_admin_tier(ROLE_TIER_SUPER_ADMIN));
        assert!(is_admin_tier(ROLE_TIER_TENANT_ADMIN));
        assert!(!is_admin_tier(ROLE_TIER_PREMIUM_USER));
        assert!(!is_admin_tier(ROLE_TIER_VERIFIED_USER));
        assert!(!is_admin_tier(ROLE_TIER_BASIC_USER));
    }

    #[test]
    fn channel_visibility_respects_tier_matrix() {
        // Premium and admin tiers see everything.
        for tier in [
            ROLE_TIER_SUPER_ADMIN,
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_PREMIUM_USER,
        ] {
            for visibility in ["public", "restricted", "premium"] {
                assert!(
                    channel_visible_for_tier(visibility, tier),
                    "tier {tier} should see channel visibility={visibility}"
                );
            }
        }

        // Verified user sees public + restricted but never premium.
        assert!(channel_visible_for_tier("public", ROLE_TIER_VERIFIED_USER));
        assert!(channel_visible_for_tier(
            "restricted",
            ROLE_TIER_VERIFIED_USER
        ));
        assert!(!channel_visible_for_tier(
            "premium",
            ROLE_TIER_VERIFIED_USER
        ));

        // Basic user only sees public + restricted.
        assert!(channel_visible_for_tier("public", ROLE_TIER_BASIC_USER));
        assert!(channel_visible_for_tier("restricted", ROLE_TIER_BASIC_USER));
        assert!(!channel_visible_for_tier("premium", ROLE_TIER_BASIC_USER));
    }

    #[test]
    fn category_visibility_basic_user_limited_to_three_slugs() {
        for slug in BASIC_VISIBLE_CATEGORY_SLUGS {
            assert!(
                category_visible_for_tier(slug, ROLE_TIER_BASIC_USER),
                "basic_user must see category {slug}"
            );
        }
        for slug in VERIFIED_EXTRA_CATEGORY_SLUGS {
            assert!(
                !category_visible_for_tier(slug, ROLE_TIER_BASIC_USER),
                "basic_user must NOT see category {slug}"
            );
        }
        assert!(!category_visible_for_tier(
            "international",
            ROLE_TIER_BASIC_USER
        ));
    }

    #[test]
    fn category_visibility_verified_user_sees_six_slugs() {
        for slug in BASIC_VISIBLE_CATEGORY_SLUGS
            .iter()
            .chain(VERIFIED_EXTRA_CATEGORY_SLUGS.iter())
        {
            assert!(
                category_visible_for_tier(slug, ROLE_TIER_VERIFIED_USER),
                "verified_user must see category {slug}"
            );
        }
        assert!(!category_visible_for_tier(
            "international",
            ROLE_TIER_VERIFIED_USER
        ));
        assert!(!category_visible_for_tier("security", ROLE_TIER_VERIFIED_USER));
    }

    #[test]
    fn category_visibility_premium_and_admin_see_all() {
        for tier in [
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_SUPER_ADMIN,
        ] {
            for slug in [
                "legislation",
                "regulation",
                "enforcement",
                "industry",
                "compliance",
                "data",
                "security",
                "academic",
                "events",
                "international",
            ] {
                assert!(
                    category_visible_for_tier(slug, tier),
                    "tier {tier} must see category {slug}"
                );
            }
        }
    }

    #[test]
    fn truncate_body_clips_basic_user_at_preview_chars() {
        let body: String = "中".repeat(BASIC_USER_BODY_PREVIEW_CHARS + 50);
        let trimmed = truncate_body_for_tier(Some(&body), ROLE_TIER_BASIC_USER).unwrap();
        // 200 multibyte chars + 1 ellipsis = 201 chars.
        assert_eq!(trimmed.chars().count(), BASIC_USER_BODY_PREVIEW_CHARS + 1);
        assert!(trimmed.ends_with('…'));
    }

    #[test]
    fn truncate_body_short_input_unchanged_for_basic_user() {
        let trimmed = truncate_body_for_tier(Some("hello"), ROLE_TIER_BASIC_USER).unwrap();
        assert_eq!(trimmed, "hello");
    }

    #[test]
    fn truncate_body_passthrough_for_verified_and_above() {
        let body = "x".repeat(BASIC_USER_BODY_PREVIEW_CHARS * 5);
        for tier in [
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_SUPER_ADMIN,
        ] {
            let trimmed = truncate_body_for_tier(Some(&body), tier).unwrap();
            assert_eq!(trimmed.len(), body.len(), "tier {tier} must receive full body");
        }
    }

    #[test]
    fn truncate_body_preserves_none() {
        assert!(truncate_body_for_tier(None, ROLE_TIER_BASIC_USER).is_none());
        assert!(truncate_body_for_tier(None, ROLE_TIER_SUPER_ADMIN).is_none());
    }
}
