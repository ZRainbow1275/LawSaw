"use client";

/**
 * 空状态组件
 * 用于展示无数据、无搜索结果等场景
 */

import { cn } from "@/lib/utils";
import { AlertCircle, FileX, type LucideIcon, Search } from "lucide-react";
import { Button } from "./button";

// ============================================
// 类型定义
// ============================================

export type EmptyStateVariant = "default" | "search" | "error";

interface EmptyStateProps {
	/** 自定义图标 */
	icon?: LucideIcon;
	/** 标题 */
	title: string;
	/** 描述文字 */
	description?: string;
	/** 操作按钮 */
	action?: {
		label: string;
		onClick: () => void;
	};
	/** 变体类型 */
	variant?: EmptyStateVariant;
	/** 自定义类名 */
	className?: string;
}

// ============================================
// 变体配置
// ============================================

const variantConfig: Record<
	EmptyStateVariant,
	{ icon: LucideIcon; iconBg: string; iconColor: string }
> = {
	default: {
		icon: FileX,
		iconBg: "bg-neutral-100",
		iconColor: "text-neutral-400",
	},
	search: {
		icon: Search,
		iconBg: "bg-primary-50",
		iconColor: "text-primary-400",
	},
	error: {
		icon: AlertCircle,
		iconBg: "bg-red-50",
		iconColor: "text-red-400",
	},
};

// ============================================
// 组件实现
// ============================================

export function EmptyState({
	icon,
	title,
	description,
	action,
	variant = "default",
	className,
}: EmptyStateProps) {
	const config = variantConfig[variant];
	const Icon = icon || config.icon;

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-16 px-4 text-center",
				className,
			)}
		>
			{/* 图标容器 */}
			<div
				className={cn(
					"flex h-16 w-16 items-center justify-center rounded-full mb-4",
					config.iconBg,
				)}
			>
				<Icon className={cn("h-8 w-8", config.iconColor)} />
			</div>

			{/* 标题 */}
			<h3 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h3>

			{/* 描述 */}
			{description && (
				<p className="text-sm text-neutral-500 max-w-sm mb-6">{description}</p>
			)}

			{/* 操作按钮 */}
			{action && (
				<Button variant="outline" onClick={action.onClick}>
					{action.label}
				</Button>
			)}
		</div>
	);
}

// ============================================
// 预设变体
// ============================================

interface PresetEmptyStateProps {
	/** 自定义标题 */
	title?: string;
	/** 自定义描述 */
	description?: string;
	/** 操作按钮标签（简化用法） */
	actionLabel?: string;
	/** 操作按钮回调（简化用法） */
	onAction?: () => void;
	/** 操作按钮（完整用法） */
	action?: {
		label: string;
		onClick: () => void;
	};
	className?: string;
}

/** 无数据状态 */
export function NoDataState({
	title = "暂无数据",
	description = "当前没有可显示的内容",
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			title={title}
			description={description}
			action={finalAction}
			className={className}
		/>
	);
}

/** 无搜索结果状态 */
export function NoSearchResultState({
	title = "未找到结果",
	description = "尝试调整搜索关键词或筛选条件",
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="search"
			title={title}
			description={description}
			action={finalAction}
			className={className}
		/>
	);
}

/** 加载错误状态 */
export function ErrorState({ action, className }: PresetEmptyStateProps) {
	return (
		<EmptyState
			variant="error"
			title="加载失败"
			description="数据加载时发生错误，请稍后重试"
			action={
				action || { label: "重试", onClick: () => window.location.reload() }
			}
			className={className}
		/>
	);
}
