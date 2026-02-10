"use client";

/**
 * AI insights card.
 * Displays AI analysis results for an article: summary, key entities and risk level.
 */

import { Badge } from "@/components/ui/badge";
import type { AiEntity, ArticleAiInsights } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { scaleVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	BookOpen,
	Building2,
	Calendar,
	ChevronDown,
	ChevronUp,
	Lightbulb,
	MapPin,
	Scale,
	Shield,
	Sparkles,
	User,
} from "lucide-react";
import { useState } from "react";

// ============================================
// Types
// ============================================

interface AiInsightsCardProps {
	insights: ArticleAiInsights | null;
	isLoading?: boolean;
	onEntityClick?: (entity: AiEntity) => void;
	className?: string;
	defaultExpanded?: boolean;
}

// ============================================
// Risk level config
// ============================================

const riskLevelConfig: Record<
	ArticleAiInsights["risk_level"],
	{ labelKey: string; color: string; bgColor: string; icon: string }
> = {
	low: {
		labelKey: "Low risk",
		color: "text-success",
		bgColor: "bg-success/10",
		icon: "🟢",
	},
	medium: {
		labelKey: "Medium risk",
		color: "text-warning",
		bgColor: "bg-warning/10",
		icon: "🟡",
	},
	high: {
		labelKey: "High risk",
		color: "text-orange-500",
		bgColor: "bg-orange-500/10",
		icon: "🟠",
	},
	critical: {
		labelKey: "Critical",
		color: "text-error",
		bgColor: "bg-error/10",
		icon: "🔴",
	},
};

// ============================================
// Entity type mapping
// ============================================

const entityIconMap: Record<
	AiEntity["entity_type"],
	React.ComponentType<{ className?: string }>
> = {
	organization: Building2,
	regulation: Scale,
	person: User,
	date: Calendar,
	location: MapPin,
	legal_term: BookOpen,
};

const entityTypeLabelKeys: Record<AiEntity["entity_type"], string> = {
	organization: "Organization",
	regulation: "Regulation",
	person: "Person",
	date: "Date",
	location: "Location",
	legal_term: "Legal term",
};

// ============================================
// Skeleton
// ============================================

function AiInsightsSkeleton() {
	return (
		<div className="glass-card p-5 space-y-4 animate-pulse">
			<div className="flex items-center gap-2">
				<div className="h-5 w-5 rounded bg-neutral-200" />
				<div className="h-5 w-24 rounded bg-neutral-200" />
			</div>
			<div className="space-y-2">
				<div className="h-4 w-full rounded bg-neutral-200" />
				<div className="h-4 w-3/4 rounded bg-neutral-200" />
			</div>
			<div className="flex gap-2">
				<div className="h-6 w-16 rounded-full bg-neutral-200" />
				<div className="h-6 w-20 rounded-full bg-neutral-200" />
				<div className="h-6 w-14 rounded-full bg-neutral-200" />
			</div>
		</div>
	);
}

// ============================================
// Main
// ============================================

