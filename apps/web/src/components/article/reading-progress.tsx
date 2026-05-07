"use client";

/**
 * Reading progress bar.
 * A fixed top progress indicator that can persist and restore progress.
 */

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useReadingStore } from "@/stores/reading-store";
import { motion, useScroll, useSpring } from "framer-motion";
import * as React from "react";

// ============================================
// Types
// ============================================

interface ReadingProgressProps {
	/** Article ID used for persisting progress */
	articleId?: string;
	/** Container element ref (defaults to document scroll) */
	containerRef?: React.RefObject<HTMLElement>;
	/** Whether to show percentage text */
	showPercentage?: boolean;
	/** Progress bar height */
	height?: number;
	/** Custom class name */
	className?: string;
}

// ============================================
// Component
// ============================================

export function ReadingProgress({
	articleId,
	containerRef,
	showPercentage = false,
	height = 2,
	className,
}: ReadingProgressProps) {
	const t = useT();
	const { scrollYProgress } = useScroll({
		container: containerRef,
	});

	const updateProgress = useReadingStore((s) => s.updateProgress);

	// Use spring animation for smoother progress.
	const scaleX = useSpring(scrollYProgress, {
		stiffness: 100,
		damping: 30,
		restDelta: 0.001,
	});

	// Persist reading progress.
	React.useEffect(() => {
		if (!articleId) return;

		const unsubscribe = scrollYProgress.on("change", (v) => {
			if (v > 0.01) {
				updateProgress(articleId, {
					progress: v,
					scrollPosition: window.scrollY,
				});
			}
		});

		return unsubscribe;
	}, [scrollYProgress, articleId, updateProgress]);

	return (
		<>
			{/* Bar */}
			<motion.div
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={t("Reading progress")}
				className={cn(
					"fixed top-0 left-0 right-0 z-50 origin-left",
					"bg-gradient-to-r from-primary-500 to-primary-400",
					className,
				)}
				style={{
					scaleX,
					height,
				}}
			/>

			{/* Optional: percentage */}
			{showPercentage && (
				<ProgressPercentage scrollYProgress={scrollYProgress} />
			)}
		</>
	);
}

// ============================================
// Percentage
// ============================================

function ProgressPercentage({
	scrollYProgress,
}: {
	scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
	return (
		<motion.div
			className="fixed top-4 right-4 z-50 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 shadow-lg border border-neutral-100 dark:bg-neutral-900/90 dark:border-white/10"
			initial={{ opacity: 0, y: -10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.5 }}
		>
			<motion.span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
				{/* Subscribe to motion value updates */}
				<ProgressValue scrollYProgress={scrollYProgress} />
			</motion.span>
		</motion.div>
	);
}

function ProgressValue({
	scrollYProgress,
}: {
	scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
	// Client-rendered value.
	const [percentage, setPercentage] = React.useState(0);

	React.useEffect(() => {
		const unsubscribe = scrollYProgress.on("change", (latest) => {
			setPercentage(Math.round(latest * 100));
		});
		return unsubscribe;
	}, [scrollYProgress]);

	return <>{percentage}%</>;
}

// ============================================
// Hook: progress state
// ============================================

export function useReadingProgress(
	containerRef?: React.RefObject<HTMLElement>,
) {
	const { scrollYProgress } = useScroll({
		container: containerRef,
	});

	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		const unsubscribe = scrollYProgress.on("change", (latest) => {
			setProgress(latest);
		});
		return unsubscribe;
	}, [scrollYProgress]);

	return {
		progress,
		percentage: Math.round(progress * 100),
		scrollYProgress,
	};
}
