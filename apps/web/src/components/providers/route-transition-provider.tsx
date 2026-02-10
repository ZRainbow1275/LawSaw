"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface RouteTransitionProviderProps {
	children: ReactNode;
}

export function RouteTransitionProvider({
	children,
}: RouteTransitionProviderProps) {
	const pathname = usePathname();
	const reduceMotion = useReducedMotion();

	const initial = reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 };
	const animate = { opacity: 1, y: 0 };
	const exit = reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 };

	return (
		<AnimatePresence mode="wait" initial={false}>
			<motion.div
				id="main-content"
				tabIndex={-1}
				key={pathname}
				initial={initial}
				animate={animate}
				exit={exit}
				transition={{ duration: 0.2, ease: "easeOut" }}
				className="min-h-screen"
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}
