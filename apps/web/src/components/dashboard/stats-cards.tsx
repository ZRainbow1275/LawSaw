"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useArticleStats } from "@/hooks/use-articles";
import { useSourceStats } from "@/hooks/use-sources";
import {
	cardHoverEffect,
	fadeVariants,
	staggerContainerVariants,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	Clock,
	FileText,
	type LucideIcon,
	Rss,
} from "lucide-react";

// ============================================
// 类型定义
// ============================================

interface StatConfig {
	title: string;
	value: number | null;
	icon: LucideIcon;
	color: "primary" | "success" | "warning" | "error";
	isLoading: boolean;
	isError: boolean;
}

// ============================================
// 颜色配置
// ============================================

const colorConfig = {
	primary: {
		bg: "bg-primary-100",
		text: "text-primary-600",
		gradient: "from-primary-500 to-primary-600",
	},
	success: {
		bg: "bg-green-100",
		text: "text-green-600",
		gradient: "from-green-500 to-green-600",
	},
	warning: {
		bg: "bg-amber-100",
		text: "text-amber-600",
		gradient: "from-amber-500 to-amber-600",
	},
	error: {
		bg: "bg-red-100",
		text: "text-red-600",
		gradient: "from-red-500 to-red-600",
	},
};

// ============================================
// StatCard 子组件
// ============================================

function StatCard({ stat, index }: { stat: StatConfig; index: number }) {
	const colors = colorConfig[stat.color];
	const Icon = stat.icon;

	return (
		<motion.div
			variants={fadeVariants}
			whileHover={cardHoverEffect}
			className="h-full"
		>
			<Card className="relative overflow-hidden h-full group">
				{/* 顶部渐变条 */}
				<div
					className={cn(
						"absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity",
						colors.gradient,
					)}
				/>

				<CardContent className="p-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm font-medium text-neutral-500">
								{stat.title}
							</p>
							<div className="mt-2">
								{stat.isLoading ? (
									<div className="h-9 w-16 rounded bg-neutral-100 animate-pulse" />
								) : stat.isError || stat.value === null ? (
									<span className="text-3xl font-bold text-neutral-400">—</span>
								) : (
									<AnimatedNumber
										value={stat.value}
										duration={1200}
										animateOnView
										numberClassName="text-3xl font-bold text-neutral-900"
									/>
								)}
							</div>
						</div>

						{/* 图标容器 - 带动画 */}
						<motion.div
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
							className={cn(
								"flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110",
								colors.bg,
								colors.text,
							)}
						>
							<Icon className="h-6 w-6" />
						</motion.div>
					</div>
				</CardContent>
			</Card>
		</motion.div>
	);
}

// ============================================
// StatsCards 主组件
// ============================================

export function StatsCards() {
	const statsQuery = useArticleStats();
	const sourceStatsQuery = useSourceStats();

	const activeSources =
		sourceStatsQuery.isError || !sourceStatsQuery.data
			? null
			: sourceStatsQuery.data.active_count;

	const handleRetry = () => {
		statsQuery.refetch();
		sourceStatsQuery.refetch();
	};

	const hasError = statsQuery.isError || sourceStatsQuery.isError;

	const stats: StatConfig[] = [
		{
			title: "今日资讯",
			value:
				statsQuery.isError || !statsQuery.data
					? null
					: statsQuery.data.today_count,
			icon: FileText,
			color: "primary",
			isLoading: statsQuery.isLoading,
			isError: statsQuery.isError,
		},
		{
			title: "活跃信息源",
			value: activeSources,
			icon: Rss,
			color: "success",
			isLoading: sourceStatsQuery.isLoading,
			isError: sourceStatsQuery.isError,
		},
		{
			title: "待处理",
			value:
				statsQuery.isError || !statsQuery.data
					? null
					: statsQuery.data.pending_count,
			icon: Clock,
			color: "warning",
			isLoading: statsQuery.isLoading,
			isError: statsQuery.isError,
		},
		{
			title: "风险预警",
			value:
				statsQuery.isError || !statsQuery.data
					? null
					: statsQuery.data.high_risk_count,
			icon: AlertTriangle,
			color: "error",
			isLoading: statsQuery.isLoading,
			isError: statsQuery.isError,
		},
	];

	return (
		<div className="mb-8">
			<motion.div
				variants={staggerContainerVariants}
				initial="hidden"
				animate="visible"
				className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
			>
				{stats.map((stat, index) => (
					<StatCard key={stat.title} stat={stat} index={index} />
				))}
			</motion.div>

			{hasError ? (
				<div className="mt-3 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-3 py-2">
					<p className="text-xs text-red-700">
						部分统计数据加载失败，已隐藏不可靠数值
					</p>
					<Button variant="outline" size="sm" onClick={handleRetry}>
						重试
					</Button>
				</div>
			) : null}
		</div>
	);
}
