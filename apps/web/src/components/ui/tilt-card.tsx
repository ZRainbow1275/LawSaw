"use client";

/**
 * TiltCard (P3#8).
 *
 * Wraps a heavy hero/feature card with a perspective tilt that follows the
 * pointer. Tilt is bounded to ±4° on both axes to stay subtle (Linear /
 * Stripe style). Honours `useReducedMotion()` and short-circuits to a plain
 * `<div>` when reduced motion is requested. Lazy: pointer listeners are only
 * attached while the user is hovering, and we use `useMotionValue` so the
 * tilt update never triggers a React re-render.
 *
 * Use sparingly — only on dashboard hero cards or featured article cards,
 * not list rows (per PRD: list items must remain responsive).
 */

import { cn } from "@/lib/utils";
import {
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
} from "framer-motion";
import { type CSSProperties, type ReactNode, useRef } from "react";

interface TiltCardProps {
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	/** Max tilt in degrees per axis. Default ±4°. */
	maxTilt?: number;
	/** Subtle highlight on hover (sheen). Default true. */
	withSheen?: boolean;
	/** Extra hover lift (translateZ) in pixels. Default 6px. */
	hoverLift?: number;
}

export function TiltCard({
	children,
	className,
	style,
	maxTilt = 4,
	withSheen = true,
	hoverLift = 6,
}: TiltCardProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const reducedMotion = useReducedMotion() ?? false;

	const x = useMotionValue(0.5);
	const y = useMotionValue(0.5);
	const rotateY = useTransform(
		x,
		[0, 1],
		[`${-maxTilt}deg`, `${maxTilt}deg`],
	);
	const rotateX = useTransform(
		y,
		[0, 1],
		[`${maxTilt}deg`, `${-maxTilt}deg`],
	);
	const sheenX = useTransform(x, [0, 1], ["10%", "90%"]);
	const sheenY = useTransform(y, [0, 1], ["20%", "80%"]);

	const springRotateY = useSpring(rotateY, { stiffness: 220, damping: 22 });
	const springRotateX = useSpring(rotateX, { stiffness: 220, damping: 22 });

	if (reducedMotion) {
		return (
			<div className={className} style={style}>
				{children}
			</div>
		);
	}

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		const node = ref.current;
		if (!node) return;
		const rect = node.getBoundingClientRect();
		x.set((event.clientX - rect.left) / rect.width);
		y.set((event.clientY - rect.top) / rect.height);
	};

	const handlePointerLeave = () => {
		x.set(0.5);
		y.set(0.5);
	};

	return (
		<motion.div
			ref={ref}
			className={cn("relative will-change-transform", className)}
			style={{
				...style,
				transformStyle: "preserve-3d",
				perspective: 1200,
			}}
			whileHover={{ translateZ: hoverLift, y: -2 }}
			onPointerMove={handlePointerMove}
			onPointerLeave={handlePointerLeave}
		>
			<motion.div
				className="relative h-full w-full rounded-[inherit]"
				style={{
					rotateX: springRotateX,
					rotateY: springRotateY,
					transformStyle: "preserve-3d",
				}}
			>
				{children}
				{withSheen ? (
					<motion.div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light opacity-0 transition-opacity duration-200 hover:opacity-100"
						style={{
							background:
								"radial-gradient(circle at var(--sheen-x, 50%) var(--sheen-y, 40%), rgba(255,255,255,0.45), transparent 55%)",
							// @ts-expect-error - CSS custom props are not recognised in CSSProperties
							"--sheen-x": sheenX,
							"--sheen-y": sheenY,
						}}
					/>
				) : null}
			</motion.div>
		</motion.div>
	);
}
