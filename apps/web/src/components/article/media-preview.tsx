"use client";

/**
 * 富媒体预览组件
 * 支持图片、PDF、视频、音频的预览展示
 */

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ExternalLink,
  FileText,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Image as ImageIcon,
  File,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { fadeVariants } from "@/lib/motion";

// ============================================
// 类型定义
// ============================================

export type MediaType = "image" | "pdf" | "video" | "audio" | "document" | "unknown";

export interface MediaItem {
  url: string;
  type: MediaType;
  title?: string;
  alt?: string;
  thumbnail?: string;
  mimeType?: string;
}

interface MediaPreviewProps {
  media: MediaItem;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

interface MediaPreviewTriggerProps {
  media: MediaItem;
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
}

// ============================================
// 工具函数
// ============================================

export function detectMediaType(url: string, mimeType?: string): MediaType {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
  }

  const ext = url.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext || "")) {
    return "image";
  }
  if (ext === "pdf") return "pdf";
  if (["mp4", "webm", "ogg", "mov", "avi"].includes(ext || "")) return "video";
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")) return "audio";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext || "")) {
    return "document";
  }

  return "unknown";
}

const mediaTypeIcons: Record<MediaType, React.ComponentType<{ className?: string }>> = {
  image: ImageIcon,
  pdf: FileText,
  video: Play,
  audio: Volume2,
  document: File,
  unknown: File,
};

const mediaTypeLabels: Record<MediaType, string> = {
  image: "图片",
  pdf: "PDF 文档",
  video: "视频",
  audio: "音频",
  document: "文档",
  unknown: "文件",
};

// ============================================
// 图片预览器
// ============================================

interface ImagePreviewerProps {
  src: string;
  alt?: string;
}

function ImagePreviewer({ src, alt }: ImagePreviewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div className="relative flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-center gap-2 p-3 border-b border-neutral-100">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          className="p-2 rounded-lg hover:bg-neutral-100 disabled:opacity-40 transition-colors"
          title="缩小"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-sm text-neutral-600 min-w-[4rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= 3}
          className="p-2 rounded-lg hover:bg-neutral-100 disabled:opacity-40 transition-colors"
          title="放大"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="w-px h-5 bg-neutral-200 mx-2" />
        <button
          type="button"
          onClick={handleRotate}
          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          title="旋转"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-3 py-1.5 text-xs text-neutral-600 rounded-lg hover:bg-neutral-100 transition-colors"
        >
          重置
        </button>
      </div>

      {/* 图片容器 */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-neutral-50/50">
        <motion.img
          src={src}
          alt={alt || "预览图片"}
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transition: "transform 0.2s ease-out",
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: zoom }}
          draggable={false}
        />
      </div>
    </div>
  );
}

// ============================================
// PDF 预览器
// ============================================

interface PdfPreviewerProps {
  src: string;
  title?: string;
}

function PdfPreviewer({ src, title }: PdfPreviewerProps) {
  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-100">
        <span className="text-sm font-medium text-neutral-700 truncate">
          {title || "PDF 文档"}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            title="在新窗口打开"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={src}
            download
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            title="下载"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* PDF 嵌入 */}
      <div className="flex-1 bg-neutral-100">
        <iframe
          src={`${src}#toolbar=0&navpanes=0`}
          className="w-full h-full border-0"
          title={title || "PDF 预览"}
        />
      </div>
    </div>
  );
}

// ============================================
// 视频预览器
// ============================================

interface VideoPreviewerProps {
  src: string;
  title?: string;
}

function VideoPreviewer({ src, title }: VideoPreviewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-100">
        <span className="text-sm font-medium text-neutral-700 truncate">
          {title || "视频"}
        </span>
        <a
          href={src}
          download
          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
          title="下载"
        >
          <Download className="h-4 w-4" />
        </a>
      </div>

      {/* 视频播放器 */}
      <div className="flex-1 flex items-center justify-center bg-black p-4">
        <video
          src={src}
          className="max-w-full max-h-full rounded-lg"
          controls
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        >
          您的浏览器不支持视频播放
        </video>
      </div>
    </div>
  );
}