export function AiInsightsCard({
	insights,
	isLoading = false,
	onEntityClick,
	className,
	defaultExpanded = true,
}: AiInsightsCardProps) {
	const t = useT();
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	// Loading state
	if (isLoading) {
		return <AiInsightsSkeleton />;
	}

	// No data
	if (!insights) {
		return null;
	}

	const riskConfig = riskLevelConfig[insights.risk_level];
	const keyPoints = Array.from(
		new Set(insights.key_points.map((p) => p.trim()).filter(Boolean)),
	);
	const recommendations = Array.from(
		new Set(insights.recommendations.map((r) => r.trim()).filter(Boolean)),
	);
	const tags = Array.from(
		new Set(insights.tags.map((t) => t.trim()).filter(Boolean)),
	);

	return (
		<motion.div
			variants={scaleVariants}
			initial="hidden"
			animate="visible"
			className={cn("glass-card overflow-hidden", className)}
		>
			{/* Header */}
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center justify-between p-4 hover:bg-neutral-50/50 transition-colors"
			>
				<div className="flex items-center gap-2">
					<Sparkles aria-hidden="true" className="h-5 w-5 text-primary-500" />
					<span className="font-semibold text-neutral-900">
						{t("AI insights")}
					</span>
				</div>
				<div className="flex items-center gap-3">
					{/* Risk */}
					<div
						className={cn(
							"flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
							riskConfig.bgColor,
							riskConfig.color,
						)}
					>
						<span>{riskConfig.icon}</span>
						<span>{t(riskConfig.labelKey)}</span>
					</div>
					{isExpanded ? (
						<ChevronUp aria-hidden="true" className="h-4 w-4 text-neutral-400" />
					) : (
						<ChevronDown aria-hidden="true" className="h-4 w-4 text-neutral-400" />
					)}
				</div>
			</button>

			{/* Body */}
			<AnimatePresence>
				{isExpanded && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<div className="px-4 pb-4 space-y-5 border-t border-neutral-100">
							{/* TL;DR */}
							<div className="pt-4">
								<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
									TL;DR
								</h4>
								<p className="text-sm text-neutral-700 leading-relaxed">
									{insights.summary}
								</p>
							</div>

							{/* Key points */}
							{keyPoints.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
										<Lightbulb aria-hidden="true" className="h-3.5 w-3.5" />
										{t("Key points")}
									</h4>
									<ul className="space-y-1.5">
										{keyPoints.map((point) => (
											<li
												key={point}
												className="text-sm text-neutral-600 flex items-start gap-2"
											>
												<span className="text-primary-500 mt-1">•</span>
												<span>{point}</span>
											</li>
										))}
									</ul>
								</div>
							)}

							{/* Entities */}
							{insights.entities.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
										{t("Key entities")}
									</h4>
									<div className="flex flex-wrap gap-2">
										{insights.entities.slice(0, 8).map((entity) => {
											const Icon = entityIconMap[entity.entity_type];
											const entityKey = `${entity.entity_type}:${entity.name}:${entity.context ?? ""}`;
											return (
												<button
													key={entityKey}
													type="button"
													onClick={() => onEntityClick?.(entity)}
													className={cn(
														"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs",
														"bg-neutral-100 text-neutral-700 hover:bg-primary-50 hover:text-primary-700",
														"transition-colors cursor-pointer",
													)}
													title={`${t(entityTypeLabelKeys[entity.entity_type])}: ${entity.context || entity.name}`}
												>
													<Icon aria-hidden="true" className="h-3 w-3" />
													<span>{entity.name}</span>
												</button>
											);
										})}
										{insights.entities.length > 8 && (
											<span className="text-xs text-neutral-400 self-center">
												{t("{count} more", {
													count: insights.entities.length - 8,
												})}
											</span>
										)}
									</div>
								</div>
							)}

							{/* Risk dimensions */}
							{(insights.risk_level === "high" ||
								insights.risk_level === "critical") &&
								insights.risk_dimensions.length > 0 && (
									<div>
										<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
											<AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
											{t("Risk dimensions")}
										</h4>
										<div className="space-y-2">
											{insights.risk_dimensions.map((dim) => (
												<div
													key={`${dim.name}:${dim.score}`}
													className="flex items-center gap-3"
												>
													<span className="text-xs text-neutral-600 w-16 shrink-0">
														{dim.name}
													</span>
													<div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
														<div
															className={cn(
																"h-full rounded-full transition-all",
																dim.score >= 75
																	? "bg-error"
																	: dim.score >= 50
																		? "bg-orange-500"
																		: dim.score >= 25
																			? "bg-warning"
																			: "bg-success",
															)}
															style={{ width: `${dim.score}%` }}
														/>
													</div>
													<span className="text-xs font-medium text-neutral-700 w-8 text-right">
														{dim.score}
													</span>
												</div>
											))}
										</div>
									</div>
								)}

							{/* Recommendations */}
							{recommendations.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
										<Shield aria-hidden="true" className="h-3.5 w-3.5" />
										{t("Compliance recommendations")}
									</h4>
									<ul className="space-y-1.5">
										{recommendations.map((rec) => (
											<li
												key={rec}
												className="text-sm text-neutral-600 flex items-start gap-2"
											>
												<span className="text-info mt-0.5">→</span>
												<span>{rec}</span>
											</li>
										))}
									</ul>
								</div>
							)}

							{/* Tags */}
							{tags.length > 0 && (
								<div className="flex flex-wrap gap-1.5 pt-2 border-t border-neutral-100">
									{tags.map((tag) => (
										<Badge key={tag} variant="secondary" className="text-xs">
											{tag}
										</Badge>
									))}
								</div>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}

// ============================================
// Brief (for list pages)
// ============================================

interface AiInsightsBriefProps {
	summary: string;
	riskLevel: ArticleAiInsights["risk_level"];
	riskScore: number;
	className?: string;
}

export function AiInsightsBrief({
	summary,
	riskLevel,
	riskScore,
	className,
}: AiInsightsBriefProps) {
	const t = useT();
	const riskConfig = riskLevelConfig[riskLevel];

	return (
		<div
			className={cn(
				"flex items-start gap-3 p-3 rounded-lg bg-neutral-50",
				className,
			)}
		>
			<Sparkles aria-hidden="true" className="h-4 w-4 text-primary-400 mt-0.5 shrink-0" />
			<div className="flex-1 min-w-0">
				<p className="text-sm text-neutral-600 line-clamp-2">{summary}</p>
			</div>
			<div
				className={cn(
					"shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
					riskConfig.bgColor,
					riskConfig.color,
				)}
				aria-label={t(riskConfig.labelKey)}
			>
				<span>{riskConfig.icon}</span>
				<span>{riskScore}</span>
			</div>
		</div>
	);
}
