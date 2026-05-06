"use client";

import { localeFromPathname, withLocalePath } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { OnboardingStepCard } from "./onboarding-step";
import { ONBOARDING_STEPS } from "./tour-steps";

/**
 * Onboarding tour overlay.
 *
 * Shown once per user on first successful session. Subsequent openings are
 * explicit — user clicks "Re-run tour" from Settings, or triggers it via
 * the command palette. The component is mounted inside the root providers
 * tree; rendering is fully controlled by the zustand store.
 *
 * The overlay only owns the backdrop + center wrapper + motion. All chrome
 * (header / body / footer) lives inside `<OnboardingStepCard>` so we never
 * render two stacked card surfaces.
 */
export function OnboardingTour() {
	const router = useRouter();
	const pathname = usePathname();
	const locale = localeFromPathname(pathname ?? "/");
	const user = useAuthStore((s) => s.user);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const {
		step,
		isOpen,
		hasCompleted,
		dismissed,
		isHydrated,
		open,
		close,
		next,
		previous,
		markCompleted,
		hydrate,
	} = useOnboardingStore();

	useEffect(() => {
		if (isHydrated) return;

		const persistApi = (
			useOnboardingStore as typeof useOnboardingStore & {
				persist?: {
					hasHydrated: () => boolean;
					onFinishHydration: (cb: () => void) => () => void;
				};
			}
		).persist;

		const unsubscribe = persistApi?.onFinishHydration(() => {
			useOnboardingStore.setState({ isHydrated: true });
		});
		if (persistApi?.hasHydrated()) {
			useOnboardingStore.setState({ isHydrated: true });
		}

		const fallback = window.setTimeout(() => {
			if (!useOnboardingStore.getState().isHydrated) {
				hydrate();
			}
		}, 200);

		return () => {
			unsubscribe?.();
			window.clearTimeout(fallback);
		};
	}, [hydrate, isHydrated]);

	useEffect(() => {
		if (!isHydrated) return;
		if (!isAuthenticated || !user) return;
		if (hasCompleted || dismissed) return;
		if (isOpen) return;

		const normalizedPath = pathname ?? "/";
		const onAuthShell =
			normalizedPath.includes("/login") || normalizedPath.includes("/register");
		if (onAuthShell) return;

		const timer = window.setTimeout(() => {
			open();
		}, 1200);

		return () => window.clearTimeout(timer);
	}, [
		hasCompleted,
		dismissed,
		isAuthenticated,
		isHydrated,
		isOpen,
		open,
		pathname,
		user,
	]);

	// Dismiss the overlay whenever the route changes while the tour is open.
	// Without this the fixed-position overlay stays mounted on top of the new
	// route and blocks every interaction until the user manually closes it,
	// which manifests as "切页卡顿". `handleFollow` does its own dismiss before
	// pushing, so we only react when pathname *changes* mid-tour.
	const previousPathnameRef = useRef<string | null>(null);
	useEffect(() => {
		const previous = previousPathnameRef.current;
		previousPathnameRef.current = pathname;
		if (previous === null) return;
		if (previous === pathname) return;
		if (!isOpen) return;
		close();
	}, [close, isOpen, pathname]);

	const current = useMemo(() => ONBOARDING_STEPS[step], [step]);
	const isLast = step >= ONBOARDING_STEPS.length - 1;
	const isFirst = step <= 0;

	const handleSkip = useCallback(() => {
		markCompleted();
	}, [markCompleted]);

	const handleFinish = useCallback(() => {
		markCompleted();
	}, [markCompleted]);

	const handleFollow = useCallback(
		(target: { route: string }) => {
			markCompleted();
			router.push(withLocalePath(locale, target.route));
		},
		[locale, markCompleted, router],
	);

	useEffect(() => {
		if (!isOpen) return;

		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				close();
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				next();
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				previous();
			}
		};

		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close, isOpen, next, previous]);

	if (!current) return null;

	return (
		<AnimatePresence>
			{isOpen ? (
				<motion.div
					className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center px-4"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					<motion.div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0"
						style={{
							backgroundColor:
								"color-mix(in srgb, var(--color-foreground) 28%, transparent)",
							backdropFilter: "blur(4px)",
						}}
					/>

					<motion.div
						className="pointer-events-auto relative z-[71] w-full max-w-md"
						initial={{ y: 16, opacity: 0, scale: 0.96 }}
						animate={{ y: 0, opacity: 1, scale: 1 }}
						exit={{ y: 16, opacity: 0, scale: 0.96 }}
						transition={{ type: "spring", damping: 20, stiffness: 260 }}
					>
						<OnboardingStepCard
							step={current}
							index={step}
							total={ONBOARDING_STEPS.length}
							onFollow={handleFollow}
							onClose={close}
							onSkip={handleSkip}
							onPrev={previous}
							onNext={next}
							onFinish={handleFinish}
							isFirst={isFirst}
							isLast={isLast}
						/>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
