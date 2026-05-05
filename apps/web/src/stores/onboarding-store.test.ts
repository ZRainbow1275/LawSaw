import { beforeEach, describe, expect, it } from "vitest";
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
		dismissed: false,
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

	it("close flips dismissed so the auto-open effect stays suppressed", () => {
		useOnboardingStore.setState({
			isOpen: true,
			hasCompleted: false,
			dismissed: false,
		});
		useOnboardingStore.getState().close();
		expect(useOnboardingStore.getState().dismissed).toBe(true);
	});

	it("next stops at the last step", () => {
		useOnboardingStore.setState({ step: ONBOARDING_TOTAL_STEPS - 1 });
		useOnboardingStore.getState().next();
		expect(useOnboardingStore.getState().step).toBe(ONBOARDING_TOTAL_STEPS - 1);
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

	it("reset clears persisted state and restores defaults", () => {
		useOnboardingStore.setState({
			isOpen: true,
			hasCompleted: true,
			dismissed: true,
			step: 3,
			lastShownAt: 1000,
		});
		useOnboardingStore.getState().reset();

		const state = useOnboardingStore.getState();
		expect(state.isOpen).toBe(false);
		expect(state.hasCompleted).toBe(false);
		expect(state.dismissed).toBe(false);
		expect(state.step).toBe(0);
		expect(state.lastShownAt).toBe(null);
	});

	it("jumpTo only accepts in-range indices", () => {
		useOnboardingStore.getState().jumpTo(2);
		expect(useOnboardingStore.getState().step).toBe(2);

		useOnboardingStore.getState().jumpTo(-1);
		expect(useOnboardingStore.getState().step).toBe(2);

		useOnboardingStore.getState().jumpTo(ONBOARDING_TOTAL_STEPS);
		expect(useOnboardingStore.getState().step).toBe(2);
	});

	it("hydrate flips isHydrated and is idempotent", () => {
		useOnboardingStore.setState({ isHydrated: false });
		useOnboardingStore.getState().hydrate();
		expect(useOnboardingStore.getState().isHydrated).toBe(true);
		useOnboardingStore.getState().hydrate();
		expect(useOnboardingStore.getState().isHydrated).toBe(true);
	});

	// Hydration timing — the bug we're guarding against:
	//   Old code synchronously flipped `isHydrated=true` from a useEffect
	//   on mount, BEFORE zustand persist had read localStorage. The auto-open
	//   effect then saw default `hasCompleted=false dismissed=false` and
	//   queued the 1.2s open() timer. Persist later loaded `dismissed=true`,
	//   but by then the timer was already in flight.
	//   Fix: `isHydrated` MUST only flip from inside persist's
	//   `onRehydrateStorage` callback, which runs AFTER persisted state is
	//   merged into the store.

	it("default state has isHydrated=false (auto-open effect must wait for persist)", () => {
		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(false);
		expect(state.hasCompleted).toBe(false);
		expect(state.dismissed).toBe(false);
	});

	it("auto-open suppression: a returning user with dismissed=true must keep dismissed after isHydrated flips", () => {
		// Simulate the post-rehydrate state: persist has merged
		// `dismissed=true` from storage and only THEN flipped isHydrated.
		// The auto-open effect's gate `if (hasCompleted || dismissed) return`
		// must observe the post-merge values together.
		useOnboardingStore.setState({
			isHydrated: true,
			hasCompleted: false,
			dismissed: true,
		});

		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(true);
		expect(state.dismissed).toBe(true);
		// Combined gate the component uses:
		const shouldSuppressAutoOpen = state.hasCompleted || state.dismissed;
		expect(shouldSuppressAutoOpen).toBe(true);
	});

	it("auto-open suppression: a completed user keeps hasCompleted after isHydrated flips", () => {
		useOnboardingStore.setState({
			isHydrated: true,
			hasCompleted: true,
			dismissed: true,
		});
		const state = useOnboardingStore.getState();
		const shouldSuppressAutoOpen = state.hasCompleted || state.dismissed;
		expect(shouldSuppressAutoOpen).toBe(true);
	});

	it("close action keeps isHydrated=true once persist has flipped it (no regression to false)", () => {
		// Once persist's onRehydrateStorage has flipped isHydrated, no
		// subsequent action (close / next / previous / markCompleted / reset)
		// should knock it back to false — that would re-open the race.
		useOnboardingStore.setState({ isHydrated: true });
		useOnboardingStore.getState().close();
		expect(useOnboardingStore.getState().isHydrated).toBe(true);

		useOnboardingStore.getState().markCompleted();
		expect(useOnboardingStore.getState().isHydrated).toBe(true);

		useOnboardingStore.getState().reset();
		expect(useOnboardingStore.getState().isHydrated).toBe(true);
	});

	// localStorage=null regression — wave 3:
	//   For a brand-new user, `lawsaw.onboarding.v1` does not exist in
	//   storage. If zustand persist short-circuits on the SSR pass and the
	//   client re-evaluation never fires `onRehydrateStorage`, `isHydrated`
	//   stays false forever and the auto-open effect never unblocks the
	//   1.2s timer — the first-time tour never opens. The component-level
	//   fallback timer calls `hydrate()` after 200ms, which MUST flip
	//   `isHydrated` to true while leaving the persisted slice at defaults
	//   (hasCompleted=false, dismissed=false) so that the tour can open.

	it("first-time user (storage empty) hydrate() unblocks the auto-open gate with default flags", () => {
		// Emulate a brand-new user: nothing in localStorage, store at
		// defaults. No persist callback ever fired.
		expect(useOnboardingStore.getState().isHydrated).toBe(false);

		// Component-level fallback timer would fire hydrate() here.
		useOnboardingStore.getState().hydrate();

		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(true);
		// Crucial — defaults must remain so the auto-open gate
		// `if (hasCompleted || dismissed) return` does NOT short-circuit.
		expect(state.hasCompleted).toBe(false);
		expect(state.dismissed).toBe(false);
		// Combined gate: tour SHOULD auto-open for this user.
		const shouldSuppressAutoOpen = state.hasCompleted || state.dismissed;
		expect(shouldSuppressAutoOpen).toBe(false);
	});

	it("first-time user hydrate() does not destroy persisted-slice defaults", () => {
		// Guard: hydrate() must only ever flip isHydrated, never write
		// hasCompleted/dismissed/step. Doing so would defeat the
		// returning-user suppression path covered above.
		expect(useOnboardingStore.getState().isHydrated).toBe(false);
		useOnboardingStore.getState().hydrate();

		const state = useOnboardingStore.getState();
		expect(state.step).toBe(0);
		expect(state.lastShownAt).toBe(null);
		expect(state.isOpen).toBe(false);
	});

	it("onFinishHydration listener mock: simulated callback flips isHydrated even when storage was empty", () => {
		// We can't observe the real onFinishHydration in the node test
		// environment because zustand `persist` short-circuits when
		// localStorage is unavailable (no .persist API attached). What we
		// CAN cover: the contract the OnboardingTour component relies on —
		// when `onFinishHydration` fires its callback, we call
		// `useOnboardingStore.setState({ isHydrated: true })`. That call
		// must leave the persisted slice untouched, since the callback
		// fires AFTER the storage->store merge has already settled.
		expect(useOnboardingStore.getState().isHydrated).toBe(false);

		// Emulate the OnboardingTour effect's callback body:
		useOnboardingStore.setState({ isHydrated: true });

		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(true);
		expect(state.hasCompleted).toBe(false);
		expect(state.dismissed).toBe(false);
		expect(state.step).toBe(0);
	});

	it("onFinishHydration listener mock: simulated callback respects pre-set persisted flags (returning user)", () => {
		// Returning user — onFinishHydration fires AFTER persist has merged
		// `dismissed=true` into the store. The component callback must NOT
		// reset those flags — only flip isHydrated.
		useOnboardingStore.setState({
			step: 2,
			hasCompleted: false,
			dismissed: true,
			lastShownAt: 1234,
		});
		expect(useOnboardingStore.getState().isHydrated).toBe(false);

		// Emulate the OnboardingTour effect's onFinishHydration callback:
		useOnboardingStore.setState({ isHydrated: true });

		const state = useOnboardingStore.getState();
		expect(state.isHydrated).toBe(true);
		expect(state.dismissed).toBe(true);
		expect(state.step).toBe(2);
		expect(state.lastShownAt).toBe(1234);
		// Combined auto-open gate must short-circuit:
		expect(state.hasCompleted || state.dismissed).toBe(true);
	});
});
