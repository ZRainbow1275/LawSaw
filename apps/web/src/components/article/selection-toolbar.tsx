"use client";

/**
 * 文字选中工具栏组件
 * 选中文字后弹出操作菜单：高亮、AI 解释、复制引用
 */

import { popVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Highlighter, Quote, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================
// 类型定义
// ============================================

interface SelectionToolbarProps {
	containerRef: React.RefObject<HTMLElement | null>;
	onHighlight?: (text: string, range: Range) => void;
	onAiExplain?: (text: string) => void;
	onCopyQuote?: (text: string) => void;
	className?: string;
}

interface ToolbarPosition {
	top: number;
	left: number;
}

// ============================================
// 工具栏按钮
// ============================================

interface ToolbarButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	onClick: () => void;
	variant?: "default" | "primary" | "ai";
}

function ToolbarButton({
	icon: Icon,
	label,
	onClick,
	variant = "default",
}: ToolbarButtonProps) {
	const variants = {
		default: "hover:bg-neutral-700 hover:text-white",
		primary: "hover:bg-primary-500 hover:text-white",
		ai: "hover:bg-gradient-to-r hover:from-purple-500 hover:to-pink-500 hover:text-white",
	};

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-200 transition-colors rounded-md",
				variants[variant],
			)}
			title={label}
		>
			<Icon className="h-4 w-4" />
			<span className="hidden sm:inline">{label}</span>
		</button>
	);
}

// ============================================
// 主组件
// ============================================

export function SelectionToolbar({
	containerRef,
	onHighlight,
	onAiExplain,
	onCopyQuote,
	className,
}: SelectionToolbarProps) {
	const [isVisible, setIsVisible] = useState(false);
	const [position, setPosition] = useState<ToolbarPosition>({
		top: 0,
		left: 0,
	});
	const [selectedText, setSelectedText] = useState("");
	const [selectionRange, setSelectionRange] = useState<Range | null>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const { success } = useToast();

	// 计算工具栏位置
	const calculatePosition = useCallback((rect: DOMRect): ToolbarPosition => {
		const toolbarHeight = 44;
		const toolbarWidth = 280;
		const offset = 8;

		let top = rect.top - toolbarHeight - offset + window.scrollY;
		let left = rect.left + rect.width / 2 - toolbarWidth / 2 + window.scrollX;

		// 边界检查
		if (top < window.scrollY + 10) {
			top = rect.bottom + offset + window.scrollY;
		}
		if (left < 10) {
			left = 10;
		}
		if (left + toolbarWidth > window.innerWidth - 10) {
			left = window.innerWidth - toolbarWidth - 10;
		}

		return { top, left };
	}, []);

	// 处理文字选中
	const handleSelectionChange = useCallback(() => {
		const selection = window.getSelection();

		if (!selection || selection.isCollapsed || !selection.rangeCount) {
			setIsVisible(false);
			setSelectedText("");
			setSelectionRange(null);
			return;
		}

		const range = selection.getRangeAt(0);
		const text = selection.toString().trim();

		// 检查选中是否在容器内
		if (
			containerRef.current &&
			!containerRef.current.contains(range.commonAncestorContainer)
		) {
			setIsVisible(false);
			return;
		}

		// 至少选中 2 个字符
		if (text.length < 2) {
			setIsVisible(false);
			return;
		}

		const rect = range.getBoundingClientRect();
		const pos = calculatePosition(rect);

		setPosition(pos);
		setSelectedText(text);
		setSelectionRange(range.cloneRange());
		setIsVisible(true);
	}, [containerRef, calculatePosition]);

	// 监听选中变化
	useEffect(() => {
		const handleMouseUp = () => {
			// 延迟检查，确保选中已完成
			setTimeout(handleSelectionChange, 10);
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setIsVisible(false);
				window.getSelection()?.removeAllRanges();
			}
		};

		document.addEventListener("mouseup", handleMouseUp);
		document.addEventListener("keyup", handleKeyUp);

		return () => {
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("keyup", handleKeyUp);
		};
	}, [handleSelectionChange]);

	// 点击外部关闭
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				toolbarRef.current &&
				!toolbarRef.current.contains(e.target as Node)
			) {
				// 延迟关闭，允许点击按钮
				setTimeout(() => {
					const selection = window.getSelection();
					if (!selection || selection.isCollapsed) {
						setIsVisible(false);
					}
				}, 100);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// 操作处理
	const handleHighlight = () => {
		if (selectionRange) {
			onHighlight?.(selectedText, selectionRange);
			success("已添加高亮");
		}
		setIsVisible(false);
	};

	const handleAiExplain = () => {
		onAiExplain?.(selectedText);
		setIsVisible(false);
	};

	const handleCopyQuote = async () => {
		const quote = `"${selectedText}"`;
		try {
			await navigator.clipboard.writeText(quote);
			success("引用已复制");
		} catch {
			// Fallback
			const textArea = document.createElement("textarea");
			textArea.value = quote;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			success("引用已复制");
		}
		onCopyQuote?.(selectedText);
		setIsVisible(false);
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(selectedText);
			success("已复制到剪贴板");
		} catch {
			const textArea = document.createElement("textarea");
			textArea.value = selectedText;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			success("已复制到剪贴板");
		}
		setIsVisible(false);
	};

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.div
					ref={toolbarRef}
					variants={popVariants}
					initial="hidden"
					animate="visible"
					exit="exit"
					className={cn(
						"fixed z-50 flex items-center gap-0.5 px-1 py-1 rounded-xl",
						"bg-neutral-900/95 backdrop-blur-sm shadow-xl",
						"border border-neutral-700/50",
						className,
					)}
					style={{
						top: position.top,
						left: position.left,
					}}
				>
					{/* 高亮 */}
					{onHighlight && (
						<ToolbarButton
							icon={Highlighter}
							label="高亮"
							onClick={handleHighlight}
							variant="primary"
						/>
					)}

					{/* AI 解释 */}
					{onAiExplain && (
						<ToolbarButton
							icon={Sparkles}
							label="AI 解释"
							onClick={handleAiExplain}
							variant="ai"
						/>
					)}

					{/* 复制引用 */}
					<ToolbarButton icon={Quote} label="引用" onClick={handleCopyQuote} />

					{/* 复制 */}
					<ToolbarButton icon={Copy} label="复制" onClick={handleCopy} />

					{/* 分隔线 */}
					<div className="w-px h-6 bg-neutral-700 mx-1" />

					{/* 关闭 */}
					<button
						type="button"
						onClick={() => setIsVisible(false)}
						className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-md hover:bg-neutral-700"
						title="关闭"
					>
						<X className="h-4 w-4" />
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

// ============================================
// Hook: 使用选中工具栏
// ============================================

export function useSelectionToolbar() {
	const [selectedText, setSelectedText] = useState("");
	const [isExplaining, setIsExplaining] = useState(false);

	const handleAiExplain = useCallback(async (text: string) => {
		setSelectedText(text);
		setIsExplaining(true);
		// 实际 AI 解释逻辑由父组件处理
	}, []);

	const closeExplain = useCallback(() => {
		setIsExplaining(false);
		setSelectedText("");
	}, []);

	return {
		selectedText,
		isExplaining,
		handleAiExplain,
		closeExplain,
	};
}
