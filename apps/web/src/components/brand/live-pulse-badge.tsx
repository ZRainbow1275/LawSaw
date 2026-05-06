"use client";

import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";

interface LivePulseBadgeProps {
	label?: string;
	/** Color applied to both the dot and badge text. Defaults to --color-success green. */
	color?: string;
	className?: string;
}

const dotStyle = (color?: string) =>
	({
		backgroundColor: color ?? "var(--color-success)",
	}) as const;

const badgeStyle = (color?: string) =>
	({
		color: color ?? "var(--color-success)",
		backgroundColor: color
			? `color-mix(in srgb, ${color} 12%, transparent)`
			: "color-mix(in srgb, var(--color-success) 12%, transparent)",
		border: `1px solid ${color ? `color-mix(in srgb, ${color} 24%, transparent)` : "color-mix(in srgb, var(--color-success) 24%, transparent)"}`,
	}) as const;

/**
 * LivePulseBadge — matches prototype's `.live-dot` + inline "实时" label.
 * Used in Dashboard hero title, feed header, analytics header, etc.
 */
export function LivePulseBadge({
	label,
	color,
	className,
}: LivePulseBadgeProps) {
	const t = useT();
	const text = label ?? t("Live");

	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className ?? ""}`}
			style={badgeStyle(color)}
		>
			<motion.span
				aria-hidden="true"
				className="inline-block h-1.5 w-1.5 rounded-full"
				style={dotStyle(color)}
				animate={{
					scale: [1, 1.4, 1],
					opacity: [1, 0.6, 1],
					boxShadow: [
						`0 0 0 0 ${color ? `color-mix(in srgb, ${color} 40%, transparent)` : "rgba(40,167,69,0.4)"}`,
						`0 0 0 4px ${color ? `color-mix(in srgb, ${color} 0%, transparent)` : "rgba(40,167,69,0)"}`,
						`0 0 0 0 ${color ? `color-mix(in srgb, ${color} 0%, transparent)` : "rgba(40,167,69,0)"}`,
					],
				}}
				transition={{
					duration: 2,
					repeat: Number.POSITIVE_INFINITY,
					ease: "easeInOut",
				}}
			/>
			{text}
		</span>
	);
}
