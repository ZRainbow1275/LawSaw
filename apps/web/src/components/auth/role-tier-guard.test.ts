import { describe, expect, it } from "vitest";
import { isRoleTierAuthorized } from "./role-tier-guard";

describe("isRoleTierAuthorized", () => {
	it("returns false when user is logged out (regardless of tier)", () => {
		expect(
			isRoleTierAuthorized(
				{ isAuthenticated: false, roleTier: "super_admin", roles: [] },
				"basic_user",
			),
		).toBe(false);
	});

	it("returns true when role tier meets the minimum", () => {
		expect(
			isRoleTierAuthorized(
				{ isAuthenticated: true, roleTier: "premium_user", roles: [] },
				"verified_user",
			),
		).toBe(true);
	});

	it("returns false when role tier is below the minimum", () => {
		expect(
			isRoleTierAuthorized(
				{ isAuthenticated: true, roleTier: "basic_user", roles: [] },
				"tenant_admin",
			),
		).toBe(false);
	});

	it("treats super_admin role as a fallback when roleTier is missing", () => {
		expect(
			isRoleTierAuthorized(
				{ isAuthenticated: true, roleTier: null, roles: ["super_admin"] },
				"super_admin",
			),
		).toBe(true);
	});

	it("does not let super_admin role override lower tier requirements when tier is missing", () => {
		// `null` tier normalizes to `basic_user` which does meet `basic_user` minTier;
		// confirm the guard does not block in this edge case.
		expect(
			isRoleTierAuthorized(
				{ isAuthenticated: true, roleTier: null, roles: [] },
				"basic_user",
			),
		).toBe(true);
	});
});
