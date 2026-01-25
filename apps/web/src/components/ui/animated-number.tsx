"use client";

import { cn } from "@/lib/utils";
import { motion, useInView, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// ============================================
// 类型定义
// ============================================

interface AnimatedNumberProps {
	value: number;
	/** 动画持续时间（毫秒） */
	duration?: number;
	/** 数字格式化函数 */
	formatter?: (value: number) => string;
	/** 是否在视口内才开始动画 */
	animateOnView?: boolean;
	/** 前缀文本 */
	prefix?: string;
	/** 后缀文本 */
	suffix?: string;
	/** 自定义类名 */
	className?: string;
	/** 数字类名 */
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
// 默认格式化器
// ============================================

const defaultFormatter = (value: number): string => {
	if (value >= 1000000) {
		return `${(value / 1000000).toFixed(1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}K`;
	}
	return Math.round(value).toLocaleString();
};

// ============================================
// AnimatedNumber 组件
// ============================================

export function AnimatedNumber({
	value,
	duration = 1000,
	formatter = defaultFormatter,
	animateOnView = true,
	prefix,
	suffix,
	className,
	numberClassName,
}: AnimatedNumberProps) {
	const ref = useRef<HTMLSpanElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-50px" });
	const [displayValue, setDisplayValue] = useState(animateOnView ? 0 : value);

	// Spring 动画配置
	const springValue = useSpring(0, {
		duration: duration,
		bounce: 0,
	});

	// 监听值变化
	useEffect(() => {
		if (!animateOnView || isInView) {
			springValue.set(value);
		}
	}, [value, isInView, animateOnView, springValue]);

	// 订阅 spring 值变化
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
				{formatter(displayValue)}
			</motion.span>
			{suffix && <span className="text-neutral-500 ml-0.5">{suffix}</span>}
		</span>
	);
}

// ============================================
// AnimatedCounter 组件（简化版）
// ============================================

export function AnimatedCounter({
	from = 0,
	to,
	duration = 1000,
	delay = 0,
	className,
	formatter = defaultFormatter,
}: AnimatedCounterProps) {
	const ref = useRef<HTMLSpanElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-20px" });

	const springValue = useSpring(from, {
		duration: duration,
		bounce: 0,
	});

	const displayValue = useTransform(springValue, (latest) => formatter(latest));

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
// AnimatedPercentage 组件
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
			{displayValue.toFixed(1)}%
		</motion.span>
	);
}

// ============================================
// 导出
// ============================================

export default AnimatedNumber;
