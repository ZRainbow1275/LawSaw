"use client";

/**
 * AI 智能摘要卡片组件
 * 展示文章的 AI 分析结果：摘要、关键实体、风险等级
 */

import { Badge } from "@/components/ui/badge";
import type { AiEntity, ArticleAiInsights } from "@/lib/api/types";
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
// 类型定义
// ============================================

interface AiInsightsCardProps {
	insights: ArticleAiInsights | null;
	isLoading?: boolean;
	onEntityClick?: (entity: AiEntity) => void;
	className?: string;
	defaultExpanded?: boolean;
}

// ============================================
// 风险等级配置
// ============================================

const riskLevelConfig: Record<
	ArticleAiInsights["risk_level"],
	{ label: string; color: string; bgColor: string; icon: string }
> = {
	low: {
		label: "低风险",
		color: "text-success",
		bgColor: "bg-success/10",
		icon: "🟢",
	},
	medium: {
		label: "中等风险",
		color: "text-warning",
		bgColor: "bg-warning/10",
		icon: "🟡",
	},
	high: {
		label: "高风险",
		color: "text-orange-500",
		bgColor: "bg-orange-500/10",
		icon: "🟠",
	},
	critical: {
		label: "严重风险",
		color: "text-error",
		bgColor: "bg-error/10",
		icon: "🔴",
	},
};

// ============================================
// 实体类型图标映射
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

const entityTypeLabels: Record<AiEntity["entity_type"], string> = {
	organization: "机构",
	regulation: "法规",
	person: "人物",
	date: "日期",
	location: "地点",
	legal_term: "法律术语",
};

// ============================================
// 骨架屏组件
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
// 主组件
// ============================================

export function AiInsightsCard({
	insights,
	isLoading = false,
	onEntityClick,
	className,
	defaultExpanded = true,
}: AiInsightsCardProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	// 加载状态
	if (isLoading) {
		return <AiInsightsSkeleton />;
	}

	// 无数据状态
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
			{/* 头部 - 始终显示 */}
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center justify-between p-4 hover:bg-neutral-50/50 transition-colors"
			>
				<div className="flex items-center gap-2">
					<Sparkles className="h-5 w-5 text-primary-500" />
					<span className="font-semibold text-neutral-900">AI 智能摘要</span>
				</div>
				<div className="flex items-center gap-3">
					{/* 风险等级指示器 */}
					<div
						className={cn(
							"flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
							riskConfig.bgColor,
							riskConfig.color,
						)}
					>
						<span>{riskConfig.icon}</span>
						<span>{riskConfig.label}</span>
					</div>
					{isExpanded ? (
						<ChevronUp className="h-4 w-4 text-neutral-400" />
					) : (
						<ChevronDown className="h-4 w-4 text-neutral-400" />
					)}
				</div>
			</button>

			{/* 展开内容 */}
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
							{/* TL;DR 摘要 */}
							<div className="pt-4">
								<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
									TL;DR
								</h4>
								<p className="text-sm text-neutral-700 leading-relaxed">
									{insights.summary}
								</p>
							</div>

							{/* 关键要点 */}
							{keyPoints.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
										<Lightbulb className="h-3.5 w-3.5" />
										关键要点
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

							{/* 关键实体 */}
							{insights.entities.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
										关键实体
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
													title={`${entityTypeLabels[entity.entity_type]}: ${entity.context || entity.name}`}
												>
													<Icon className="h-3 w-3" />
													<span>{entity.name}</span>
												</button>
											);
										})}
										{insights.entities.length > 8 && (
											<span className="text-xs text-neutral-400 self-center">
												+{insights.entities.length - 8} 更多
											</span>
										)}
									</div>
								</div>
							)}

							{/* 风险维度（仅高风险时显示） */}
							{(insights.risk_level === "high" ||
								insights.risk_level === "critical") &&
								insights.risk_dimensions.length > 0 && (
									<div>
										<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
											<AlertTriangle className="h-3.5 w-3.5" />
											风险维度
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

							{/* 建议 */}
							{recommendations.length > 0 && (
								<div>
									<h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
										<Shield className="h-3.5 w-3.5" />
										合规建议
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

							{/* 标签 */}
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
// 简洁版摘要（用于列表页）
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
	const riskConfig = riskLevelConfig[riskLevel];

	return (
		<div
			className={cn(
				"flex items-start gap-3 p-3 rounded-lg bg-neutral-50",
				className,
			)}
		>
			<Sparkles className="h-4 w-4 text-primary-400 mt-0.5 shrink-0" />
			<div className="flex-1 min-w-0">
				<p className="text-sm text-neutral-600 line-clamp-2">{summary}</p>
			</div>
			<div
				className={cn(
					"shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
					riskConfig.bgColor,
					riskConfig.color,
				)}
			>
				<span>{riskConfig.icon}</span>
				<span>{riskScore}</span>
			</div>
		</div>
	);
}
