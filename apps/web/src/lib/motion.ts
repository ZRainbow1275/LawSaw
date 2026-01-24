/**
 * 动效系统 - Framer Motion Variants 定义
 * 遵循 DESIGN_HANDBOOK.md 动效规范
 */

import type { Variants, Transition } from "framer-motion";

// ============================================
// 基础过渡曲线
// ============================================

export const transitions = {
  /** 快速反馈 - 150ms */
  fast: {
    duration: 0.15,
    ease: [0, 0, 0.2, 1], // ease-out
  } satisfies Transition,

  /** 标准过渡 - 200ms */
  default: {
    duration: 0.2,
    ease: [0.4, 0, 0.2, 1], // ease-default
  } satisfies Transition,

  /** 进入动画 - 300ms */
  enter: {
    duration: 0.3,
    ease: [0, 0, 0.2, 1], // ease-out
  } satisfies Transition,

  /** 弹性动画 - 适用于侧边栏、抽屉 */
  spring: {
    type: "spring",
    damping: 25,
    stiffness: 200,
  } satisfies Transition,

  /** 轻弹性 - 适用于按钮、图标 */
  springLight: {
    type: "spring",
    damping: 20,
    stiffness: 300,
  } satisfies Transition,

  /** 缓慢动画 - 500ms */
  slow: {
    duration: 0.5,
    ease: [0.4, 0, 0.2, 1],
  } satisfies Transition,
} as const;

// ============================================
// 页面过渡动画
// ============================================

export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  enter: {
    opacity: 1,
    y: 0,
    transition: transitions.enter,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: transitions.fast,
  },
};

// ============================================
// 淡入动画
// ============================================

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    transition: transitions.fast,
  },
};

// ============================================
// 滑入动画
// ============================================

export const slideUpVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.enter,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: transitions.fast,
  },
};

export const slideDownVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.enter,
  },
};

export const slideLeftVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.enter,
  },
};

export const slideRightVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.enter,
  },
};

// ============================================
// 缩放动画
// ============================================

export const scaleVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.enter,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: transitions.fast,
  },
};

export const popVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.springLight,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: transitions.fast,
  },
};

// ============================================
// 侧边栏动画
// ============================================

export const sidebarVariants: Variants = {
  hidden: {
    x: -280,
    opacity: 0,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.spring,
  },
  exit: {
    x: -280,
    opacity: 0,
    transition: transitions.spring,
  },
};

// ============================================
// 列表交错动画
// ============================================

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.enter,
  },
};

// ============================================
// Toast 通知动画
// ============================================

export const toastVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    x: 100,
    transition: transitions.fast,
  },
};

// ============================================
// 遮罩层动画
// ============================================

export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    transition: transitions.fast,
  },
};

// ============================================
// 卡片悬停效果（用于 whileHover）
// ============================================

export const cardHoverEffect = {
  y: -4,
  transition: transitions.default,
};

export const buttonHoverEffect = {
  scale: 1.02,
  transition: transitions.fast,
};

export const buttonTapEffect = {
  scale: 0.98,
};

// ============================================
// 图标动画
// ============================================

export const iconBounceVariants: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.2, 1],
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
};

export const rotateVariants: Variants = {
  initial: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      ease: "linear",
      repeat: Number.POSITIVE_INFINITY,
    },
  },
};

// ============================================
// 骨架屏渐变（用于 CSS）
// ============================================

export const skeletonKeyframes = `
@keyframes skeleton-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

// ============================================
// 工具函数
// ============================================

/**
 * 创建交错动画容器变体
 * @param staggerDelay 子元素间隔时间（秒）
 * @param initialDelay 首个子元素延迟（秒）
 */
export function createStaggerVariants(
  staggerDelay = 0.05,
  initialDelay = 0.1
): Variants {
  return {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
      },
    },
  };
}

/**
 * 创建滑入变体
 * @param direction 滑入方向
 * @param distance 滑动距离（px）
 */
export function createSlideVariants(
  direction: "up" | "down" | "left" | "right" = "up",
  distance = 20
): Variants {
  const isVertical = direction === "up" || direction === "down";
  const value = direction === "up" || direction === "left" ? distance : -distance;

  if (isVertical) {
    return {
      hidden: { opacity: 0, y: value },
      visible: { opacity: 1, y: 0, transition: transitions.enter },
    };
  }
  return {
    hidden: { opacity: 0, x: value },
    visible: { opacity: 1, x: 0, transition: transitions.enter },
  };
}
