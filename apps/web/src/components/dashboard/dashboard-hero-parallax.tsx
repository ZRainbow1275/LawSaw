"use client";

/**
 * DashboardHeroParallax (P3#9).
 *
 * A scroll-driven ornamental backdrop that lives *behind* the dashboard
 * hero. The foreground (hero card content) scrolls at normal speed while
 * the soft glow + grid pattern translate at a slower rate, producing the
 * subtle depth-of-field effect popularised by Vercel / Stripe marketing
 * heroes.
 *
 * Honours `useReducedMotion()` — when reduced motion is requested the
 * parallax is replaced with a static gradient so the page still has visual
 * texture but nothing animates.
 */

import {
	motion,
	useReducedMotion,
	useScroll,
	useTransform,
} from "framer-motion";
import { type ReactNode, useRef } from "react";

interface DashboardHeroParallaxProps {
	children: ReactNode;
}

export function DashboardHeroParallax({ children }: DashboardHeroParallaxProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const reducedMotion = useReducedMotion() ?? false;

	const { scrollYProgress } = useScroll({
		target: ref,
		offset: ["start start", "end start"],
	});

	const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "32%"]);
	const glowY = useTransform(scrollYProgress, [0, 1], ["0%", "64%"]);
	const glowOpacity = useTransform(scrollYProgress, [0, 0.7], [0.9, 0.35]);

	return (
		<div ref={ref} className="relative isolate overflow-hidden rounded-3xl">
			{/* Background grid */}
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[140%]"
				style={
					reducedMotion
						? undefined
						: {
								y: backgroundY,
								backgroundImage:
									"linear-gradient(120deg, color-mix(in srgb, var(--color-primary-500) 6%, transparent) 0%, transparent 60%), radial-gradient(circle at 14% 12%, color-mix(in srgb, var(--color-primary-500) 18%, transparent) 0%, transparent 32%)",
							}
				}
			/>
			{/* Soft glow */}
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-[120%]"
				style={
					reducedMotion
						? undefined
						: {
								y: glowY,
								opacity: glowOpacity,
								background:
									"radial-gradient(ellipse 60% 40% at 80% 20%, color-mix(in srgb, var(--color-primary-400) 22%, transparent) 0%, transparent 70%)",
							}
				}
			/>
			{/* Static fallback for reduced motion */}
			{reducedMotion ? (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 -z-10"
					style={{
						background:
							"radial-gradient(ellipse 60% 40% at 80% 20%, color-mix(in srgb, var(--color-primary-400) 16%, transparent) 0%, transparent 70%)",
					}}
				/>
			) : null}
			{children}
		</div>
	);
}
