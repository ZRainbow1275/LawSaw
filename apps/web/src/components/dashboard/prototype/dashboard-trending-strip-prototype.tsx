"use client";

/**
 * DashboardTrendingStripPrototype — `prototype/app.html:787` marquee strip.
 *
 * Renders a horizontally-scrolling marquee of the latest 10 published
 * articles. The track is duplicated and animated via the project-wide
 * `animate-marquee-track` utility (30s linear infinite, hover-pauses).
 */

import { useArticles } from "@/hooks/use-articles";
import { useT } from "@/lib/i18n-client";
import { Flame } from "lucide-react";

interface Props {
	limit?: number;
	onSelectArticle?: (id: string) => void;
}

export function DashboardTrendingStripPrototype({
	limit = 10,
	onSelectArticle,
}: Props) {
	const t = useT();
	const { data } = useArticles({ limit, status: "published" });
	const articles = data?.data ?? [];
	const items = [...articles, ...articles];

	if (articles.length === 0) return null;

	return (
		<div
			className="mb-5 flex items-center gap-4 overflow-hidden rounded-xl border bg-white px-5 py-3"
			style={{ borderColor: "var(--color-neutral-200)" }}
		>
			<div
				className="flex shrink-0 items-center gap-1.5 text-xs font-bold"
				style={{ color: "var(--color-primary-500)" }}
			>
				<Flame aria-hidden="true" className="h-3.5 w-3.5" />
				{t("Hot topics")}
			</div>
			<div className="relative flex-1 overflow-hidden">
				<div className="animate-marquee-track flex gap-6 whitespace-nowrap will-change-transform">
					{items.map((article, index) => {
						const rank = (index % articles.length) + 1;
						return (
							<button
								key={`${article.id}-${index}`}
								type="button"
								onClick={() => onSelectArticle?.(article.id)}
								className="group inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium transition-colors"
								style={{ color: "var(--color-neutral-600)" }}
							>
								<span
									className="text-[11px] font-extrabold opacity-60"
									style={{ color: "var(--color-primary-500)" }}
								>
									{rank}
								</span>
								<span className="group-hover:text-[var(--color-primary-500)]">
									{article.title}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
