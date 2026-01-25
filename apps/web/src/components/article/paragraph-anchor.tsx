"use client";

/**
 * 段落锚点组件
 * 悬停显示 ¶ 符号，点击复制 Deep Link
 */

import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { Link2 } from "lucide-react";
import { useCallback, useState } from "react";

interface ParagraphAnchorProps {
	id: string;
	children: React.ReactNode;
	className?: string;
}

export function ParagraphAnchor({
	id,
	children,
	className,
}: ParagraphAnchorProps) {
	const [isHovered, setIsHovered] = useState(false);
	const { success } = useToast();

	const handleCopyLink = useCallback(async () => {
		const url = `${window.location.origin}${window.location.pathname}#${id}`;

		try {
			await navigator.clipboard.writeText(url);
			success("链接已复制", "段落链接已复制到剪贴板");
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement("textarea");
			textArea.value = url;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			success("链接已复制");
		}
	}, [id, success]);

	return (
		<div
			id={id}
			className={cn("group relative", className)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* 锚点按钮 */}
			<button
				type="button"
				onClick={handleCopyLink}
				className={cn(
					"absolute -left-8 top-1 flex h-6 w-6 items-center justify-center",
					"rounded-md text-neutral-300 transition-all duration-200",
					"hover:bg-primary-50 hover:text-primary-500",
					"focus:outline-none focus:ring-2 focus:ring-primary-500/20",
					isHovered ? "opacity-100" : "opacity-0",
				)}
				title="复制段落链接"
				aria-label="复制段落链接"
			>
				<Link2 className="h-3.5 w-3.5" />
			</button>

			{/* 段落内容 */}
			{children}
		</div>
	);
}
