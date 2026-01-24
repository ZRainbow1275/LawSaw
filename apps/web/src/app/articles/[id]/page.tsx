"use client";

/**
 * 文章详情页 - 沉浸式阅读器
 * 集成：进度条、目录导航、操作栏、阅读设置
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useArticle } from "@/hooks/use-articles";
import { ReaderLayout } from "@/components/layout/reader-layout";
import { ArticleContent } from "@/components/article/article-content";
import { ReadingProgress } from "@/components/article/reading-progress";
import {
  TableOfContents,
  TOCDrawer,
  useTableOfContents,
} from "@/components/article/table-of-contents";
import {
  ArticleActions,
  MobileArticleActions,
} from "@/components/article/article-actions";
import { ReadingSettings } from "@/components/article/reading-settings";
import { ArticleContentSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { useReadingStore, useReadingStyles } from "@/stores/reading-store";
import { cn } from "@/lib/utils";

// ============================================
// 工具函数
// ============================================

function formatDate(dateString: string | null) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function estimateReadingTime(content: string | null): number {
  if (!content) return 0;
  const wordsPerMinute = 400; // 中文阅读速度
  const textLength = content.replace(/<[^>]*>/g, "").length;
  return Math.max(1, Math.ceil(textLength / wordsPerMinute));
}

// ============================================
// 主组件
// ============================================

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const articleId = params.id as string;
  const contentRef = useRef<HTMLDivElement>(null);

  // 状态
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tocDrawerOpen, setTocDrawerOpen] = useState(false);

  // 数据
  const { data: article, isLoading, error } = useArticle(articleId);

  // 目录提取
  const { items: tocItems, activeId } = useTableOfContents(contentRef);

  // 阅读设置
  const readingStyles = useReadingStyles();
  const theme = useReadingStore((s) => s.settings.theme);

  // 主题样式
  const themeStyles = {
    light: "bg-white text-neutral-900",
    dark: "bg-[#1A1A1A] text-neutral-100",
    sepia: "bg-[#F4ECD8] text-[#5C4B37]",
  };

  // 加载状态
  if (isLoading) {
    return (
      <ReaderLayout>
        <div className="min-h-screen bg-white">
          <div className="mx-auto max-w-2xl px-5 py-12">
            <ArticleContentSkeleton />
          </div>
        </div>
      </ReaderLayout>
    );
  }

  // 错误状态
  if (error || !article) {
    return (
      <ReaderLayout>
        <div className="flex min-h-screen items-center justify-center">
          <ErrorState
            action={{
              label: "返回上一页",
              onClick: () => router.back(),
            }}
          />
        </div>
      </ReaderLayout>
    );
  }

  const readingTime = estimateReadingTime(article.content);

  return (
    <ReaderLayout>
      {/* 阅读进度条 */}
      <ReadingProgress />

      {/* 主容器 */}
      <div className={cn("min-h-screen transition-colors duration-300", themeStyles[theme])}>
        {/* 顶部导航栏 */}
        <nav
          className={cn(
            "sticky top-0 z-40 backdrop-blur-sm border-b",
            theme === "dark"
              ? "bg-[#1A1A1A]/95 border-neutral-800"
              : theme === "sepia"
              ? "bg-[#F4ECD8]/95 border-amber-200"
              : "bg-white/95 border-neutral-100"
          )}
        >
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-5">
            {/* 返回按钮 */}
            <button
              onClick={() => router.back()}
              className={cn(
                "flex items-center gap-2 text-sm transition-colors",
                theme === "dark"
                  ? "text-neutral-400 hover:text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-900"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>返回</span>
            </button>

            {/* 阅读时间 + 原文链接 */}
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "text-xs",
                  theme === "dark" ? "text-neutral-500" : "text-neutral-400"
                )}
              >
                约 {readingTime} 分钟
              </span>

              {article.link && (
                <Link
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-1.5 text-sm transition-colors",
                    theme === "dark"
                      ? "text-neutral-400 hover:text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <span>原文</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </nav>

        {/* 主内容区域 */}
        <div className="relative mx-auto max-w-4xl">
          {/* 桌面端：左侧目录 */}
          {tocItems.length > 0 && (
            <div className="hidden xl:block fixed left-8 top-1/2 -translate-y-1/2 z-20">
              <TableOfContents items={tocItems} activeId={activeId} />
            </div>
          )}

          {/* 桌面端：右侧操作栏 */}
          <ArticleActions
            articleId={articleId}
            articleTitle={article.title}
            articleUrl={article.link || undefined}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* 文章内容 */}
          <article
            className="mx-auto max-w-2xl px-5 pb-24 lg:pb-20"
            style={readingStyles}
          >
            {/* 文章头部 */}
            <header className="pt-10 pb-8 border-b border-current/10">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* 分类标签 */}
                {article.category_id && (
                  <div className="mb-4">
                    <Badge variant="outline" className="text-xs">
                      资讯
                    </Badge>
                  </div>
                )}

                {/* 元信息 */}
                <div
                  className={cn(
                    "flex items-center gap-2 text-sm mb-4",
                    theme === "dark" ? "text-neutral-500" : "text-neutral-400"
                  )}
                >
                  {article.author && (
                    <>
                      <span
                        className={
                          theme === "dark" ? "text-neutral-300" : "text-neutral-600"
                        }
                      >
                        {article.author}
                      </span>
                      <span>·</span>
                    </>
                  )}
                  <time>{formatDate(article.published_at)}</time>
                </div>

                {/* 标题 */}
                <h1
                  className="text-3xl md:text-4xl font-bold leading-tight tracking-tight"
                  style={{ lineHeight: 1.3 }}
                >
                  {article.title}
                </h1>

                {/* 摘要 */}
                {article.summary && (
                  <p
                    className={cn(
                      "mt-6 text-lg leading-relaxed",
                      theme === "dark" ? "text-neutral-400" : "text-neutral-500"
                    )}
                  >
                    {article.summary}
                  </p>
                )}
              </motion.div>
            </header>

            {/* 正文内容 */}
            <motion.div
              ref={contentRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="pt-10"
            >
              <ArticleContent
                content={article.content}
                className={cn(
                  "prose prose-lg max-w-none",
                  theme === "dark" && "prose-invert",
                  theme === "sepia" && "prose-amber"
                )}
              />
            </motion.div>

            {/* 文章底部 */}
            <footer className="mt-16 pt-8 border-t border-current/10">
              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => router.back()}
                  className={cn(
                    "transition-colors",
                    theme === "dark"
                      ? "text-neutral-400 hover:text-neutral-200"
                      : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  ← 返回列表
                </button>
                {article.link && (
                  <Link
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 transition-colors"
                  >
                    阅读原文 →
                  </Link>
                )}
              </div>
            </footer>
          </article>
        </div>

        {/* 移动端底部操作栏 */}
        <MobileArticleActions
          articleId={articleId}
          onOpenToc={() => setTocDrawerOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          tocItemCount={tocItems.length}
        />

        {/* 目录抽屉（移动端） */}
        <TOCDrawer
          items={tocItems}
          activeId={activeId}
          open={tocDrawerOpen}
          onOpenChange={setTocDrawerOpen}
        />

        {/* 阅读设置面板 */}
        <ReadingSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </ReaderLayout>
  );
}
