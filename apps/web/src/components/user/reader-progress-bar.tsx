"use client";

import { useT } from "@/lib/i18n-client";
import { motion, useScroll, useSpring } from "framer-motion";

interface ReaderProgressBarProps {
	containerRef?: React.RefObject<HTMLElement | null>;
}

const shimmerStyle = {
	background:
		"linear-gradient(90deg, var(--color-primary-500), var(--color-primary-400), var(--color-primary-500))",
	backgroundSize: "200% 100%",
} as const;

export function ReaderProgressBar({ containerRef }: ReaderProgressBarProps) {
	const t = useT();
	const { scrollYProgress } = useScroll({
		container: containerRef,
	});

	const scaleX = useSpring(scrollYProgress, {
		stiffness: 110,
		damping: 26,
		restDelta: 0.001,
	});

	return (
		<motion.div
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-label={t("Reading progress")}
			className="animate-shimmer-bar fixed left-0 right-0 top-0 z-50 h-[3px] origin-left"
			style={{ ...shimmerStyle, scaleX }}
		/>
	);
}
