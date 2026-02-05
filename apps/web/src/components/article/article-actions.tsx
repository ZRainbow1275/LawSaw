"use client";

/**
 * Article actions toolbar.
 * Bookmark, share, and reading settings.
 */

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useBookmark } from "@/stores/reading-store";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	Bookmark,
	Check,
	ChevronUp,
	Link2,
	MessageCircle,
	Settings2,
	Share2,
} from "lucide-react";
import * as React from "react";

// ============================================
// Types
// ============================================

interface ArticleActionsProps {
	/** Article ID */
	articleId: string;
	/** Article title */
	articleTitle: string;
	/** Article URL */
	articleUrl?: string;
	/** Open settings panel */
	onOpenSettings?: () => void;
	/** Custom class name */
	className?: string;
}

// ============================================
// Desktop
// ============================================

export function ArticleActions({
	articleId,
	articleTitle: _articleTitle,
	articleUrl,
	onOpenSettings,
	className,
}: ArticleActionsProps) {
	const t = useT();
	const { isBookmarked, toggle: toggleBookmark } = useBookmark(articleId);
	const { success } = useToast();
	const [showShareMenu, setShowShareMenu] = React.useState(false);
	const [copied, setCopied] = React.useState(false);

	// Bookmark
	const handleBookmark = () => {
		const newState = toggleBookmark();
		success(newState ? t("Added to bookmarks") : t("Removed from bookmarks"));
	};

	// Copy link
	const handleCopyLink = async () => {
		const url = articleUrl || window.location.href;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			success(t("Link copied"));
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback
			const textarea = document.createElement("textarea");
			textarea.value = url;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
			setCopied(true);
			success(t("Link copied"));
			setTimeout(() => setCopied(false), 2000);
		}
		setShowShareMenu(false);
	};

	// Scroll to top
	const handleScrollToTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		<div
			className={cn(
				"fixed right-6 top-1/2 -translate-y-1/2 z-30",
				"hidden lg:flex flex-col gap-2",
				className,
			)}
		>
			{/* Bookmark */}
			<ActionButton
				icon={Bookmark}
				label={isBookmarked ? t("Remove bookmark") : t("Bookmark")}
				active={isBookmarked}
				onClick={handleBookmark}
			/>

			{/* Share */}
			<div className="relative">
				<ActionButton
					icon={Share2}
					label={t("Share")}
					onClick={() => setShowShareMenu(!showShareMenu)}
				/>
				<AnimatePresence>
					{showShareMenu && (
						<ShareMenu
							onCopyLink={handleCopyLink}
							copied={copied}
							onClose={() => setShowShareMenu(false)}
						/>
					)}
				</AnimatePresence>
			</div>

			{/* Settings */}
			<ActionButton
				icon={Settings2}
				label={t("Reading settings")}
				onClick={onOpenSettings}
			/>

			{/* Divider */}
			<div className="h-px bg-neutral-200 my-1" />

			{/* Scroll to top */}
			<ActionButton
				icon={ChevronUp}
				label={t("Scroll to top")}
				onClick={handleScrollToTop}
			/>
		</div>
	);
}

// ============================================
// Button
// ============================================

interface ActionButtonProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	active?: boolean;
	onClick?: () => void;
}

function ActionButton({
	icon: Icon,
	label,
	active,
	onClick,
}: ActionButtonProps) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileHover={{ scale: 1.05 }}
			whileTap={{ scale: 0.95 }}
			className={cn(
				"group relative flex h-10 w-10 items-center justify-center rounded-full",
				"bg-white border border-neutral-200 shadow-sm",
				"transition-all hover:border-primary-200 hover:shadow-md",
				active && "border-primary-300 bg-primary-50",
			)}
		>
			<Icon
				className={cn(
					"h-4 w-4 transition-colors",
					active ? "text-primary-600 fill-primary-600" : "text-neutral-600",
				)}
			/>
			{/* Tooltip */}
			<span className="absolute right-full mr-2 px-2 py-1 text-xs font-medium text-neutral-700 bg-white border border-neutral-100 rounded-lg shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
				{label}
			</span>
		</motion.button>
	);
}

// ============================================
// Share menu
// ============================================

interface ShareMenuProps {
	onCopyLink: () => void;
	copied: boolean;
	onClose: () => void;
}

function ShareMenu({ onCopyLink, copied, onClose }: ShareMenuProps) {
	const t = useT();
	return (
		<motion.div
			initial={{ opacity: 0, x: 10, scale: 0.95 }}
			animate={{ opacity: 1, x: 0, scale: 1 }}
			exit={{ opacity: 0, x: 10, scale: 0.95 }}
			transition={{ duration: 0.15 }}
			className="absolute right-full mr-2 top-0 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden"
		>
			<div className="p-2 min-w-[140px]">
				<button
					type="button"
					onClick={onCopyLink}
					className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
				>
					{copied ? (
						<Check className="h-4 w-4 text-green-600" />
					) : (
						<Link2 className="h-4 w-4" />
					)}
					<span>{copied ? t("Copied") : t("Copy link")}</span>
				</button>
			</div>
		</motion.div>
	);
}

// ============================================
// Mobile
// ============================================

interface MobileArticleActionsProps {
	articleId: string;
	onOpenToc?: () => void;
	onOpenSettings?: () => void;
	onShare?: () => void;
	tocItemCount?: number;
}

export function MobileArticleActions({
	articleId,
	onOpenToc,
	onOpenSettings,
	onShare,
	tocItemCount = 0,
}: MobileArticleActionsProps) {
	const t = useT();
	const { isBookmarked, toggle: toggleBookmark } = useBookmark(articleId);
	const { success } = useToast();

	const handleBookmark = () => {
		const newState = toggleBookmark();
		success(newState ? t("Added to bookmarks") : t("Removed from bookmarks"));
	};

	return (
		<div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
			<div className="flex items-center justify-around bg-white/95 backdrop-blur-md border-t border-neutral-100 px-4 py-3 safe-area-pb">
				{/* Contents */}
				{tocItemCount > 0 && (
					<MobileActionButton
						icon={<MessageCircle className="h-5 w-5" />}
						label={t("Contents")}
						onClick={onOpenToc}
					/>
				)}

				{/* Bookmark */}
				<MobileActionButton
					icon={
						<Bookmark
							className={cn(
								"h-5 w-5",
								isBookmarked && "fill-primary-500 text-primary-500",
							)}
						/>
					}
					label={t("Bookmark")}
					active={isBookmarked}
					onClick={handleBookmark}
				/>

				{/* Settings */}
				<MobileActionButton
					icon={<Settings2 className="h-5 w-5" />}
					label={t("Reading settings")}
					onClick={onOpenSettings}
				/>

				{/* Share */}
				<MobileActionButton
					icon={<Share2 className="h-5 w-5" />}
					label={t("Share")}
					onClick={onShare}
				/>
			</div>
		</div>
	);
}

function MobileActionButton({
	icon,
	label,
	active,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	active?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col items-center gap-1 px-4 py-1",
				active ? "text-primary-600" : "text-neutral-600",
			)}
		>
			{icon}
			<span className="text-xs">{label}</span>
		</button>
	);
}
