import { create } from "zustand";

/**
 * Onboarding progress state.
 *
 * The store persists the user-scoped onboarding status to `localStorage` under
 * `lawsaw.onboarding.v1`. It is purely client-side (not persisted through the
 * backend) so that a fresh browser always treats a user as first-time until
 * the user finishes or dismisses the tour. The v1 schema key is intentional to
 * allow future schema migrations without silently corrupting old payloads.
 */
export const ONBOARDING_STORAGE_KEY = "lawsaw.onboarding.v1";

export const ONBOARDING_TOTAL_STEPS = 5;

export interface OnboardingState {
	/** Currently displayed step index (0-based). */
	step: number;
	/** Whether the tour overlay is active. */
	isOpen: boolean;
	/** Whether the user has finished or dismissed the tour at least once. */
	hasCompleted: boolean;
	/** Hydrated from storage flag — avoids flashing the tour on initial mount. */
	isHydrated: boolean;
	/** Optional metadata: the last time the user was shown the tour. */
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

interface PersistedPayload {
	hasCompleted: boolean;
	step: number;
	lastShownAt: number | null;
	version: 1;
}

function readPersisted(): PersistedPayload | null {
	if (typeof window === "undefined") return null;

	try {
		const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
		if (!raw) return null;

		const parsed = JSON.parse(raw) as Partial<PersistedPayload> | null;
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.version !== 1) return null;

		return {
			version: 1,
			hasCompleted: Boolean(parsed.hasCompleted),
			step:
				typeof parsed.step === "number" &&
				parsed.step >= 0 &&
				parsed.step < ONBOARDING_TOTAL_STEPS
					? parsed.step
					: 0,
			lastShownAt:
				typeof parsed.lastShownAt === "number" ? parsed.lastShownAt : null,
		};
	} catch {
		return null;
	}
}

function writePersisted(payload: PersistedPayload): void {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(
			ONBOARDING_STORAGE_KEY,
			JSON.stringify(payload),
		);
	} catch {
		/* ignore quota/serialization errors – tour remains in-memory only */
	}
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
	step: 0,
	isOpen: false,
	hasCompleted: false,
	isHydrated: false,
	lastShownAt: null,

	open: () => {
		const now = Date.now();
		set({ isOpen: true, step: 0, lastShownAt: now });
		const snapshot = get();
		writePersisted({
			version: 1,
			hasCompleted: snapshot.hasCompleted,
			step: 0,
			lastShownAt: now,
		});
	},

	close: () => {
		set({ isOpen: false });
	},

	next: () => {
		const { step } = get();
		const nextStep = Math.min(step + 1, ONBOARDING_TOTAL_STEPS - 1);
		set({ step: nextStep });
		const snapshot = get();
		writePersisted({
			version: 1,
			hasCompleted: snapshot.hasCompleted,
			step: nextStep,
			lastShownAt: snapshot.lastShownAt,
		});
	},

	previous: () => {
		const { step } = get();
		const prevStep = Math.max(step - 1, 0);
		set({ step: prevStep });
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
			step: ONBOARDING_TOTAL_STEPS - 1,
			lastShownAt: now,
		});
		writePersisted({
			version: 1,
			hasCompleted: true,
			step: ONBOARDING_TOTAL_STEPS - 1,
			lastShownAt: now,
		});
	},

	reset: () => {
		set({
			isOpen: false,
			hasCompleted: false,
			step: 0,
			lastShownAt: null,
		});
		if (typeof window !== "undefined") {
			try {
				window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
			} catch {
				/* ignore */
			}
		}
	},

	hydrate: () => {
		if (get().isHydrated) return;
		const persisted = readPersisted();
		if (persisted) {
			set({
				hasCompleted: persisted.hasCompleted,
				step: persisted.step,
				lastShownAt: persisted.lastShownAt,
				isHydrated: true,
			});
		} else {
			set({ isHydrated: true });
		}
	},
}));
