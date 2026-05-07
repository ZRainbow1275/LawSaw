/**
 * Motion system - Framer Motion variants.
 * Follows the motion guidelines in DESIGN_HANDBOOK.md.
 */

import type { Transition, Variants } from "framer-motion";

// ============================================
// Base transitions
// ============================================

export const transitions = {
	/** Fast feedback - 150ms */
	fast: {
		duration: 0.15,
		ease: [0, 0, 0.2, 1], // ease-out
	} satisfies Transition,

	/** Default transition - 200ms */
	default: {
		duration: 0.2,
		ease: [0.4, 0, 0.2, 1], // ease-default
	} satisfies Transition,

	/** Enter transition - 300ms */
	enter: {
		duration: 0.3,
		ease: [0, 0, 0.2, 1], // ease-out
	} satisfies Transition,

	/** Spring - for sidebar/drawer */
	spring: {
		type: "spring",
		damping: 25,
		stiffness: 200,
	} satisfies Transition,

	/** Light spring - for buttons/icons */
	springLight: {
		type: "spring",
		damping: 20,
		stiffness: 300,
	} satisfies Transition,

	/** Slow transition - 500ms */
	slow: {
		duration: 0.5,
		ease: [0.4, 0, 0.2, 1],
	} satisfies Transition,
} as const;

// ============================================
// Page transitions
// ============================================

export const pageVariants: Variants = {
	initial: {
		opacity: 0,
		y: 8,
	},
	enter: {
		opacity: 1,
		y: 0,
		transition: transitions.enter,
	},
	exit: {
		opacity: 0,
		y: -8,
		transition: transitions.fast,
	},
};

// ============================================
// Fade in
// ============================================

export const fadeVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: transitions.default,
	},
	exit: {
		opacity: 0,
		transition: transitions.fast,
	},
};

// ============================================
// Slide in
// ============================================

export const slideUpVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 20,
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: transitions.enter,
	},
	exit: {
		opacity: 0,
		y: -10,
		transition: transitions.fast,
	},
};

export const slideDownVariants: Variants = {
	hidden: {
		opacity: 0,
		y: -20,
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: transitions.enter,
	},
};

export const slideLeftVariants: Variants = {
	hidden: {
		opacity: 0,
		x: 20,
	},
	visible: {
		opacity: 1,
		x: 0,
		transition: transitions.enter,
	},
};

export const slideRightVariants: Variants = {
	hidden: {
		opacity: 0,
		x: -20,
	},
	visible: {
		opacity: 1,
		x: 0,
		transition: transitions.enter,
	},
};

// ============================================
// Scale
// ============================================

export const scaleVariants: Variants = {
	hidden: {
		opacity: 0,
		scale: 0.95,
	},
	visible: {
		opacity: 1,
		scale: 1,
		transition: transitions.enter,
	},
	exit: {
		opacity: 0,
		scale: 0.95,
		transition: transitions.fast,
	},
};

export const popVariants: Variants = {
	hidden: {
		opacity: 0,
		scale: 0.8,
	},
	visible: {
		opacity: 1,
		scale: 1,
		transition: transitions.springLight,
	},
	exit: {
		opacity: 0,
		scale: 0.8,
		transition: transitions.fast,
	},
};

// ============================================
// Sidebar
// ============================================

export const sidebarVariants: Variants = {
	hidden: {
		x: -280,
		opacity: 0,
	},
	visible: {
		x: 0,
		opacity: 1,
		transition: transitions.spring,
	},
	exit: {
		x: -280,
		opacity: 0,
		transition: transitions.spring,
	},
};

// ============================================
// Staggered list
// ============================================

export const staggerContainerVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.05,
			delayChildren: 0.1,
		},
	},
};

export const staggerItemVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 20,
	},
	visible: {
		opacity: 1,
		y: 0,
		transition: transitions.enter,
	},
};

// ============================================
// Toast
// ============================================

export const toastVariants: Variants = {
	// P2#6 — Slide-in from top-right with subtle scale lift, exit slides out
	// horizontally to the right so stacked toasts cascade naturally.
	hidden: {
		opacity: 0,
		x: 60,
		y: -8,
		scale: 0.96,
	},
	visible: {
		opacity: 1,
		x: 0,
		y: 0,
		scale: 1,
		transition: transitions.spring,
	},
	exit: {
		opacity: 0,
		x: 80,
		scale: 0.95,
		transition: transitions.fast,
	},
};

// ============================================
// Overlay
// ============================================

export const overlayVariants: Variants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: transitions.default,
	},
	exit: {
		opacity: 0,
		transition: transitions.fast,
	},
};

// ============================================
// Card hover effect (for whileHover)
// ============================================

export const cardHoverEffect = {
	y: -4,
	transition: transitions.default,
};

export const buttonHoverEffect = {
	scale: 1.02,
	transition: transitions.fast,
};

export const buttonTapEffect = {
	scale: 0.98,
};

// ============================================
// Icon
// ============================================

export const iconBounceVariants: Variants = {
	initial: { scale: 1 },
	animate: {
		scale: [1, 1.2, 1],
		transition: {
			duration: 0.3,
			ease: "easeInOut",
		},
	},
};

export const rotateVariants: Variants = {
	initial: { rotate: 0 },
	animate: {
		rotate: 360,
		transition: {
			duration: 1,
			ease: "linear",
			repeat: Number.POSITIVE_INFINITY,
		},
	},
};

// ============================================
// Skeleton shimmer (for CSS)
// ============================================

export const skeletonKeyframes = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

// ============================================
// Utilities
// ============================================

/**
 * Create a staggered container variant.
 * @param staggerDelay Delay between children (seconds)
 * @param initialDelay Initial delay before the first child (seconds)
 */
export function createStaggerVariants(
	staggerDelay = 0.05,
	initialDelay = 0.1,
): Variants {
	return {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: staggerDelay,
				delayChildren: initialDelay,
			},
		},
	};
}

/**
 * Create a slide-in variant.
 * @param direction Slide direction
 * @param distance Travel distance (px)
 */
export function createSlideVariants(
	direction: "up" | "down" | "left" | "right" = "up",
	distance = 20,
): Variants {
	const isVertical = direction === "up" || direction === "down";
	const value =
		direction === "up" || direction === "left" ? distance : -distance;

	if (isVertical) {
		return {
			hidden: { opacity: 0, y: value },
			visible: { opacity: 1, y: 0, transition: transitions.enter },
		};
	}
	return {
		hidden: { opacity: 0, x: value },
		visible: { opacity: 1, x: 0, transition: transitions.enter },
	};
}
