"use client";

import { cn } from "@/lib/utils";
import DOMPurify from "dompurify";
import { useMemo } from "react";

interface ArticleContentProps {
	content: string | null;
	className?: string;
}

export function ArticleContent({ content, className }: ArticleContentProps) {
	const sanitizedContent = useMemo(() => {
		if (!content) return "";
		// 该组件是 Client Component，但 Next.js 仍可能在服务端执行初次渲染。
		// 为避免服务端把未清洗的 HTML 直接输出（XSS 风险），SSR 阶段不渲染内容，
		// 仅在浏览器端用 DOMPurify 清洗后注入。
		if (typeof window === "undefined") return "";

		return DOMPurify.sanitize(content, {
			ALLOWED_TAGS: [
				"p",
				"br",
				"h1",
				"h2",
				"h3",
				"h4",
				"h5",
				"h6",
				"strong",
				"b",
				"em",
				"i",
				"u",
				"s",
				"strike",
				"a",
				"img",
				"figure",
				"figcaption",
				"ul",
				"ol",
				"li",
				"blockquote",
				"pre",
				"code",
				"table",
				"thead",
				"tbody",
				"tr",
				"th",
				"td",
				"div",
				"span",
				"hr",
				"video",
				"audio",
				"source",
				"iframe",
			],
			ALLOWED_ATTR: [
				"href",
				"src",
				"alt",
				"title",
				"width",
				"height",
				"class",
				"id",
				"target",
				"rel",
				"controls",
				"autoplay",
				"loop",
				"muted",
				"frameborder",
				"allowfullscreen",
			],
			ADD_ATTR: ["target"],
			FORBID_TAGS: ["script", "style"],
		});
	}, [content]);

	if (!content) {
		return (
			<div className="flex items-center justify-center py-12 text-neutral-400">
				<p>暂无文章内容</p>
			</div>
		);
	}

	return (
		<article
			className={cn(
				// 基础排版 - Rational Elegance 风格
				"prose prose-neutral max-w-none prose-legal",
				// 标题 - Serif 字体，紧凑字间距
				"prose-headings:font-semibold prose-headings:text-neutral-900",
				"prose-headings:tracking-tight prose-headings:scroll-mt-20",
				"prose-h1:text-2xl prose-h1:mb-6",
				"prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-neutral-100",
				"prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-3",
				// 段落 - 优化行高和间距
				"prose-p:text-neutral-700 prose-p:leading-[1.85] prose-p:mb-6",
				// 链接 - 品牌色，无下划线
				"prose-a:text-primary-600 prose-a:no-underline prose-a:font-medium",
				"hover:prose-a:text-primary-700 hover:prose-a:underline",
				// 强调文本
				"prose-strong:text-neutral-900 prose-strong:font-semibold",
				// 引用块 - 品牌色边框 + 纸张感背景
				"prose-blockquote:border-l-[3px] prose-blockquote:border-l-primary-500",
				"prose-blockquote:bg-[var(--bg-paper)] prose-blockquote:py-4 prose-blockquote:px-5",
				"prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:my-8",
				// 代码 - 优化样式
				"prose-code:bg-neutral-100 prose-code:px-1.5 prose-code:py-0.5",
				"prose-code:rounded-md prose-code:text-sm prose-code:font-mono",
				"prose-code:before:content-none prose-code:after:content-none",
				"prose-pre:bg-neutral-900 prose-pre:text-neutral-100 prose-pre:rounded-xl",
				// 图片 - 圆角阴影
				"prose-img:rounded-xl prose-img:shadow-card prose-img:mx-auto",
				"prose-figure:my-8",
				"prose-figcaption:text-center prose-figcaption:text-neutral-500 prose-figcaption:text-sm prose-figcaption:mt-3",
				// 表格 - 精致边框
				"prose-table:border-collapse prose-table:rounded-lg prose-table:overflow-hidden",
				"prose-th:bg-neutral-50 prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:text-neutral-800",
				"prose-td:p-3 prose-td:border-t prose-td:border-neutral-100",
				// 分割线
				"prose-hr:border-neutral-100 prose-hr:my-10",
				// 列表 - 优化间距
				"prose-ul:list-disc prose-ol:list-decimal",
				"prose-li:text-neutral-700 prose-li:leading-relaxed prose-li:my-2",
				// 嵌入媒体
				"[&_img]:max-w-full [&_img]:h-auto",
				"[&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:shadow-card",
				// 法律条款特殊样式
				"[&_.legal-clause]:pl-4 [&_.legal-clause]:border-l-2 [&_.legal-clause]:border-primary-200",
				"[&_.risk-highlight]:bg-error-light [&_.risk-highlight]:px-1 [&_.risk-highlight]:rounded",
				className,
			)}
			suppressHydrationWarning
			// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML 仅在浏览器端经 DOMPurify 清洗后注入；SSR 阶段输出为空以避免 XSS
			dangerouslySetInnerHTML={{ __html: sanitizedContent }}
		/>
	);
}
