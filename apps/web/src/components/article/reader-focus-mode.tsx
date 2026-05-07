"use client";

/**
 * Reader focus mode (P3#7).
 *
 * Two pieces of UI:
 *   - <ReaderProgressRing>: a 4px gradient bar pinned to the top edge that
 *     fills as the user scrolls through the reader column.
 *   - <FocusDimmer>: tracks paragraph elements via IntersectionObserver and
 *     dims non-central blocks (opacity 0.42 + small blur) so the active
 *     paragraph reads like a spotlight.
 *
 * Both components honour `useReducedMotion()`. With reduced motion the
 * progress ring still renders (informational) but the dimmer is a no-op.
 */

import { useReadingStore } from "@/stores/reading-store";
import {
	motion,
	useReducedMotion,
	useScroll,
	useSpring,
} from "framer-motion";
import { useEffect, useRef } from "react";

interface ReaderFocusModeProps {
	/**
	 * The reader content root. Defaults to `[data-reader-root]`. Each
	 * direct paragraph (`p`, `h1`-`h4`, `blockquote`, `li`) below this root
	 * is observed.
	 */
	contentSelector?: string;
}

export function ReaderProgressRing() {
	const { scrollYProgress } = useScroll();
	const reducedMotion = useReducedMotion() ?? false;
	const scaleX = useSpring(scrollYProgress, {
		stiffness: 240,
		damping: 36,
		restDelta: 0.001,
	});

	if (reducedMotion) {
		return (
			<div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 origin-left bg-[var(--color-primary-500)]" />
		);
	}

	return (
		<motion.div
			aria-hidden="true"
			className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 origin-left"
			style={{
				scaleX,
				background:
					"linear-gradient(90deg, var(--color-primary-400) 0%, var(--color-primary-500) 50%, var(--color-primary-700) 100%)",
				transformOrigin: "left center",
				boxShadow:
					"0 6px 20px color-mix(in srgb, var(--color-primary-500) 32%, transparent)",
			}}
		/>
	);
}

export function FocusDimmer({
	contentSelector = "[data-reader-root]",
}: ReaderFocusModeProps) {
	const focusMode = useReadingStore((s) => s.settings.focusMode);
	const reducedMotion = useReducedMotion() ?? false;
	const observerRef = useRef<IntersectionObserver | null>(null);

	useEffect(() => {
		if (typeof document === "undefined") return;
		const root = document.querySelector(contentSelector);
		if (!root) return;

		const elements = Array.from(
			root.querySelectorAll<HTMLElement>(
				"p, h1, h2, h3, h4, blockquote, li",
			),
		);
		if (elements.length === 0) return;

		// Helper to clear all decorations — used both for cleanup and for the
		// reduced-motion / disabled-focus branches.
		const clear = () => {
			for (const el of elements) {
				el.style.transition = "";
				el.style.opacity = "";
				el.style.filter = "";
			}
		};

		if (!focusMode || reducedMotion) {
			clear();
			return clear;
		}

		for (const el of elements) {
			el.style.transition = "opacity 0.32s ease, filter 0.32s ease";
			el.style.opacity = "0.42";
			el.style.filter = "blur(0.4px)";
		}

		observerRef.current?.disconnect();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const target = entry.target as HTMLElement;
					if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
						target.style.opacity = "1";
						target.style.filter = "blur(0px)";
					} else {
						target.style.opacity = "0.42";
						target.style.filter = "blur(0.4px)";
					}
				}
			},
			{
				root: null,
				// Center band ~ 40-90% of viewport.
				rootMargin: "-30% 0px -10% 0px",
				threshold: [0, 0.6, 1],
			},
		);
		observerRef.current = observer;
		for (const el of elements) {
			observer.observe(el);
		}

		return () => {
			observer.disconnect();
			observerRef.current = null;
			clear();
		};
	}, [contentSelector, focusMode, reducedMotion]);

	return null;
}

export function FocusModeToggleButton({
	className,
}: { className?: string }) {
	const focusMode = useReadingStore((s) => s.settings.focusMode);
	const update = useReadingStore((s) => s.updateSettings);
	return (
		<button
			type="button"
			aria-pressed={focusMode}
			onClick={() => update({ focusMode: !focusMode })}
			className={className}
			data-focus-mode={focusMode ? "on" : "off"}
		>
			{focusMode ? "✶ Focus on" : "Focus mode"}
		</button>
	);
}
