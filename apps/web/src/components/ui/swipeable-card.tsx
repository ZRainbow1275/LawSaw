"use client";

import { ReactNode, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimation,
  PanInfo,
} from "framer-motion";
import { Bookmark, Share2, Trash2, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// 类型定义
// ============================================

interface SwipeAction {
  id: string;
  icon: ReactNode;
  label: string;
  color: string;
  bgColor: string;
  onClick: () => void;
}

interface SwipeableCardProps {
  children: ReactNode;
  /** 左滑显示的操作 */
  leftActions?: SwipeAction[];
  /** 右滑显示的操作 */
  rightActions?: SwipeAction[];
  /** 滑动阈值（px） */
  threshold?: number;
  /** 最大滑动距离（px） */
  maxSwipe?: number;
  /** 自定义类名 */
  className?: string;
  /** 是否禁用滑动 */
  disabled?: boolean;
  /** 滑动开始回调 */
  onSwipeStart?: () => void;
  /** 滑动结束回调 */
  onSwipeEnd?: () => void;
}

// ============================================
// 预设操作
// ============================================

export const swipeActionPresets = {
  bookmark: (onClick: () => void, isBookmarked = false): SwipeAction => ({
    id: "bookmark",
    icon: <Bookmark className={cn("h-5 w-5", isBookmarked && "fill-current")} />,
    label: isBookmarked ? "取消收藏" : "收藏",
    color: "text-white",
    bgColor: "bg-primary-500",
    onClick,
  }),
  share: (onClick: () => void): SwipeAction => ({
    id: "share",
    icon: <Share2 className="h-5 w-5" />,
    label: "分享",
    color: "text-white",
    bgColor: "bg-blue-500",
    onClick,
  }),
  delete: (onClick: () => void): SwipeAction => ({
    id: "delete",
    icon: <Trash2 className="h-5 w-5" />,
    label: "删除",
    color: "text-white",
    bgColor: "bg-red-500",
    onClick,
  }),
  more: (onClick: () => void): SwipeAction => ({
    id: "more",
    icon: <MoreHorizontal className="h-5 w-5" />,
    label: "更多",
    color: "text-white",
    bgColor: "bg-neutral-500",
    onClick,
  }),
};

// ============================================
// SwipeableCard 组件
// ============================================

export function SwipeableCard({
  children,
  leftActions = [],
  rightActions = [],
  threshold = 50,
  maxSwipe = 160,
  className,
  disabled = false,
  onSwipeStart,
  onSwipeEnd,
}: SwipeableCardProps) {
  const [isOpen, setIsOpen] = useState<"left" | "right" | null>(null);
  const x = useMotionValue(0);
  const controls = useAnimation();

  // 计算操作按钮的透明度和缩放
  const leftOpacity = useTransform(x, [0, threshold], [0, 1]);
  const leftScale = useTransform(x, [0, threshold], [0.8, 1]);
  const rightOpacity = useTransform(x, [-threshold, 0], [1, 0]);
  const rightScale = useTransform(x, [-threshold, 0], [1, 0.8]);

  // 计算背景颜色
  const bgColor = useTransform(
    x,
    [-maxSwipe, 0, maxSwipe],
    [
      rightActions[0]?.bgColor || "transparent",
      "transparent",
      leftActions[0]?.bgColor || "transparent",
    ]
  );

  const handleDragStart = () => {
    onSwipeStart?.();
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    // 判断滑动方向和距离
    if (offset > threshold || velocity > 500) {
      // 右滑（显示左侧操作）
      if (leftActions.length > 0) {
        controls.start({ x: maxSwipe });
        setIsOpen("left");
      } else {
        controls.start({ x: 0 });
        setIsOpen(null);
      }
    } else if (offset < -threshold || velocity < -500) {
      // 左滑（显示右侧操作）
      if (rightActions.length > 0) {
        controls.start({ x: -maxSwipe });
        setIsOpen("right");
      } else {
        controls.start({ x: 0 });
        setIsOpen(null);
      }
    } else {
      // 复位
      controls.start({ x: 0 });
      setIsOpen(null);
    }

    onSwipeEnd?.();
  };

  const handleClose = () => {
    controls.start({ x: 0 });
    setIsOpen(null);
  };

  const handleActionClick = (action: SwipeAction) => {
    action.onClick();
    handleClose();
  };

  const actionButtonWidth = maxSwipe / Math.max(leftActions.length, rightActions.length, 1);

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* 背景色层 */}
      <motion.div
        className="absolute inset-0 rounded-xl"
        style={{ backgroundColor: bgColor }}
      />

      {/* 左侧操作按钮（右滑显示） */}
      {leftActions.length > 0 && (
        <motion.div
          className="absolute left-0 top-0 bottom-0 flex items-center"
          style={{ opacity: leftOpacity, scale: leftScale }}
        >
          {leftActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action)}
              className={cn(
                "flex flex-col items-center justify-center h-full transition-transform",
                action.color
              )}
              style={{ width: actionButtonWidth }}
            >
              {action.icon}
              <span className="text-xs mt-1 font-medium">{action.label}</span>
            </button>
          ))}
        </motion.div>
      )}

      {/* 右侧操作按钮（左滑显示） */}
      {rightActions.length > 0 && (
        <motion.div
          className="absolute right-0 top-0 bottom-0 flex items-center"
          style={{ opacity: rightOpacity, scale: rightScale }}
        >
          {rightActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleActionClick(action)}
              className={cn(
                "flex flex-col items-center justify-center h-full transition-transform",
                action.color,
                action.bgColor
              )}
              style={{ width: actionButtonWidth }}
            >
              {action.icon}
              <span className="text-xs mt-1 font-medium">{action.label}</span>
            </button>
          ))}
        </motion.div>
      )}

      {/* 主内容（可滑动） */}
      <motion.div
        drag={disabled ? false : "x"}
        dragConstraints={{ left: -maxSwipe, right: maxSwipe }}
        dragElastic={0.1}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x }}
        className="relative bg-white rounded-xl touch-pan-y"
        onClick={isOpen ? handleClose : undefined}
      >
        {children}
      </motion.div>

      {/* 点击遮罩（打开状态时点击关闭） */}
      {isOpen && (
        <div
          className="absolute inset-0 z-10"
          onClick={handleClose}
        />
      )}
    </div>
  );
}

// ============================================
// SwipeHint 滑动提示组件
// ============================================

interface SwipeHintProps {
  direction?: "left" | "right" | "both";
  className?: string;
}

export function SwipeHint({ direction = "left", className }: SwipeHintProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "flex items-center justify-center gap-2 text-xs text-neutral-400 py-2",
        className
      )}
    >
      {(direction === "left" || direction === "both") && (
        <span className="flex items-center gap-1">
          <motion.span
            animate={{ x: [-2, 2, -2] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            ←
          </motion.span>
          左滑操作
        </span>
      )}
      {direction === "both" && <span className="text-neutral-300">|</span>}
      {(direction === "right" || direction === "both") && (
        <span className="flex items-center gap-1">
          右滑收藏
          <motion.span
            animate={{ x: [2, -2, 2] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            →
          </motion.span>
        </span>
      )}
    </motion.div>
  );
}

// ============================================
// 导出
// ============================================

export default SwipeableCard;
