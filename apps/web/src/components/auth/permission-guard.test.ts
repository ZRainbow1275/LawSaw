import { describe, expect, it } from "vitest";
import { isPermissionAuthorized } from "./permission-guard";

describe("isPermissionAuthorized", () => {
	it("denies logged-out callers regardless of permissions in snapshot", () => {
		expect(
			isPermissionAuthorized(
				{ isAuthenticated: false, permissions: ["*"] },
				"reports:read",
			),
		).toBe(false);
	});

	it("allows when an explicit permission matches", () => {
		expect(
			isPermissionAuthorized(
				{ isAuthenticated: true, permissions: ["reports:read"] },
				"reports:read",
			),
		).toBe(true);
	});

	it("denies when the required permission is missing", () => {
		expect(
			isPermissionAuthorized(
				{ isAuthenticated: true, permissions: ["reports:read"] },
				"reports:write",
			),
		).toBe(false);
	});

	it("treats * as authorize-all", () => {
		expect(
			isPermissionAuthorized(
				{ isAuthenticated: true, permissions: ["*"] },
				"anything:goes",
			),
		).toBe(true);
	});

	it("array input with default mode=any allows when at least one matches", () => {
		expect(
			isPermissionAuthorized(
				{ isAuthenticated: true, permissions: ["reports:read"] },
				["reports:write", "reports:read"],
			),
		).toBe(true);
	});

	it("array input with mode=all requires every entry", () => {
		expect(
			isPermissionAuthorized(
				{ isAuthenticated: true, permissions: ["reports:read"] },
				["reports:write", "reports:read"],
				"all",
			),
		).toBe(false);
		expect(
			isPermissionAuthorized(
				{
					isAuthenticated: true,
					permissions: ["reports:read", "reports:write"],
				},
				["reports:write", "reports:read"],
				"all",
			),
		).toBe(true);
	});

	it("denies an empty array (no permission to match)", () => {
		expect(
			isPermissionAuthorized({ isAuthenticated: true, permissions: ["*"] }, []),
		).toBe(false);
	});
});
