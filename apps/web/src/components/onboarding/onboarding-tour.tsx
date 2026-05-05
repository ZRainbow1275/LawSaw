"use client";

import { localeFromPathname, withLocalePath } from "@/lib/i18n";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { Button } from "../ui/button";
import { OnboardingStepCard } from "./onboarding-step";
import { ONBOARDING_STEPS } from "./tour-steps";

function translateOr(
	t: (key: string) => string,
	key: string,
	fallback: string,
): string {
	const result = t(key);
	return result === key ? fallback : result;
}

/**
 * Onboarding tour overlay.
 *
 * Shown once per user on first successful session. Subsequent openings are
 * explicit — user clicks "Re-run tour" from Settings, or triggers it via
 * the command palette. The component is mounted inside the root providers
 * tree; rendering is fully controlled by the zustand store.
 */
export function OnboardingTour() {
	const router = useRouter();
	const pathname = usePathname();
	const t = useT();
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
		// Hydration gate. Three concrete paths must all flip `isHydrated`:
		//
		//   1. Returning user with persisted state (`hasCompleted` /
		//      `dismissed` already true). zustand persist reads localStorage,
		//      merges, fires `onFinishHydration` — we flip isHydrated then
		//      so the auto-open effect sees the persisted flags and stays
		//      suppressed.
		//   2. First-time user (storage key does not exist). zustand persist
		//      still runs the hydrate flow and fires `onFinishHydration`
		//      with default state — we flip isHydrated and the auto-open
		//      effect proceeds with hasCompleted=false dismissed=false,
		//      which is exactly what we want (open the tour after 1.2s).
		//   3. Storage unavailable (Safari private mode, SSR module reuse,
		//      cookies blocked). zustand persist short-circuits during
		//      module init and `useOnboardingStore.persist` may be absent
		//      or never fire its listener. The fallback timer flips
		//      isHydrated manually so the user is not stuck forever on a
		//      blank gate.
		//
		// This effect runs once per mount; subsequent isHydrated changes
		// are observed by the dependent auto-open effect below.
		if (isHydrated) return;

		const persistApi = (
			useOnboardingStore as typeof useOnboardingStore & {
				persist?: {
					hasHydrated: () => boolean;
					onFinishHydration: (cb: () => void) => () => void;
				};
			}
		).persist;

		// Path 1+2: subscribe to onFinishHydration. If persist already
		// finished hydrating before this effect ran (race), flip immediately.
		const unsubscribe = persistApi?.onFinishHydration(() => {
			useOnboardingStore.setState({ isHydrated: true });
		});
		if (persistApi?.hasHydrated()) {
			useOnboardingStore.setState({ isHydrated: true });
		}

		// Path 3: storage-unavailable / SSR-short-circuit fallback. If
		// persist never wires up its listener, this 200ms timer ensures
		// the gate eventually unblocks with the default flags.
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
		// `isHydrated` flips inside the persist `onRehydrateStorage` callback
		// after localStorage has been merged into the store. The effect above
		// adds a 200ms fallback so that storage-disabled / SSR-short-circuit
		// paths still unblock the gate — but the canonical path is persist.
		if (!isHydrated) return;
		if (!isAuthenticated || !user) return;
		// `dismissed` flips when the user closes the tour (Esc / X / overlay
		// click). `hasCompleted` flips when the user finishes it. Either
		// signal suppresses the auto-open effect on subsequent reloads.
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
					className="fixed inset-0 z-[70] flex items-center justify-center px-4"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					<motion.div
						className="absolute inset-0"
						style={{
							backgroundColor:
								"color-mix(in srgb, var(--color-foreground) 28%, transparent)",
							backdropFilter: "blur(4px)",
						}}
						onClick={close}
					/>

					<motion.div
						className="relative z-[71] w-full max-w-md"
						initial={{ y: 16, opacity: 0, scale: 0.96 }}
						animate={{ y: 0, opacity: 1, scale: 1 }}
						exit={{ y: 16, opacity: 0, scale: 0.96 }}
						transition={{ type: "spring", damping: 20, stiffness: 260 }}
					>
						<div className="flex flex-col gap-4">
							<div
								className="flex items-center justify-between rounded-2xl border px-4 py-3"
								style={{
									backgroundColor: "var(--surface-popover-bg)",
									borderColor: "var(--surface-muted-border)",
								}}
							>
								<div className="flex items-center gap-2">
									<Sparkles
										aria-hidden="true"
										className="h-4 w-4"
										style={{ color: "var(--color-primary-500)" }}
									/>
									<span
										className="text-sm font-semibold"
										style={{ color: "var(--color-foreground)" }}
									>
										{translateOr(t, "onboarding.headline", "LawSaw 快速上手")}
									</span>
								</div>
								<button
									type="button"
									onClick={close}
									className="rounded-lg p-1 transition-opacity hover:opacity-80"
									style={{ color: "var(--surface-muted-text)" }}
									aria-label={t("Close")}
								>
									<X aria-hidden="true" className="h-4 w-4" />
								</button>
							</div>

							<OnboardingStepCard
								step={current}
								index={step}
								total={ONBOARDING_STEPS.length}
								onFollow={handleFollow}
							/>

							<div className="flex items-center justify-between gap-3">
								<button
									type="button"
									onClick={handleSkip}
									className="text-sm font-medium transition-opacity hover:opacity-80"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{translateOr(t, "onboarding.action.skip", "跳过引导")}
								</button>

								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										onClick={previous}
										disabled={isFirst}
										aria-label={translateOr(
											t,
											"onboarding.action.previous",
											"上一步",
										)}
									>
										<ChevronLeft aria-hidden="true" className="h-4 w-4" />
									</Button>

									{isLast ? (
										<Button onClick={handleFinish}>
											{translateOr(t, "onboarding.action.finish", "开始使用")}
										</Button>
									) : (
										<Button onClick={next}>
											{translateOr(t, "onboarding.action.next", "下一步")}
											<ChevronRight
												aria-hidden="true"
												className="ml-1 h-4 w-4"
											/>
										</Button>
									)}
								</div>
							</div>
						</div>
					</motion.div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
