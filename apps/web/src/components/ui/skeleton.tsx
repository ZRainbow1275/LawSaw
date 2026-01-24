"use client";

/**
 * 骨架屏组件
 * 带渐变动画的加载占位符
 */

import { cn } from "@/lib/utils";

// ============================================
// 类型定义
// ============================================

export type SkeletonVariant = "text" | "circular" | "rectangular" | "card";

interface SkeletonProps {
  /** 变体类型 */
  variant?: SkeletonVariant;
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
  /** 重复数量 */
  count?: number;
  /** 自定义类名 */
  className?: string;
}

// ============================================
// 基础骨架屏
// ============================================

export function Skeleton({
  variant = "text",
  width,
  height,
  count = 1,
  className,
}: SkeletonProps) {
  const baseStyles = cn(
    "animate-shimmer bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:200%_100%]",
    {
      "h-4 rounded": variant === "text",
      "rounded-full": variant === "circular",
      "rounded-lg": variant === "rectangular",
      "rounded-xl": variant === "card",
    },
    className
  );

  const style: React.CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  if (count === 1) {
    return <div className={baseStyles} style={style} />;
  }

  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={baseStyles} style={style} />
      ))}
    </div>
  );
}

// ============================================
// 预设骨架屏组件
// ============================================

/** 文章卡片骨架屏 */
export function ArticleCardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4 space-y-3">
      {/* 标签区域 */}
      <div className="flex gap-2">
        <Skeleton variant="rectangular" width={60} height={24} />
        <Skeleton variant="rectangular" width={48} height={24} />
      </div>
      {/* 标题 */}
      <Skeleton variant="text" width="100%" height={24} />
      <Skeleton variant="text" width="85%" height={20} />
      {/* 元信息 */}
      <div className="flex gap-4 pt-2">
        <Skeleton variant="text" width={80} height={16} />
        <Skeleton variant="text" width={60} height={16} />
      </div>
    </div>
  );
}

/** 统计卡片骨架屏 */
export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="text" width={80} height={16} />
          <Skeleton variant="text" width={120} height={32} />
        </div>
        <Skeleton variant="circular" width={48} height={48} />
      </div>
    </div>
  );
}

/** 文章内容骨架屏 */
export function ArticleContentSkeleton() {
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* 标题 */}
      <div className="space-y-3">
        <Skeleton variant="text" width="90%" height={36} />
        <Skeleton variant="text" width="60%" height={36} />
      </div>
      {/* 元信息 */}
      <div className="flex gap-4">
        <Skeleton variant="text" width={100} height={20} />
        <Skeleton variant="text" width={80} height={20} />
      </div>
      {/* 正文 */}
      <div className="space-y-4 pt-8">
        <Skeleton variant="text" count={4} />
        <Skeleton variant="text" width="70%" />
        <div className="py-4">
          <Skeleton variant="rectangular" width="100%" height={200} />
        </div>
        <Skeleton variant="text" count={3} />
        <Skeleton variant="text" width="85%" />
      </div>
    </div>
  );
}

/** 侧边栏骨架屏 */
export function SidebarSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Logo */}
      <div className="flex items-center gap-3 pb-4 border-b border-neutral-100">
        <Skeleton variant="circular" width={40} height={40} />
        <Skeleton variant="text" width={100} height={24} />
      </div>
      {/* 导航项 */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton variant="rectangular" width={20} height={20} />
            <Skeleton variant="text" width={80} height={18} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 列表骨架屏 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  );
}
