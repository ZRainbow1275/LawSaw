"use client";

import { type Locale, formatNumber } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// ============================================
// Type definitions
// ============================================

interface AnimatedNumberProps {
	value: number;
	/** Animation duration (ms) */
	duration?: number;
	/** Number formatter */
	formatter?: (value: number) => string;
	/** Start animation only when in viewport */
	animateOnView?: boolean;
	/** Prefix */
	prefix?: string;
	/** Suffix */
	suffix?: string;
	/** Custom class name */
	className?: string;
	/** Number class name */
	numberClassName?: string;
}

interface AnimatedCounterProps {
	from?: number;
	to: number;
	duration?: number;
	delay?: number;
	className?: string;
	formatter?: (value: number) => string;
}

// ============================================
// Default formatter
// ============================================

const defaultFormatter = (locale: Locale, value: number): string => {
	if (value >= 1000000) {
		return `${formatNumber(locale, value / 1000000, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
		})}M`;
	}
	if (value >= 1000) {
		return `${formatNumber(locale, value / 1000, {
			minimumFractionDigits: 1,
			maximumFractionDigits: 1,
		})}K`;
	}
	return formatNumber(locale, Math.round(value));
};

// ============================================
// AnimatedNumber component
// ============================================

export function AnimatedNumber({
	value,
	duration = 1000,
	formatter,
	animateOnView = true,
	prefix,
	suffix,
	className,
	numberClassName,
}: AnimatedNumberProps) {
	const locale = useLocale();
	const effectiveFormatter =
		formatter ?? ((nextValue: number) => defaultFormatter(locale, nextValue));

	const ref = useRef<HTMLSpanElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-50px" });
	const [displayValue, setDisplayValue] = useState(animateOnView ? 0 : value);

	// Spring config
	const springValue = useSpring(0, {
		duration: duration,
		bounce: 0,
	});

	// Watch value changes
	useEffect(() => {
		if (!animateOnView || isInView) {
			springValue.set(value);
		}
	}, [value, isInView, animateOnView, springValue]);

	// Subscribe to spring updates
	useEffect(() => {
		const unsubscribe = springValue.on("change", (latest) => {
			setDisplayValue(latest);
		});
		return unsubscribe;
	}, [springValue]);

	return (
		<span ref={ref} className={cn("inline-flex items-baseline", className)}>
			{prefix && <span className="text-neutral-500 mr-0.5">{prefix}</span>}
			<motion.span
				className={cn("tabular-nums font-semibold", numberClassName)}
				initial={{ opacity: 0, y: 10 }}
				animate={
					!animateOnView || isInView
						? { opacity: 1, y: 0 }
						: { opacity: 0, y: 10 }
				}
				transition={{ duration: 0.3 }}
			>
				{effectiveFormatter(displayValue)}
			</motion.span>
			{suffix && <span className="text-neutral-500 ml-0.5">{suffix}</span>}
		</span>
	);
}

// ============================================
// AnimatedCounter component (simple)
// ============================================

export function AnimatedCounter({
	from = 0,
	to,
	duration = 1000,
	delay = 0,
	className,
	formatter,
}: AnimatedCounterProps) {
	const locale = useLocale();
	const effectiveFormatter =
		formatter ?? ((nextValue: number) => defaultFormatter(locale, nextValue));

	const ref = useRef<HTMLSpanElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-20px" });

	const springValue = useSpring(from, {
		duration: duration,
		bounce: 0,
	});

	const displayValue = useTransform(springValue, (latest) =>
		effectiveFormatter(latest),
	);

	useEffect(() => {
		if (isInView) {
			const timer = setTimeout(() => {
				springValue.set(to);
			}, delay);
			return () => clearTimeout(timer);
		}
	}, [isInView, to, delay, springValue]);

	return (
		<motion.span
			ref={ref}
			className={cn("tabular-nums", className)}
			initial={{ opacity: 0, scale: 0.8 }}
			animate={isInView ? { opacity: 1, scale: 1 } : {}}
			transition={{ duration: 0.3, delay: delay / 1000 }}
		>
			{displayValue}
		</motion.span>
	);
}

// ============================================
// AnimatedPercentage component
// ============================================

interface AnimatedPercentageProps {
	value: number;
	duration?: number;
	className?: string;
	showSign?: boolean;
}

export function AnimatedPercentage({
	value,
	duration = 800,
	className,
	showSign = true,
}: AnimatedPercentageProps) {
	const locale = useLocale();
	const ref = useRef<HTMLSpanElement>(null);
	const isInView = useInView(ref, { once: true });
	const [displayValue, setDisplayValue] = useState(0);

	const springValue = useSpring(0, { duration, bounce: 0 });

	useEffect(() => {
		if (isInView) {
			springValue.set(value);
		}
	}, [isInView, value, springValue]);

	useEffect(() => {
		const unsubscribe = springValue.on("change", (latest) => {
			setDisplayValue(latest);
		});
		return unsubscribe;
	}, [springValue]);

	const isPositive = value > 0;
	const isNegative = value < 0;

	return (
		<motion.span
			ref={ref}
			className={cn(
				"inline-flex items-center gap-0.5 tabular-nums font-medium",
				isPositive && "text-green-600",
				isNegative && "text-red-600",
				!isPositive && !isNegative && "text-neutral-500",
				className,
			)}
			initial={{ opacity: 0, x: -5 }}
			animate={isInView ? { opacity: 1, x: 0 } : {}}
			transition={{ duration: 0.3 }}
		>
			{showSign && isPositive && "+"}
			{formatNumber(locale, displayValue, {
				minimumFractionDigits: 1,
				maximumFractionDigits: 1,
			})}
			%
		</motion.span>
	);
}

// ============================================
// Exports
// ============================================

export default AnimatedNumber;
