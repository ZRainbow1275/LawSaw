"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";

interface RouteTransitionProviderProps {
	children: ReactNode;
}

/**
 * Route transition shell.
 *
 * Two responsibilities:
 *   1. AnimatePresence-driven slide+fade between top-level routes (P1#2).
 *      Each pathname keys a `<motion.div>` so the previous tree exits while
 *      the next one enters. Honors `useReducedMotion()`: when reduced motion
 *      is requested we degrade to opacity-only without horizontal travel.
 *   2. Stuck-loader recovery — if `#main-content` ends up empty for too long
 *      we replace the URL once per path/session (legacy guard, kept).
 */
export function RouteTransitionProvider({
	children,
}: RouteTransitionProviderProps) {
	const pathname = usePathname() ?? "/";
	const reducedMotion = useReducedMotion() ?? false;

	useEffect(() => {
		const recoveryKey = `law-eye-route-recovery:${pathname}`;
		const timer = window.setTimeout(() => {
			const main = document.querySelector("#main-content");
			const hasMainChildren =
				main instanceof HTMLElement && main.children.length > 0;
			const hasVisibleText =
				(document.body?.innerText || "").trim().length > 24;
			const hasSpinner = !!document.querySelector(".animate-spin");
			const shouldRecover = !hasMainChildren && !hasVisibleText && !hasSpinner;

			if (!shouldRecover) return;

			if (sessionStorage.getItem(recoveryKey) === "1") return;
			sessionStorage.setItem(recoveryKey, "1");
			window.location.replace(window.location.href);
		}, 12_000);

		return () => {
			window.clearTimeout(timer);
		};
	}, [pathname]);

	const variants = useMemo(
		() => ({
			initial: reducedMotion
				? { opacity: 0 }
				: { opacity: 0, x: 24, filter: "blur(2px)" },
			animate: reducedMotion
				? { opacity: 1 }
				: { opacity: 1, x: 0, filter: "blur(0px)" },
			exit: reducedMotion
				? { opacity: 0 }
				: { opacity: 0, x: -16, filter: "blur(2px)" },
		}),
		[reducedMotion],
	);

	return (
		<div id="main-content" tabIndex={-1} className="min-h-screen">
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={pathname}
					initial="initial"
					animate="animate"
					exit="exit"
					variants={variants}
					transition={{
						duration: reducedMotion ? 0.12 : 0.28,
						ease: [0.4, 0, 0.2, 1],
					}}
					className="min-h-[calc(100vh-0px)]"
				>
					{children}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
