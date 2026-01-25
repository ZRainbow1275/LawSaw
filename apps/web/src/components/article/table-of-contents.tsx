"use client";

/**
 * 文章目录组件
 * 支持高亮当前章节、平滑滚动
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, List, X } from "lucide-react";
import * as React from "react";

// ============================================
// 类型定义
// ============================================

export interface TOCItem {
	/** 唯一标识（对应标题的 id） */
	id: string;
	/** 标题文字 */
	text: string;
	/** 标题层级 (1-3) */
	level: 1 | 2 | 3;
}

interface TableOfContentsProps {
	/** 目录项列表 */
	items: TOCItem[];
	/** 当前激活的章节 ID */
	activeId?: string;
	/** 点击目录项回调 */
	onItemClick?: (id: string) => void;
	/** 是否收起（移动端） */
	collapsed?: boolean;
	/** 自定义类名 */
	className?: string;
}

// ============================================
// 桌面端目录组件
// ============================================

export function TableOfContents({
	items,
	activeId,
	onItemClick,
	className,
}: TableOfContentsProps) {
	const handleClick = (id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
		onItemClick?.(id);
	};

	if (items.length === 0) return null;

	return (
		<nav aria-label="文章目录" className={cn("w-48 text-sm", className)}>
			<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
				目录
			</h4>
			<ul className="space-y-1 border-l-2 border-neutral-100">
				{items.map((item) => (
					<li key={item.id}>
						<button
							type="button"
							onClick={() => handleClick(item.id)}
							aria-current={activeId === item.id ? "location" : undefined}
							className={cn(
								"block w-full text-left py-1.5 transition-all duration-200",
								"hover:text-primary-600",
								// 层级缩进
								item.level === 1 && "pl-4 font-medium",
								item.level === 2 && "pl-6 text-neutral-600",
								item.level === 3 && "pl-8 text-neutral-500 text-xs",
								// 激活状态
								activeId === item.id && [
									"border-l-2 border-primary-500 -ml-[2px]",
									"text-primary-600 font-medium",
									"bg-primary-50/50",
								],
								// 非激活状态
								activeId !== item.id && "text-neutral-500",
							)}
						>
							<span className="line-clamp-2">{item.text}</span>
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}

// ============================================
// 移动端目录抽屉
// ============================================

interface TOCDrawerProps extends TableOfContentsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function TOCDrawer({
	items,
	activeId,
	onItemClick,
	open,
	onOpenChange,
}: TOCDrawerProps) {
	const handleClick = (id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
		onItemClick?.(id);
		onOpenChange(false);
	};

	return (
		<AnimatePresence>
			{open && (
				<>
					{/* 遮罩 */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => onOpenChange(false)}
						className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
					/>

					{/* 抽屉 */}
					<motion.div
						initial={{ x: "-100%" }}
						animate={{ x: 0 }}
						exit={{ x: "-100%" }}
						transition={{ type: "spring", damping: 25, stiffness: 200 }}
						className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-white shadow-xl lg:hidden"
					>
						{/* 头部 */}
						<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
							<h3 className="font-semibold text-neutral-900">文章目录</h3>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => onOpenChange(false)}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{/* 目录列表 */}
						<div
							className="overflow-y-auto p-4"
							style={{ maxHeight: "calc(100vh - 60px)" }}
						>
							<ul className="space-y-1">
								{items.map((item) => (
									<li key={item.id}>
										<button
											type="button"
											onClick={() => handleClick(item.id)}
											className={cn(
												"flex items-center gap-2 w-full text-left py-2 px-3 rounded-lg transition-all",
												"hover:bg-neutral-50",
												item.level === 1 && "font-medium",
												item.level === 2 && "pl-6 text-sm",
												item.level === 3 && "pl-9 text-sm text-neutral-500",
												activeId === item.id && [
													"bg-primary-50 text-primary-600",
													"border-l-2 border-primary-500",
												],
											)}
										>
											<ChevronRight
												className={cn(
													"h-3 w-3 shrink-0 transition-transform",
													activeId === item.id && "text-primary-500",
												)}
											/>
											<span className="line-clamp-2">{item.text}</span>
										</button>
									</li>
								))}
							</ul>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

// ============================================
// 目录触发按钮（移动端）
// ============================================

interface TOCTriggerProps {
	onClick: () => void;
	itemCount: number;
	className?: string;
}

export function TOCTrigger({ onClick, itemCount, className }: TOCTriggerProps) {
	if (itemCount === 0) return null;

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={onClick}
			className={cn("gap-2", className)}
		>
			<List className="h-4 w-4" />
			<span>目录</span>
			<span className="text-xs text-neutral-400">({itemCount})</span>
		</Button>
	);
}

// ============================================
// Hook: 从 HTML 内容提取目录
// ============================================

export function useTableOfContents(
	contentRef: React.RefObject<HTMLElement | null>,
) {
	const [items, setItems] = React.useState<TOCItem[]>([]);
	const [activeId, setActiveId] = React.useState<string>();

	// 提取标题
	React.useEffect(() => {
		const container = contentRef.current;
		if (!container) return;

		const headings = container.querySelectorAll("h1, h2, h3");
		const tocItems: TOCItem[] = [];

		for (const [index, heading] of Array.from(headings).entries()) {
			const level = Number.parseInt(heading.tagName[1]) as 1 | 2 | 3;
			const id = heading.id || `heading-${index}`;

			// 确保标题有 ID
			if (!heading.id) {
				heading.id = id;
			}

			tocItems.push({
				id,
				text: heading.textContent || "",
				level,
			});
		}

		setItems(tocItems);
	}, [contentRef]);

	// 监听滚动高亮
	React.useEffect(() => {
		if (items.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
					}
				}
			},
			{
				rootMargin: "-80px 0px -80% 0px",
				threshold: 0,
			},
		);

		for (const item of items) {
			const element = document.getElementById(item.id);
			if (element) {
				observer.observe(element);
			}
		}

		return () => observer.disconnect();
	}, [items]);

	return { items, activeId, setActiveId };
}
