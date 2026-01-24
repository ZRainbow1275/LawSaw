"use client";

/**
 * 阅读进度条组件
 * 顶部固定的阅读进度指示器，支持进度保存和恢复
 */

import * as React from "react";
import { useScroll, useSpring, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReadingStore } from "@/stores/reading-store";

// ============================================
// 类型定义
// ============================================

interface ReadingProgressProps {
  /** 文章 ID，用于保存进度 */
  articleId?: string;
  /** 容器元素的 ref，默认使用 document */
  containerRef?: React.RefObject<HTMLElement>;
  /** 是否显示百分比文字 */
  showPercentage?: boolean;
  /** 进度条高度 */
  height?: number;
  /** 自定义类名 */
  className?: string;
}

// ============================================
// 组件实现
// ============================================

export function ReadingProgress({
  articleId,
  containerRef,
  showPercentage = false,
  height = 2,
  className,
}: ReadingProgressProps) {
  const { scrollYProgress } = useScroll({
    container: containerRef,
  });

  const updateProgress = useReadingStore((s) => s.updateProgress);

  // 使用弹性动画使进度条更流畅
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // 保存阅读进度
  React.useEffect(() => {
    if (!articleId) return;

    const unsubscribe = scrollYProgress.on("change", (v) => {
      if (v > 0.01) {
        updateProgress(articleId, {
          progress: v,
          scrollPosition: window.scrollY,
        });
      }
    });

    return unsubscribe;
  }, [scrollYProgress, articleId, updateProgress]);

  return (
    <>
      {/* 进度条 */}
      <motion.div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="阅读进度"
        className={cn(
          "fixed top-0 left-0 right-0 z-50 origin-left",
          "bg-gradient-to-r from-primary-500 to-primary-400",
          className
        )}
        style={{
          scaleX,
          height,
        }}
      />

      {/* 可选：百分比显示 */}
      {showPercentage && (
        <ProgressPercentage scrollYProgress={scrollYProgress} />
      )}
    </>
  );
}

// ============================================
// 百分比显示组件
// ============================================

function ProgressPercentage({
  scrollYProgress,
}: {
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  return (
    <motion.div
      className="fixed top-4 right-4 z-50 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 shadow-lg border border-neutral-100"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <motion.span className="text-xs font-medium text-neutral-700">
        {/* 使用 useMotionValue 订阅值变化 */}
        <ProgressValue scrollYProgress={scrollYProgress} />
      </motion.span>
    </motion.div>
  );
}

function ProgressValue({
  scrollYProgress,
}: {
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  // 需要在客户端渲染
  const [percentage, setPercentage] = React.useState(0);

  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      setPercentage(Math.round(latest * 100));
    });
    return unsubscribe;
  }, [scrollYProgress]);

  return <>{percentage}%</>;
}

// ============================================
// Hook: 获取阅读进度
// ============================================

export function useReadingProgress(containerRef?: React.RefObject<HTMLElement>) {
  const { scrollYProgress } = useScroll({
    container: containerRef,
  });

  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const unsubscribe = scrollYProgress.on("change", (latest) => {
      setProgress(latest);
    });
    return unsubscribe;
  }, [scrollYProgress]);

  return {
    progress,
    percentage: Math.round(progress * 100),
    scrollYProgress,
  };
}
