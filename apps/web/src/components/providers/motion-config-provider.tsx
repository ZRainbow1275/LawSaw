"use client";

import { MotionConfig, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface MotionConfigProviderProps {
	children: ReactNode;
}

/**
 * MotionConfigProvider — establishes a single source of truth for
 * framer-motion's accessibility behaviour. When the user signals they prefer
 * reduced motion (OS-level / Settings) every descendant motion component
 * automatically opts out of large transforms, scale and parallax effects via
 * the `reducedMotion="user"` flag, while still preserving opacity-only
 * micro-interactions where appropriate.
 *
 * Wrap the app once at the root; children read the same setting through
 * `useReducedMotion()` for any hand-tuned effects (parallax, tilt, focus dim).
 */
export function MotionConfigProvider({ children }: MotionConfigProviderProps) {
	return (
		<MotionConfig
			reducedMotion="user"
			transition={{
				type: "tween",
				duration: 0.22,
				ease: [0.4, 0, 0.2, 1],
			}}
		>
			{children}
		</MotionConfig>
	);
}

export { useReducedMotion };
