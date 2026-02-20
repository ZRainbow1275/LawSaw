"use client";

/**
 * Rich media preview.
 * Supports previewing images, PDFs, videos, and audio files.
 */

import { Modal } from "@/components/ui/modal";
import { useT } from "@/lib/i18n-client";
import { fadeVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	Download,
	ExternalLink,
	File,
	FileText,
	Image as ImageIcon,
	Maximize2,
	Play,
	RotateCw,
	Volume2,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";

// ============================================
// Types
// ============================================

export type MediaType =
	| "image"
	| "pdf"
	| "video"
	| "audio"
	| "document"
	| "unknown";

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
// Helpers
// ============================================

export function detectMediaType(url: string, mimeType?: string): MediaType {
	if (mimeType) {
		if (mimeType.startsWith("image/")) return "image";
		if (mimeType === "application/pdf") return "pdf";
		if (mimeType.startsWith("video/")) return "video";
		if (mimeType.startsWith("audio/")) return "audio";
	}

	const ext = url.split(".").pop()?.toLowerCase();

	if (
		["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(
			ext || "",
		)
	) {
		return "image";
	}
	if (ext === "pdf") return "pdf";
	if (["mp4", "webm", "ogg", "mov", "avi"].includes(ext || "")) return "video";
	if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")) return "audio";
	if (
		["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt"].includes(ext || "")
	) {
		return "document";
	}

	return "unknown";
}

const mediaTypeIcons: Record<
	MediaType,
	React.ComponentType<{ className?: string }>
> = {
	image: ImageIcon,
	pdf: FileText,
	video: Play,
	audio: Volume2,
	document: File,
	unknown: File,
};

const mediaTypeLabelKeys: Record<MediaType, string> = {
	image: "Image",
	pdf: "PDF document",
	video: "Video",
	audio: "Audio",
	document: "Document",
	unknown: "File",
};

// ============================================
// Image
// ============================================

interface ImagePreviewerProps {
	src: string;
	alt?: string;
}

function ImagePreviewer({ src, alt }: ImagePreviewerProps) {
	const t = useT();
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
			{/* Toolbar */}
			<div className="flex items-center justify-center gap-2 p-3 border-b border-neutral-100">
				<button
					type="button"
					onClick={handleZoomOut}
					disabled={zoom <= 0.5}
					className="p-2 rounded-lg hover:bg-neutral-100 disabled:opacity-40 transition-colors"
					title={t("Zoom out")}
				>
					<ZoomOut aria-hidden="true" className="h-4 w-4" />
				</button>
				<span className="text-sm text-neutral-600 min-w-[4rem] text-center">
					{Math.round(zoom * 100)}%
				</span>
				<button
					type="button"
					onClick={handleZoomIn}
					disabled={zoom >= 3}
					className="p-2 rounded-lg hover:bg-neutral-100 disabled:opacity-40 transition-colors"
					title={t("Zoom in")}
				>
					<ZoomIn aria-hidden="true" className="h-4 w-4" />
				</button>
				<div className="w-px h-5 bg-neutral-200 mx-2" />
				<button
					type="button"
					onClick={handleRotate}
					className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
					title={t("Rotate")}
				>
					<RotateCw aria-hidden="true" className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={handleReset}
					className="px-3 py-1.5 text-xs text-neutral-600 rounded-lg hover:bg-neutral-100 transition-colors"
				>
					{t("Reset")}
				</button>
			</div>

			{/* Canvas */}
			<div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-neutral-50/50">
				<motion.img
					src={src}
					alt={alt || t("Image preview")}
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
// PDF
// ============================================

interface PdfPreviewerProps {
	src: string;
	title?: string;
}

function PdfPreviewer({ src, title }: PdfPreviewerProps) {
	const t = useT();
	return (
		<div className="flex flex-col h-full">
			{/* Toolbar */}
			<div className="flex items-center justify-between p-3 border-b border-neutral-100">
				<span className="text-sm font-medium text-neutral-700 truncate">
					{title || t("PDF document")}
				</span>
				<div className="flex items-center gap-2">
					<a
						href={src}
						target="_blank"
						rel="noopener noreferrer"
						className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
						title={t("Open in new window")}
					>
						<ExternalLink aria-hidden="true" className="h-4 w-4" />
					</a>
					<a
						href={src}
						download
						className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
						title={t("Download")}
					>
						<Download aria-hidden="true" className="h-4 w-4" />
					</a>
				</div>
			</div>

			{/* Embed */}
			<div className="flex-1 bg-neutral-100">
				<iframe
					src={`${src}#toolbar=0&navpanes=0`}
					className="w-full h-full border-0"
					title={title || t("PDF preview")}
				/>
			</div>
		</div>
	);
}

// ============================================
// Video
// ============================================

interface VideoPreviewerProps {
	src: string;
	title?: string;
}

function VideoPreviewer({ src, title }: VideoPreviewerProps) {
	const t = useT();

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between p-3 border-b border-neutral-100">
				<span className="text-sm font-medium text-neutral-700 truncate">
					{title || t("Video")}
				</span>
				<a
					href={src}
					download
					className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
					title={t("Download")}
				>
					<Download aria-hidden="true" className="h-4 w-4" />
				</a>
			</div>

			{/* Player */}
			<div className="flex-1 flex items-center justify-center bg-black p-4">
				{/* biome-ignore lint/a11y/useMediaCaption: External media usually has no captions; preview only provides playback/download. */}
				<video
					src={src}
					className="max-w-full max-h-full rounded-lg"
					controls
					playsInline
				>
					{t("Your browser does not support video playback.")}
				</video>
			</div>
		</div>
	);
}

// ============================================
// Audio
// ============================================

interface AudioPreviewerProps {
	src: string;
	title?: string;
}

function AudioPreviewer({ src, title }: AudioPreviewerProps) {
	const t = useT();
	return (
		<div className="flex flex-col items-center justify-center p-8 gap-6">
			<div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
				<Volume2 aria-hidden="true" className="w-12 h-12 text-primary-600" />
			</div>
			<span className="text-sm font-medium text-neutral-700">
				{title || t("Audio file")}
			</span>
			{/* biome-ignore lint/a11y/useMediaCaption: External audio usually has no captions/transcripts; preview only provides playback/download. */}
			<audio src={src} controls className="w-full max-w-md">
				{t("Your browser does not support audio playback.")}
			</audio>
			<a
				href={src}
				download
				className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 rounded-lg hover:bg-neutral-100 transition-colors"
			>
				<Download aria-hidden="true" className="h-4 w-4" />
				{t("Download audio")}
			</a>
		</div>
	);
}

// ============================================
// Document (no preview)
// ============================================

interface DocumentPreviewerProps {
	src: string;
	title?: string;
	type: MediaType;
}

function DocumentPreviewer({ src, title, type }: DocumentPreviewerProps) {
	const t = useT();
	const Icon = mediaTypeIcons[type];

	return (
		<div className="flex flex-col items-center justify-center p-8 gap-6">
			<div className="w-24 h-24 rounded-2xl bg-neutral-100 flex items-center justify-center">
				<Icon aria-hidden="true" className="w-12 h-12 text-neutral-400" />
			</div>
			<div className="text-center">
				<p className="text-sm font-medium text-neutral-700">
					{title || t("Document")}
				</p>
				<p className="text-xs text-neutral-500 mt-1">
					{t(mediaTypeLabelKeys[type])} ·{" "}
					{t("Online preview is not supported yet.")}
				</p>
			</div>
			<div className="flex items-center gap-3">
				<a
					href={src}
					download
					className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
				>
					<Download aria-hidden="true" className="h-4 w-4" />
					{t("Download file")}
				</a>
				<a
					href={src}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-600 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors"
				>
					<ExternalLink aria-hidden="true" className="h-4 w-4" />
					{t("Open in new window")}
				</a>
			</div>
		</div>
	);
}

// ============================================
// Preview
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
// Trigger (for inline thumbnails)
// ============================================

export function MediaPreviewTrigger({
	media,
	onClick,
	className,
	children,
}: MediaPreviewTriggerProps) {
	const t = useT();
	const Icon = mediaTypeIcons[media.type];
	const thumbnailSrc = media.thumbnail || media.url;
	const thumbnailAlt = media.alt || media.title || t("Preview");
	const isPreviewUrl =
		thumbnailSrc.startsWith("blob:") || thumbnailSrc.startsWith("data:");
	const isRemoteHttp =
		thumbnailSrc.startsWith("http://") || thumbnailSrc.startsWith("https://");

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
				className,
			)}
		>
			{/* Thumbnail or icon */}
			{media.thumbnail || media.type === "image" ? (
				<Image
					src={thumbnailSrc}
					alt={thumbnailAlt}
					fill
					sizes="(max-width: 640px) 40vw, 240px"
					className="object-cover"
					unoptimized={isRemoteHttp || isPreviewUrl}
					loader={({ src }) => src}
				/>
			) : (
				<div className="w-full h-full flex items-center justify-center bg-neutral-50">
					<Icon aria-hidden="true" className="w-8 h-8 text-neutral-400" />
				</div>
			)}

			{/* Hover overlay */}
			<div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
				<Maximize2
					aria-hidden="true"
					className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
				/>
			</div>

			{/* Type label */}
			{media.type !== "image" && (
				<div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
					{t(mediaTypeLabelKeys[media.type])}
				</div>
			)}
		</button>
	);
}

// ============================================
// Hook: media preview
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
