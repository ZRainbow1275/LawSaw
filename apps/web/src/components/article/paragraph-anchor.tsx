"use client";

/**
 * Paragraph anchor.
 * Shows a ¶ anchor on hover and copies a deep link on click.
 */

import { useT } from "@/lib/i18n-client";
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
	const t = useT();

	const handleCopyLink = useCallback(async () => {
		const url = `${window.location.origin}${window.location.pathname}#${id}`;

		try {
			await navigator.clipboard.writeText(url);
			success(t("Link copied"), t("Paragraph link copied to clipboard."));
		} catch {
			// Fallback for older browsers
			const textArea = document.createElement("textarea");
			textArea.value = url;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
			success(t("Link copied"));
		}
	}, [id, success, t]);

	return (
		<div
			id={id}
			className={cn("group relative", className)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Anchor button */}
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
				title={t("Copy paragraph link")}
				aria-label={t("Copy paragraph link")}
			>
				<Link2 aria-hidden="true" className="h-3.5 w-3.5" />
			</button>

			{/* Content */}
			{children}
		</div>
	);
}
