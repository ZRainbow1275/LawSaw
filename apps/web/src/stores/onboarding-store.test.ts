import { describe, expect, it, beforeEach } from "vitest";
import {
	ONBOARDING_STORAGE_KEY,
	ONBOARDING_TOTAL_STEPS,
	useOnboardingStore,
} from "./onboarding-store";

function resetStore() {
	useOnboardingStore.setState({
		step: 0,
		isOpen: false,
		hasCompleted: false,
		isHydrated: false,
		lastShownAt: null,
	});
	if (typeof window !== "undefined") {
		try {
			window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}
}

describe("onboarding store", () => {
	beforeEach(() => {
		resetStore();
	});

	it("exposes ONBOARDING_TOTAL_STEPS equal to 5", () => {
		expect(ONBOARDING_TOTAL_STEPS).toBe(5);
	});

	it("open sets isOpen and resets step to 0", () => {
		useOnboardingStore.setState({ step: 3, isOpen: false });
		useOnboardingStore.getState().open();

		const state = useOnboardingStore.getState();
		expect(state.isOpen).toBe(true);
		expect(state.step).toBe(0);
		expect(state.lastShownAt).toBeGreaterThan(0);
	});

	it("close sets isOpen to false without touching hasCompleted", () => {
		useOnboardingStore.setState({ isOpen: true, hasCompleted: false });
		useOnboardingStore.getState().close();
		const state = useOnboardingStore.getState();
		expect(state.isOpen).toBe(false);
		expect(state.hasCompleted).toBe(false);
	});

	it("next stops at the last step", () => {
		useOnboardingStore.setState({ step: ONBOARDING_TOTAL_STEPS - 1 });
		useOnboardingStore.getState().next();
		expect(useOnboardingStore.getState().step).toBe(
			ONBOARDING_TOTAL_STEPS - 1,
		);
	});

	it("previous stops at step 0", () => {
		useOnboardingStore.setState({ step: 0 });
		useOnboardingStore.getState().previous();
		expect(useOnboardingStore.getState().step).toBe(0);
	});

	it("markCompleted flips hasCompleted and closes the tour", () => {
		useOnboardingStore.setState({ isOpen: true, hasCompleted: false });
		useOnboardingStore.getState().markCompleted();
		const state = useOnboardingStore.getState();
		expect(state.hasCompleted).toBe(true);
		expect(state.isOpen).toBe(false);
		expect(state.step).toBe(ONBOARDING_TOTAL_STEPS - 1);
	});

	it("reset clears localStorage and restores defaults", () => {
		useOnboardingStore.setState({
			isOpen: true,
			hasCompleted: true,
			step: 3,
			lastShownAt: 1000,
		});
		useOnboardingStore.getState().markCompleted();
		useOnboardingStore.getState().reset();

		const state = useOnboardingStore.getState();
		expect(state.isOpen).toBe(false);
		expect(state.hasCompleted).toBe(false);
		expect(state.step).toBe(0);
		expect(state.lastShownAt).toBe(null);

		if (typeof window !== "undefined") {
			expect(
				window.localStorage.getItem(ONBOARDING_STORAGE_KEY),
			).toBe(null);
		}
	});

	it("jumpTo only accepts in-range indices", () => {
		useOnboardingStore.getState().jumpTo(2);
		expect(useOnboardingStore.getState().step).toBe(2);

		useOnboardingStore.getState().jumpTo(-1);
		expect(useOnboardingStore.getState().step).toBe(2);

		useOnboardingStore.getState().jumpTo(ONBOARDING_TOTAL_STEPS);
		expect(useOnboardingStore.getState().step).toBe(2);
	});

	it("hydrate reads persisted payload with version 1", () => {
		if (typeof window === "undefined") return;

		window.localStorage.setItem(
			ONBOARDING_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				hasCompleted: true,
				step: 2,
				lastShownAt: 1714000000000,
			}),
		);

		useOnboardingStore.getState().hydrate();
		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(true);
		expect(state.hasCompleted).toBe(true);
		expect(state.step).toBe(2);
		expect(state.lastShownAt).toBe(1714000000000);
	});

	it("hydrate ignores payloads with unsupported version", () => {
		if (typeof window === "undefined") return;

		window.localStorage.setItem(
			ONBOARDING_STORAGE_KEY,
			JSON.stringify({
				version: 99,
				hasCompleted: true,
				step: 4,
			}),
		);

		useOnboardingStore.getState().hydrate();
		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(true);
		expect(state.hasCompleted).toBe(false);
	});

	it("hydrate clamps out-of-range step back to 0", () => {
		if (typeof window === "undefined") return;

		window.localStorage.setItem(
			ONBOARDING_STORAGE_KEY,
			JSON.stringify({
				version: 1,
				hasCompleted: false,
				step: 99,
			}),
		);

		useOnboardingStore.getState().hydrate();
		expect(useOnboardingStore.getState().step).toBe(0);
	});

	it("hydrate is idempotent (isHydrated prevents re-read)", () => {
		useOnboardingStore.getState().hydrate();
		const first = useOnboardingStore.getState().isHydrated;
		useOnboardingStore.getState().hydrate();
		const second = useOnboardingStore.getState().isHydrated;
		expect(first).toBe(true);
		expect(second).toBe(true);
	});
});
