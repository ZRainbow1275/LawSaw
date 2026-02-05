"use client";

/**
 * Table of contents.
 * Highlights the active section and supports smooth scrolling.
 */

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, List, X } from "lucide-react";
import * as React from "react";

// ============================================
// Types
// ============================================

export interface TOCItem {
	/** Unique id (derived from heading id) */
	id: string;
	/** Heading text */
	text: string;
	/** Heading level (1-3) */
	level: 1 | 2 | 3;
}

interface TableOfContentsProps {
	/** TOC items */
	items: TOCItem[];
	/** Active heading id */
	activeId?: string;
	/** Item click handler */
	onItemClick?: (id: string) => void;
	/** Collapsed state (mobile) */
	collapsed?: boolean;
	/** Custom class name */
	className?: string;
}

// ============================================
// Desktop
// ============================================

export function TableOfContents({
	items,
	activeId,
	onItemClick,
	className,
}: TableOfContentsProps) {
	const t = useT();
	const handleClick = (id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
		onItemClick?.(id);
	};

	if (items.length === 0) return null;

	return (
		<nav
			aria-label={t("Table of contents")}
			className={cn("w-48 text-sm", className)}
		>
			<h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
				{t("Contents")}
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
								// Indentation by level
								item.level === 1 && "pl-4 font-medium",
								item.level === 2 && "pl-6 text-neutral-600",
								item.level === 3 && "pl-8 text-neutral-500 text-xs",
								// Active state
								activeId === item.id && [
									"border-l-2 border-primary-500 -ml-[2px]",
									"text-primary-600 font-medium",
									"bg-primary-50/50",
								],
								// Inactive
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
// Mobile drawer
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
	const t = useT();
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
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => onOpenChange(false)}
						className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
					/>

					{/* Drawer */}
					<motion.div
						initial={{ x: "-100%" }}
						animate={{ x: 0 }}
						exit={{ x: "-100%" }}
						transition={{ type: "spring", damping: 25, stiffness: 200 }}
						className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-white shadow-xl lg:hidden"
					>
						{/* Header */}
						<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
							<h3 className="font-semibold text-neutral-900">
								{t("Table of contents")}
							</h3>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => onOpenChange(false)}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{/* List */}
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
// Trigger
// ============================================

interface TOCTriggerProps {
	onClick: () => void;
	itemCount: number;
	className?: string;
}

export function TOCTrigger({ onClick, itemCount, className }: TOCTriggerProps) {
	const t = useT();
	if (itemCount === 0) return null;

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={onClick}
			className={cn("gap-2", className)}
		>
			<List className="h-4 w-4" />
			<span>{t("Contents")}</span>
			<span className="text-xs text-neutral-400">({itemCount})</span>
		</Button>
	);
}

// ============================================
// Hook: extract TOC from HTML
// ============================================

export function useTableOfContents(
	contentRef: React.RefObject<HTMLElement | null>,
) {
	const [items, setItems] = React.useState<TOCItem[]>([]);
	const [activeId, setActiveId] = React.useState<string>();

	// Extract headings.
	React.useEffect(() => {
		const container = contentRef.current;
		if (!container) return;

		const headings = container.querySelectorAll("h1, h2, h3");
		const tocItems: TOCItem[] = [];

		for (const [index, heading] of Array.from(headings).entries()) {
			const level = Number.parseInt(heading.tagName[1]) as 1 | 2 | 3;
			const id = heading.id || `heading-${index}`;

			// Ensure a stable id.
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

	// Observe scroll to update active heading.
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
