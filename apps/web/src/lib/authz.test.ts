import { describe, expect, it } from "vitest";
import {
	deriveRoleTierFromRoles,
	hasPermission,
	isRoleTierAtLeast,
	normalizeRoleTier,
} from "./authz";

describe("authz helpers", () => {
	it("normalizes unknown role tiers to basic_user", () => {
		expect(normalizeRoleTier("premium_user")).toBe("premium_user");
		expect(normalizeRoleTier("unknown")).toBe("basic_user");
		expect(normalizeRoleTier(null)).toBe("basic_user");
	});

	it("matches explicit and wildcard permissions", () => {
		expect(hasPermission(["reports:read"], "reports:read")).toBe(true);
		expect(hasPermission(["*"], "reports:write")).toBe(true);
		expect(hasPermission([], "reports:read")).toBe(false);
		expect(hasPermission(undefined, "reports:read")).toBe(false);
	});

	it("compares role tiers by hierarchy", () => {
		expect(isRoleTierAtLeast("premium_user", "verified_user")).toBe(true);
		expect(isRoleTierAtLeast("verified_user", "premium_user")).toBe(false);
		expect(isRoleTierAtLeast(null, "basic_user")).toBe(true);
	});

	it("derives effective role tier from backend role names", () => {
		expect(deriveRoleTierFromRoles(["basic_user"])).toBe("basic_user");
		expect(deriveRoleTierFromRoles(["viewer", "admin"])).toBe(
			"tenant_admin",
		);
		expect(deriveRoleTierFromRoles(["premium_user", "tenant_admin"])).toBe(
			"tenant_admin",
		);
		expect(deriveRoleTierFromRoles(["editor"])).toBe("verified_user");
		expect(deriveRoleTierFromRoles([], "QA User premium_user")).toBe(
			"premium_user",
		);
	});
});