// ============================================
// 音频预览器
// ============================================

interface AudioPreviewerProps {
  src: string;
  title?: string;
}

function AudioPreviewer({ src, title }: AudioPreviewerProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 gap-6">
      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
        <Volume2 className="w-12 h-12 text-primary-600" />
      </div>
      <span className="text-sm font-medium text-neutral-700">
        {title || "音频文件"}
      </span>
      <audio src={src} controls className="w-full max-w-md">
        您的浏览器不支持音频播放
      </audio>
      <a
        href={src}
        download
        className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 rounded-lg hover:bg-neutral-100 transition-colors"
      >
        <Download className="h-4 w-4" />
        下载音频
      </a>
    </div>
  );
}

// ============================================
// 文档预览器（不可预览）
// ============================================

interface DocumentPreviewerProps {
  src: string;
  title?: string;
  type: MediaType;
}

function DocumentPreviewer({ src, title, type }: DocumentPreviewerProps) {
  const Icon = mediaTypeIcons[type];

  return (
    <div className="flex flex-col items-center justify-center p-8 gap-6">
      <div className="w-24 h-24 rounded-2xl bg-neutral-100 flex items-center justify-center">
        <Icon className="w-12 h-12 text-neutral-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-neutral-700">
          {title || "文档"}
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          {mediaTypeLabels[type]} - 暂不支持在线预览
        </p>
      </div>
      <div className="flex items-center gap-3">
        <a
          href={src}
          download
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Download className="h-4 w-4" />
          下载文件
        </a>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          新窗口打开
        </a>
      </div>
    </div>
  );
}

// ============================================
// 主预览组件
// ============================================

export function MediaPreview({
  media,
  isOpen,
  onClose,
  className,
}: MediaPreviewProps) {
  const renderPreview = () => {
    switch (media.type) {
      case "image":
        return <ImagePreviewer src={media.url} alt={media.alt} />;
      case "pdf":
        return <PdfPreviewer src={media.url} title={media.title} />;
      case "video":
        return <VideoPreviewer src={media.url} title={media.title} />;
      case "audio":
        return <AudioPreviewer src={media.url} title={media.title} />;
      default:
        return (
          <DocumentPreviewer
            src={media.url}
            title={media.title}
            type={media.type}
          />
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={media.type === "image" || media.type === "video" ? "xl" : "lg"}
      className={cn("overflow-hidden", className)}
    >
      <div className="h-[80vh] max-h-[800px]">{renderPreview()}</div>
    </Modal>
  );
}

// ============================================
// 触发器组件（用于文章内容中的媒体缩略图）
// ============================================

export function MediaPreviewTrigger({
  media,
  onClick,
  className,
  children,
}: MediaPreviewTriggerProps) {
  const Icon = mediaTypeIcons[media.type];

  if (children) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("cursor-pointer", className)}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border border-neutral-200",
        "hover:border-primary-300 hover:shadow-md transition-all",
        className
      )}
    >
      {/* 缩略图或图标 */}
      {media.thumbnail || media.type === "image" ? (
        <img
          src={media.thumbnail || media.url}
          alt={media.alt || media.title || "预览"}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-50">
          <Icon className="w-8 h-8 text-neutral-400" />
        </div>
      )}

      {/* 悬停遮罩 */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* 类型标签 */}
      {media.type !== "image" && (
        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
          {mediaTypeLabels[media.type]}
        </div>
      )}
    </button>
  );
}

// ============================================
// Hook: 使用媒体预览
// ============================================

export function useMediaPreview() {
  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openPreview = useCallback((media: MediaItem) => {
    setCurrentMedia(media);
    setIsOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setCurrentMedia(null), 200);
  }, []);

  return {
    currentMedia,
    isOpen,
    openPreview,
    closePreview,
  };
}
