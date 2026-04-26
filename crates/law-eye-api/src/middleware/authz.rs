//! Tier-aware authorization middleware.
//!
//! Phase B.3 of the 0425 ReBAC rebuild introduces a `require_role_tier` guard that
//! short-circuits requests whose authenticated user does not meet a minimum
//! `RoleTier` (per `prompts/0425/SPEC-01-REBAC-AUTHZ.md` §4.2 and §4.5).
//!
//! Internally the middleware delegates to the `RequireRoleTier` extractor that already
//! lives in `crate::middleware::auth_guard`. This module exposes a router-level helper
//! so route nesting in `routes/mod.rs` can compose tier checks alongside the existing
//! permission guards without duplicating Extension/from_extractor boilerplate.

use axum::{middleware as axum_middleware, Extension, Router};
use law_eye_core::role_tier::{
    role_tier_at_least, ROLE_TIER_BASIC_USER, ROLE_TIER_PREMIUM_USER, ROLE_TIER_SUPER_ADMIN,
    ROLE_TIER_TENANT_ADMIN, ROLE_TIER_VERIFIED_USER,
};

use crate::middleware::auth_guard::{RequireRoleTier, RequiredRoleTier};
use crate::state::AppState;

/// Friendly Chinese label used in degradation responses. Mirrors
/// `apps/web/src/lib/authz.ts::roleTierLabelZh`.
#[allow(dead_code)]
pub(crate) fn tier_label_zh(tier: &str) -> &'static str {
    match tier {
        t if t == ROLE_TIER_SUPER_ADMIN => "超级管理员",
        t if t == ROLE_TIER_TENANT_ADMIN => "租户管理员",
        t if t == ROLE_TIER_PREMIUM_USER => "高级用户",
        t if t == ROLE_TIER_VERIFIED_USER => "认证用户",
        t if t == ROLE_TIER_BASIC_USER => "普通用户",
        _ => "未知角色",
    }
}

/// Returns true if `tier` satisfies `min_tier` per the SPEC-01 §1 ladder.
///
/// Thin wrapper around `law_eye_core::role_tier::role_tier_at_least` exposed at the
/// API layer for ergonomic use inside handlers (e.g. for tier-aware payload trimming).
#[allow(dead_code)]
pub fn meets_minimum_tier(tier: &str, min_tier: &str) -> bool {
    role_tier_at_least(tier, min_tier)
}

/// Compose a router with the canonical "require role tier" guard.
///
/// Layers attached (innermost first):
/// 1. `Extension(RequiredRoleTier(min_tier))` — published into request extensions.
/// 2. `from_extractor::<RequireRoleTier>()` — runs the extractor that loads the user's
///    roles, derives their tier, and rejects with `403` if they fall below `min_tier`.
///
/// This mirrors the SPEC-01 §4.4 routing layer template:
///
/// ```text
/// .route("/api/v1/admin/users", get(list_users))
///     .layer(Extension(RequiredRoleTier(ROLE_TIER_TENANT_ADMIN)))
///     .layer(middleware::from_extractor::<RequireRoleTier>())
/// ```
///
/// Used by `routes/mod.rs` to enforce the §4.5 double-guard (tier + permission) on
/// every `/api/v1/admin/*` endpoint.
#[allow(dead_code)]
pub fn require_role_tier(
    router: Router<AppState>,
    min_tier: &'static str,
) -> Router<AppState> {
    router
        .layer(axum_middleware::from_extractor::<RequireRoleTier>())
        .layer(Extension(RequiredRoleTier(min_tier)))
}

/// Compose a router with both a permission and a tier guard (the §4.5 double-guard).
///
/// Layers attached (innermost first):
/// 1. `Extension(RequiredRoleTier(min_tier))` + `RequireRoleTier` extractor.
/// 2. `Extension(RequiredPermission(permission))` + `RequirePermission` extractor.
///
/// Both checks must pass; if a user has the permission but a lower tier (e.g. an
/// over-permissive role assignment), the tier check still rejects the request. This
/// delivers the spec's defense-in-depth requirement for `/api/v1/admin/*` endpoints.
#[allow(dead_code)]
pub fn require_role_tier_and_permission(
    router: Router<AppState>,
    min_tier: &'static str,
    permission: &'static str,
) -> Router<AppState> {
    use crate::middleware::auth_guard::{RequirePermission, RequiredPermission};

    router
        .layer(axum_middleware::from_extractor::<RequirePermission>())
        .layer(Extension(RequiredPermission(permission)))
        .layer(axum_middleware::from_extractor::<RequireRoleTier>())
        .layer(Extension(RequiredRoleTier(min_tier)))
}

