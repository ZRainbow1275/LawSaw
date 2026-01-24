"use client";

/**
 * 文章操作栏组件
 * 收藏、分享、阅读设置
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bookmark,
  Share2,
  Settings2,
  Link2,
  Check,
  MessageCircle,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useBookmark } from "@/stores/reading-store";
import { useToast } from "@/stores/toast-store";

// ============================================
// 类型定义
// ============================================

interface ArticleActionsProps {
  /** 文章 ID */
  articleId: string;
  /** 文章标题 */
  articleTitle: string;
  /** 文章 URL */
  articleUrl?: string;
  /** 打开设置面板 */
  onOpenSettings?: () => void;
  /** 自定义类名 */
  className?: string;
}

// ============================================
// 主组件
// ============================================

export function ArticleActions({
  articleId,
  articleTitle,
  articleUrl,
  onOpenSettings,
  className,
}: ArticleActionsProps) {
  const { isBookmarked, toggle: toggleBookmark } = useBookmark(articleId);
  const { success } = useToast();
  const [showShareMenu, setShowShareMenu] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // 收藏操作
  const handleBookmark = () => {
    const newState = toggleBookmark();
    success(newState ? "已添加收藏" : "已取消收藏");
  };

  // 复制链接
  const handleCopyLink = async () => {
    const url = articleUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      success("链接已复制");
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
      success("链接已复制");
      setTimeout(() => setCopied(false), 2000);
    }
    setShowShareMenu(false);
  };

  // 回到顶部
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className={cn(
        "fixed right-6 top-1/2 -translate-y-1/2 z-30",
        "hidden lg:flex flex-col gap-2",
        className
      )}
    >
      {/* 收藏 */}
      <ActionButton
        icon={Bookmark}
        label={isBookmarked ? "取消收藏" : "收藏"}
        active={isBookmarked}
        onClick={handleBookmark}
      />

      {/* 分享 */}
      <div className="relative">
        <ActionButton
          icon={Share2}
          label="分享"
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

      {/* 设置 */}
      <ActionButton
        icon={Settings2}
        label="阅读设置"
        onClick={onOpenSettings}
      />

      {/* 分隔线 */}
      <div className="h-px bg-neutral-200 my-1" />

      {/* 回到顶部 */}
      <ActionButton
        icon={ChevronUp}
        label="回到顶部"
        onClick={handleScrollToTop}
      />
    </div>
  );
}

// ============================================
// 操作按钮组件
// ============================================

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function ActionButton({ icon: Icon, label, active, onClick }: ActionButtonProps) {
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
        active && "border-primary-300 bg-primary-50"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 transition-colors",
          active ? "text-primary-600 fill-primary-600" : "text-neutral-600"
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
// 分享菜单
// ============================================

interface ShareMenuProps {
  onCopyLink: () => void;
  copied: boolean;
  onClose: () => void;
}

function ShareMenu({ onCopyLink, copied, onClose }: ShareMenuProps) {
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
          <span>{copied ? "已复制" : "复制链接"}</span>
        </button>
      </div>
    </motion.div>
  );
}

// ============================================
// 移动端底部操作栏
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
  const { isBookmarked, toggle: toggleBookmark } = useBookmark(articleId);
  const { success } = useToast();

  const handleBookmark = () => {
    const newState = toggleBookmark();
    success(newState ? "已添加收藏" : "已取消收藏");
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      <div className="flex items-center justify-around bg-white/95 backdrop-blur-md border-t border-neutral-100 px-4 py-3 safe-area-pb">
        {/* 目录 */}
        {tocItemCount > 0 && (
          <MobileActionButton
            icon={<MessageCircle className="h-5 w-5" />}
            label="目录"
            onClick={onOpenToc}
          />
        )}

        {/* 收藏 */}
        <MobileActionButton
          icon={
            <Bookmark
              className={cn(
                "h-5 w-5",
                isBookmarked && "fill-primary-500 text-primary-500"
              )}
            />
          }
          label="收藏"
          active={isBookmarked}
          onClick={handleBookmark}
        />

        {/* 设置 */}
        <MobileActionButton
          icon={<Settings2 className="h-5 w-5" />}
          label="设置"
          onClick={onOpenSettings}
        />

        {/* 分享 */}
        <MobileActionButton
          icon={<Share2 className="h-5 w-5" />}
          label="分享"
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
        active ? "text-primary-600" : "text-neutral-600"
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}
