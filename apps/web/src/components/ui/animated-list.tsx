"use client";

import { staggerContainerVariants, transitions } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, type Variants, motion } from "framer-motion";
import { Children, type ReactNode, isValidElement } from "react";

// ============================================
// Type definitions
// ============================================

interface AnimatedListProps {
	children: ReactNode;
	/** Custom class name */
	className?: string;
	/** Gap class between items */
	gap?: string;
	/** Delay between children (seconds) */
	staggerDelay?: number;
	/** Direction */
	direction?: "up" | "down" | "left" | "right";
	/** Enable animation */
	animate?: boolean;
	/** Initial delay (seconds) */
	initialDelay?: number;
	/** Wrap with AnimatePresence (for enter/exit animations) */
	animatePresence?: boolean;
}

interface AnimatedListItemProps {
	children: ReactNode;
	className?: string;
	/** Custom variants */
	variants?: Variants;
	/** Click handler */
	onClick?: () => void;
}

// ============================================
// Variants factory
// ============================================

const createItemVariants = (
	direction: "up" | "down" | "left" | "right",
	distance = 20,
): Variants => {
	const offsets = {
		up: { x: 0, y: distance },
		down: { x: 0, y: -distance },
		left: { x: distance, y: 0 },
		right: { x: -distance, y: 0 },
	};

	return {
		hidden: {
			opacity: 0,
			...offsets[direction],
			scale: 0.95,
		},
		visible: {
			opacity: 1,
			x: 0,
			y: 0,
			scale: 1,
			transition: transitions.enter,
		},
		exit: {
			opacity: 0,
			scale: 0.95,
			transition: transitions.fast,
		},
	};
};

// ============================================
// AnimatedList container
// ============================================

export function AnimatedList({
	children,
	className,
	gap = "space-y-4",
	staggerDelay = 0.05,
	direction = "up",
	animate = true,
	initialDelay = 0,
	animatePresence = false,
}: AnimatedListProps) {
	const containerVariants: Variants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				delayChildren: initialDelay,
				staggerChildren: staggerDelay,
			},
		},
	};

	const itemVariants = createItemVariants(direction);

	const content = Children.toArray(children).map((child) => (
		<motion.div
			key={
				isValidElement(child)
					? child.key
					: `animated-list-item:${String(child)}`
			}
			variants={itemVariants}
			layout={animatePresence}
		>
			{child}
		</motion.div>
	));

	if (!animate) {
		return <div className={cn(gap, className)}>{children}</div>;
	}

	return (
		<motion.div
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className={cn(gap, className)}
		>
			{animatePresence ? (
				<AnimatePresence mode="popLayout">{content}</AnimatePresence>
			) : (
				content
			)}
		</motion.div>
	);
}

// ============================================
// AnimatedListItem (standalone)
// ============================================

export function AnimatedListItem({
	children,
	className,
	variants,
	onClick,
}: AnimatedListItemProps) {
	const defaultVariants: Variants = {
		hidden: { opacity: 0, y: 20, scale: 0.95 },
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
			transition: transitions.enter,
		},
		exit: {
			opacity: 0,
			scale: 0.95,
			transition: transitions.fast,
		},
	};

	return (
		<motion.div
			variants={variants || defaultVariants}
			className={className}
			onClick={onClick}
			layout
		>
			{children}
		</motion.div>
	);
}

// ============================================
// AnimatedGrid (grid layout)
// ============================================

interface AnimatedGridProps {
	children: ReactNode;
	className?: string;
	/** Column configuration */
	columns?: {
		default?: number;
		sm?: number;
		md?: number;
		lg?: number;
		xl?: number;
	};
	/** Gap */
	gap?: number;
	staggerDelay?: number;
	animate?: boolean;
}

export function AnimatedGrid({
	children,
	className,
	columns = { default: 1, md: 2, lg: 3 },
	gap = 4,
	staggerDelay = 0.05,
	animate = true,
}: AnimatedGridProps) {
	const gridCols = [
		columns.default && `grid-cols-${columns.default}`,
		columns.sm && `sm:grid-cols-${columns.sm}`,
		columns.md && `md:grid-cols-${columns.md}`,
		columns.lg && `lg:grid-cols-${columns.lg}`,
		columns.xl && `xl:grid-cols-${columns.xl}`,
	]
		.filter(Boolean)
		.join(" ");

	const containerVariants: Variants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: staggerDelay,
			},
		},
	};

	const itemVariants: Variants = {
		hidden: { opacity: 0, y: 20, scale: 0.95 },
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
			transition: transitions.enter,
		},
	};

	if (!animate) {
		return (
			<div className={cn(`grid gap-${gap}`, gridCols, className)}>
				{children}
			</div>
		);
	}

	return (
		<motion.div
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className={cn(`grid gap-${gap}`, gridCols, className)}
		>
			{Children.toArray(children).map((child) => (
				<motion.div
					key={
						isValidElement(child)
							? child.key
							: `animated-grid-item:${String(child)}`
					}
					variants={itemVariants}
				>
					{child}
				</motion.div>
			))}
		</motion.div>
	);
}

// ============================================
// Preset configs
// ============================================

export const listAnimationPresets = {
	/** Quick fade */
	fadeIn: {
		staggerDelay: 0.03,
		direction: "up" as const,
	},
	/** Slow cascade */
	cascade: {
		staggerDelay: 0.1,
		direction: "up" as const,
	},
	/** Slide from left */
	slideFromLeft: {
		staggerDelay: 0.05,
		direction: "left" as const,
	},
	/** Slide from right */
	slideFromRight: {
		staggerDelay: 0.05,
		direction: "right" as const,
	},
};

// ============================================
// Exports
// ============================================

export default AnimatedList;
