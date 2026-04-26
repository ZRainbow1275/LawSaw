pub mod auth_guard;
pub mod authz;
pub mod csrf;
pub mod idempotency;
pub mod rate_limit;
pub mod request_id;

pub use auth_guard::RequireAuth;
pub use auth_guard::{
    role_tier_at_least, RequirePermission, RequiredPermission, RequiredPermissions,
};
// Re-exported for callers that compose tier-aware guards (admin.rs, route nesting helpers).
// Marked `#[allow(unused_imports)]` because the in-tree consumers (admin.rs) are still
// landing on a peer branch — the re-exports keep the public middleware API stable.
#[allow(unused_imports)]
pub use auth_guard::{role_tier_rank, RequireRoleTier, RequiredRoleTier};
#[allow(unused_imports)]
pub use authz::{meets_minimum_tier, require_role_tier, require_role_tier_and_permission};
pub use csrf::CsrfLayer;
pub use idempotency::idempotency_middleware;
pub use request_id::RequestIdLayer;
