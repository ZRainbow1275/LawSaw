"use client";

import { useArticles } from "@/hooks/use-articles";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";

interface TrendingStripProps {
	/** Max articles to show in the ticker. Default 8. */
	max?: number;
}

const stripShellStyle = {
	backgroundColor: "var(--color-card)",
	border: "1px solid var(--surface-muted-border)",
	boxShadow: "var(--shadow-sm)",
} as const;

const labelStyle = {
	backgroundColor: "var(--surface-accent-icon-bg)",
	color: "var(--color-primary-600)",
} as const;

const rankStyle = {
	backgroundColor: "var(--color-primary-500)",
	color: "#ffffff",
} as const;

/**
 * TrendingStrip — marquee-style horizontal ticker showing the latest article
 * titles, matching prototype `.trending-strip`. Animates continuously left.
 */
export function TrendingStrip({ max = 8 }: TrendingStripProps) {
	const t = useT();
	const { data } = useArticles({ limit: max, status: "published" });

	const articles = data?.data ?? [];
	// Duplicate so the marquee loops seamlessly
	const items = [...articles, ...articles];

	if (articles.length === 0) return null;

	return (
		<div
			className="flex items-center overflow-hidden rounded-xl"
			style={stripShellStyle}
		>
			{/* Flame label */}
			<div
				className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold"
				style={labelStyle}
			>
				<Flame aria-hidden="true" className="h-3.5 w-3.5" />
				{t("Hot")}
			</div>

			{/* Scrolling track */}
			<div className="relative flex-1 overflow-hidden">
				<motion.div
					className="flex items-center gap-6 whitespace-nowrap py-2.5 pl-4 pr-4"
					animate={{ x: ["0%", "-50%"] }}
					transition={{
						duration: articles.length * 4,
						repeat: Number.POSITIVE_INFINITY,
						ease: "linear",
					}}
				>
					{items.map((article, index) => {
						const rank = (index % articles.length) + 1;
						return (
							<span
								key={`${article.id}-${index}`}
								className="inline-flex shrink-0 items-center gap-2 text-sm"
								style={{ color: "var(--field-foreground)" }}
							>
								<span
									className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
									style={rankStyle}
								>
									{rank}
								</span>
								<span className="max-w-[260px] truncate">{article.title}</span>
							</span>
						);
					})}
				</motion.div>
			</div>
		</div>
	);
}
