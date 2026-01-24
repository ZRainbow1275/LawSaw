"use client";

/**
 * 安全状态指示器组件
 * 展示数据加密和安全状态
 */

import { Shield, ShieldCheck, ShieldAlert, ShieldX, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

// ============================================
// 类型定义
// ============================================

export type EncryptionStatus = "active" | "inactive" | "unknown";
export type DataIntegrity = "verified" | "pending" | "failed";

interface SecurityIndicatorProps {
  /** 加密状态 */
  encryptionStatus: EncryptionStatus;
  /** 最后同步时间 */
  lastSyncTime?: Date;
  /** 数据完整性状态 */
  dataIntegrity?: DataIntegrity;
  /** 点击回调 */
  onClick?: () => void;
  /** 紧凑模式 */
  compact?: boolean;
  /** 自定义类名 */
  className?: string;
}

// ============================================
// 状态配置
// ============================================

const statusConfig: Record<
  EncryptionStatus,
  {
    icon: typeof Shield;
    label: string;
    description: string;
    bgColor: string;
    borderColor: string;
    iconColor: string;
    pulseColor: string;
  }
> = {
  active: {
    icon: ShieldCheck,
    label: "数据加密保护中",
    description: "所有数据已加密传输",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    iconColor: "text-green-600",
    pulseColor: "bg-green-500",
  },
  inactive: {
    icon: ShieldAlert,
    label: "加密未启用",
    description: "建议启用数据加密",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    iconColor: "text-amber-600",
    pulseColor: "bg-amber-500",
  },
  unknown: {
    icon: ShieldX,
    label: "状态未知",
    description: "无法获取安全状态",
    bgColor: "bg-neutral-50",
    borderColor: "border-neutral-200",
    iconColor: "text-neutral-400",
    pulseColor: "bg-neutral-400",
  },
};

const integrityConfig: Record<
  DataIntegrity,
  { icon: typeof CheckCircle2; label: string; color: string }
> = {
  verified: {
    icon: CheckCircle2,
    label: "数据完整",
    color: "text-green-600",
  },
  pending: {
    icon: Clock,
    label: "验证中",
    color: "text-amber-600",
  },
  failed: {
    icon: ShieldX,
    label: "验证失败",
    color: "text-red-600",
  },
};

// ============================================
// 时间格式化
// ============================================

function formatTime(date?: Date): string {
  if (!date) return "未知";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return date.toLocaleDateString("zh-CN");
}

// ============================================
// 组件实现
// ============================================

export function SecurityIndicator({
  encryptionStatus,
  lastSyncTime,
  dataIntegrity = "verified",
  onClick,
  compact = false,
  className,
}: SecurityIndicatorProps) {
  const config = statusConfig[encryptionStatus];
  const integrity = integrityConfig[dataIntegrity];
  const Icon = config.icon;
  const IntegrityIcon = integrity.icon;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 transition-all",
          config.bgColor,
          config.borderColor,
          "border hover:shadow-sm",
          onClick && "cursor-pointer",
          className
        )}
      >
        <div className="relative">
          <Icon className={cn("h-4 w-4", config.iconColor)} />
          {encryptionStatus === "active" && (
            <motion.span
              className={cn(
                "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
                config.pulseColor
              )}
              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>
        <span className="text-xs font-medium text-neutral-700">
          {config.label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl p-4 transition-all",
        config.bgColor,
        config.borderColor,
        "border hover:shadow-md",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* 图标 */}
      <div className="relative shrink-0">
        <Icon className={cn("h-6 w-6", config.iconColor)} />
        {encryptionStatus === "active" && (
          <motion.span
            className={cn(
              "absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full",
              config.pulseColor
            )}
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold text-neutral-900">{config.label}</p>
        <p className="text-xs text-neutral-500 truncate">{config.description}</p>
        {lastSyncTime && (
          <p className="text-xs text-neutral-400 mt-1">
            上次同步：{formatTime(lastSyncTime)}
          </p>
        )}
      </div>

      {/* 完整性状态 */}
      <div className="shrink-0 flex items-center gap-1">
        <IntegrityIcon className={cn("h-4 w-4", integrity.color)} />
      </div>
    </button>
  );
}

// ============================================
// 简化版本 - Dashboard 用
// ============================================

export function SecurityBadge({
  status = "active",
  className,
}: {
  status?: EncryptionStatus;
  className?: string;
}) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        config.bgColor,
        config.borderColor,
        "border",
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", config.iconColor)} />
      <span className="text-neutral-700">{config.label}</span>
    </div>
  );
}
