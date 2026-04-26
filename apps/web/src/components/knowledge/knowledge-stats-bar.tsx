"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeGraphStats } from "@/hooks/use-knowledge";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import {
	BookOpenCheck,
	GitBranch,
	type LucideIcon,
	Network,
	Sparkles,
} from "lucide-react";

interface StatTile {
	key: "entity" | "relation" | "article_link" | "embedding";
	labelKey: string;
	descKey: string;
	Icon: LucideIcon;
	accent: string;
}

const TILES: ReadonlyArray<StatTile> = [
	{
		key: "entity",
		labelKey: "Total entities",
		descKey: "Names, organizations, regulations and concepts indexed.",
		Icon: Network,
		accent: "#0f766e",
	},
	{
		key: "relation",
		labelKey: "Total relations",
		descKey: "Co-occurrence and AI-extracted edges between entities.",
		Icon: GitBranch,
		accent: "#b45309",
	},
	{
		key: "article_link",
		labelKey: "Article links",
		descKey: "Article-to-entity references behind the graph.",
		Icon: BookOpenCheck,
		accent: "#6d28d9",
	},
	{
		key: "embedding",
		labelKey: "Vector-ready entities",
		descKey: "Entities that have semantic embeddings for hybrid search.",
		Icon: Sparkles,
		accent: "#1d4ed8",
	},
];

const itemVariants = {
	hidden: { opacity: 0, y: 12 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.32, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06, delayChildren: 0.04 },
	},
};

function formatCompact(value: number): string {
	if (value < 1000) return value.toString();
	if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
	return `${Math.round(value / 1000)}k`;
}

export function KnowledgeStatsBar() {
	const t = useT();
	const { data, isLoading, isError } = useKnowledgeGraphStats();

	const counts: Record<StatTile["key"], number | null> = {
		entity: data?.entity_count ?? null,
		relation: data?.relation_count ?? null,
		article_link: data?.article_entity_count ?? null,
		embedding: data?.entities_with_embedding ?? null,
	};

	return (
		<motion.div
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
		>
			{TILES.map((tile) => {
				const count = counts[tile.key];
				return (
					<motion.div key={tile.key} variants={itemVariants}>
						<Card className="h-full">
							<CardContent className="flex items-start gap-3 p-4">
								<div
									className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
									style={{
										backgroundColor: "var(--surface-accent-icon-bg)",
										color: tile.accent,
									}}
								>
									<tile.Icon aria-hidden="true" className="h-5 w-5" />
								</div>
								<div className="min-w-0">
									<p
										className="text-xs uppercase tracking-wide"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t(tile.labelKey)}
									</p>
									{isLoading ? (
										<Skeleton variant="text" width={64} height={26} />
									) : isError || count == null ? (
										<p
											className="text-2xl font-semibold"
											style={{ color: "var(--surface-muted-text)" }}
										>
											—
										</p>
									) : (
										<p
											className="text-2xl font-bold tabular-nums"
											style={{ color: "var(--field-foreground)" }}
											title={count.toLocaleString()}
										>
											{formatCompact(count)}
										</p>
									)}
									<p
										className="mt-1 text-xs leading-5"
										style={{ color: "var(--surface-muted-text)" }}
									>
										{t(tile.descKey)}
									</p>
								</div>
							</CardContent>
						</Card>
					</motion.div>
				);
			})}
		</motion.div>
	);
}