#[cfg(test)]
mod tests {
    //! Pure unit tests for the tier-comparison logic. Wiring tests that exercise the
    //! full middleware pipeline are colocated with `routes/mod.rs::contract_tests`.

    use super::*;
    use law_eye_core::role_tier::{
        ROLE_TIER_BASIC_USER, ROLE_TIER_PREMIUM_USER, ROLE_TIER_SUPER_ADMIN, ROLE_TIER_TENANT_ADMIN,
        ROLE_TIER_VERIFIED_USER,
    };

    /// One assertion per role-tier combination — guarantees the inclusive `>=`
    /// semantics of the layer match SPEC-01 §1.
    #[test]
    fn role_tier_ladder_is_strictly_ordered() {
        let ladder = [
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_SUPER_ADMIN,
        ];

        for (i, current) in ladder.iter().enumerate() {
            for (j, required) in ladder.iter().enumerate() {
                let allowed = meets_minimum_tier(current, required);
                assert_eq!(
                    allowed,
                    i >= j,
                    "tier {current} vs {required}: expected allowed={}, got {allowed}",
                    i >= j
                );
            }
        }
    }

    #[test]
    fn require_super_admin_rejects_lower_tiers() {
        for tier in [
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_TENANT_ADMIN,
        ] {
            assert!(
                !meets_minimum_tier(tier, ROLE_TIER_SUPER_ADMIN),
                "{tier} must not be allowed when super_admin is required"
            );
        }
        assert!(meets_minimum_tier(
            ROLE_TIER_SUPER_ADMIN,
            ROLE_TIER_SUPER_ADMIN
        ));
    }

    #[test]
    fn require_tenant_admin_allows_admin_tiers_only() {
        assert!(meets_minimum_tier(
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_TENANT_ADMIN
        ));
        assert!(meets_minimum_tier(
            ROLE_TIER_SUPER_ADMIN,
            ROLE_TIER_TENANT_ADMIN
        ));
        assert!(!meets_minimum_tier(
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_TENANT_ADMIN
        ));
        assert!(!meets_minimum_tier(
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_TENANT_ADMIN
        ));
        assert!(!meets_minimum_tier(
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_TENANT_ADMIN
        ));
    }

    #[test]
    fn require_premium_user_blocks_verified_and_below() {
        assert!(meets_minimum_tier(
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_PREMIUM_USER
        ));
        assert!(!meets_minimum_tier(
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_PREMIUM_USER
        ));
        assert!(!meets_minimum_tier(
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_PREMIUM_USER
        ));
    }

    #[test]
    fn require_verified_user_blocks_basic() {
        assert!(meets_minimum_tier(
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_VERIFIED_USER
        ));
        assert!(!meets_minimum_tier(
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_VERIFIED_USER
        ));
    }

    #[test]
    fn require_basic_user_admits_everyone_logged_in() {
        for tier in [
            ROLE_TIER_BASIC_USER,
            ROLE_TIER_VERIFIED_USER,
            ROLE_TIER_PREMIUM_USER,
            ROLE_TIER_TENANT_ADMIN,
            ROLE_TIER_SUPER_ADMIN,
        ] {
            assert!(
                meets_minimum_tier(tier, ROLE_TIER_BASIC_USER),
                "{tier} must be admitted at the basic_user threshold"
            );
        }
    }

    #[test]
    fn tier_labels_render_chinese_for_known_values() {
        assert_eq!(tier_label_zh(ROLE_TIER_SUPER_ADMIN), "超级管理员");
        assert_eq!(tier_label_zh(ROLE_TIER_TENANT_ADMIN), "租户管理员");
        assert_eq!(tier_label_zh(ROLE_TIER_PREMIUM_USER), "高级用户");
        assert_eq!(tier_label_zh(ROLE_TIER_VERIFIED_USER), "认证用户");
        assert_eq!(tier_label_zh(ROLE_TIER_BASIC_USER), "普通用户");
        assert_eq!(tier_label_zh("ghost_role"), "未知角色");
    }
}
