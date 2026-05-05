import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Onboarding tour progress state.
 *
 * Persisted slice (`hasCompleted`, `dismissed`, `step`, `lastShownAt`,
 * `version`) is written to `localStorage` under
 * `ONBOARDING_STORAGE_KEY` via the zustand `persist` middleware. Transient
 * UI state (`isOpen`, `isHydrated`) lives in-memory only.
 *
 * `hasCompleted` flips on `markCompleted()`. `dismissed` flips on `close()`
 * and is the signal the auto-open effect honours so that closing the tour
 * with Esc / X / overlay click does not trigger a fresh open() on the next
 * route change or reload. The user can replay it via Settings or the
 * command palette which call `reset()` first.
 *
 * `isHydrated` only flips to `true` once the persist middleware has finished
 * reading from localStorage (server has no localStorage, hydration is async
 * even on the client). The auto-open effect MUST gate on this flag so it
 * does not fire while hasCompleted/dismissed are still default false values.
 */
export const ONBOARDING_STORAGE_KEY = "lawsaw.onboarding.v1";

export const ONBOARDING_TOTAL_STEPS = 5;

export interface OnboardingState {
	/** Currently displayed step index (0-based). */
	step: number;
	/** Whether the tour overlay is active. Transient (not persisted). */
	isOpen: boolean;
	/** Whether the user has finished the tour at least once. Persisted. */
	hasCompleted: boolean;
	/** Whether the user dismissed the tour via close. Persisted. */
	dismissed: boolean;
	/** Hydrated-from-storage flag. Transient (not persisted). */
	isHydrated: boolean;
	/** Last time the user was shown the tour. Persisted. */
	lastShownAt: number | null;
	open: () => void;
	close: () => void;
	next: () => void;
	previous: () => void;
	jumpTo: (step: number) => void;
	markCompleted: () => void;
	reset: () => void;
	hydrate: () => void;
}

interface PersistedShape {
	step: number;
	hasCompleted: boolean;
	dismissed: boolean;
	lastShownAt: number | null;
}

export const useOnboardingStore = create<OnboardingState>()(
	persist(
		(set, get) => ({
			step: 0,
			isOpen: false,
			hasCompleted: false,
			dismissed: false,
			isHydrated: false,
			lastShownAt: null,

			open: () => {
				const now = Date.now();
				set({ isOpen: true, step: 0, dismissed: false, lastShownAt: now });
			},

			close: () => {
				// Closing the tour records `dismissed=true` so the auto-open
				// effect does not re-open the overlay on subsequent reloads or
				// route changes. `hasCompleted` is intentionally left alone —
				// the user has not completed the tour, just deferred it.
				set({ isOpen: false, dismissed: true });
			},

			next: () => {
				const { step } = get();
				set({ step: Math.min(step + 1, ONBOARDING_TOTAL_STEPS - 1) });
			},

			previous: () => {
				const { step } = get();
				set({ step: Math.max(step - 1, 0) });
			},

			jumpTo: (step) => {
				if (step < 0 || step >= ONBOARDING_TOTAL_STEPS) return;
				set({ step });
			},

			markCompleted: () => {
				const now = Date.now();
				set({
					isOpen: false,
					hasCompleted: true,
					dismissed: true,
					step: ONBOARDING_TOTAL_STEPS - 1,
					lastShownAt: now,
				});
			},

			reset: () => {
				set({
					isOpen: false,
					hasCompleted: false,
					dismissed: false,
					step: 0,
					lastShownAt: null,
				});
			},

			// Kept for API compatibility (existing tests + components call it),
			// but the canonical hydration path is `onRehydrateStorage` below.
			// In SSR / no-storage contexts where persist never fires, calling
			// hydrate() lets consumers unblock the auto-open gate manually.
			hydrate: () => {
				if (get().isHydrated) return;
				set({ isHydrated: true });
			},
		}),
		{
			name: ONBOARDING_STORAGE_KEY,
			version: 1,
			// SSR-safe storage factory: zustand evaluates this at module
			// initialisation. The factory accesses `localStorage`
			// directly so that under Node / SSR the ReferenceError is
			// caught by zustand's `createJSONStorage` (returns undefined,
			// persist then short-circuits cleanly). On the client this
			// resolves to the real localStorage and the full hydrate()
			// flow runs.
			storage: createJSONStorage(() => localStorage),
			partialize: (state): PersistedShape => ({
				step: state.step,
				hasCompleted: state.hasCompleted,
				dismissed: state.dismissed,
				lastShownAt: state.lastShownAt,
			}),
			migrate: (persisted, version) => {
				if (version === 1) return persisted as PersistedShape;
				// Reject unknown / older shapes — defaults are fine.
				return {
					step: 0,
					hasCompleted: false,
					dismissed: false,
					lastShownAt: null,
				};
			},
			onRehydrateStorage: () => (rehydratedState, error) => {
				if (error) {
					// Storage unavailable / corrupt — still flip isHydrated so
					// consumers that block on it can proceed with defaults.
					useOnboardingStore.setState({ isHydrated: true });
					return;
				}
				if (rehydratedState) {
					// Clamp step back into range if the persisted index is corrupt.
					if (
						typeof rehydratedState.step !== "number" ||
						rehydratedState.step < 0 ||
						rehydratedState.step >= ONBOARDING_TOTAL_STEPS
					) {
						rehydratedState.step = 0;
					}
				}
				// Critical: only flip isHydrated AFTER persist has merged
				// localStorage state into the store. Until this fires, the
				// store is showing default `hasCompleted=false dismissed=false`,
				// which would otherwise cause the auto-open effect to fire on
				// every reload even for users who already dismissed the tour.
				useOnboardingStore.setState({ isHydrated: true });
			},
		},
	),
);
