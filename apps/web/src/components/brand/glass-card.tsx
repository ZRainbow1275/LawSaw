"use client";

import { type HTMLMotionProps, motion } from "framer-motion";
import type { ReactNode } from "react";

interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
	children: ReactNode;
	/** Additional Tailwind classes */
	className?: string;
	/** Hover lift effect — default true */
	hover?: boolean;
	/** Custom style override for the inner surface */
	surfaceStyle?: React.CSSProperties;
}

const baseCardStyle = {
	backgroundColor: "var(--glass-bg)",
	backdropFilter: "var(--glass-blur)",
	WebkitBackdropFilter: "var(--glass-blur)",
	border: "var(--glass-border)",
	boxShadow: "var(--glass-shadow)",
} as const;

/**
 * GlassCard — reusable glassmorphism card matching prototype's
 * `.stats-card`, `.info-card`, `.pinned-card` visual DNA.
 *
 * Applies:
 *  - rgba(255,255,255,0.85) background
 *  - blur(12px) backdrop filter
 *  - 1px solid rgba(255,255,255,0.2) border
 *  - Optional hover lift via Framer Motion
 */
export function GlassCard({
	children,
	className,
	hover = true,
	surfaceStyle,
	...motionProps
}: GlassCardProps) {
	return (
		<motion.div
			className={`overflow-hidden rounded-2xl ${className ?? ""}`}
			style={{ ...baseCardStyle, ...surfaceStyle }}
			whileHover={hover ? { y: -2, scale: 1.01 } : undefined}
			transition={{ duration: 0.2, ease: "easeOut" }}
			{...motionProps}
		>
			{children}
		</motion.div>
	);
}
