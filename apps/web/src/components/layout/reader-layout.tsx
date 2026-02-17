"use client";

import { useSidebarStore } from "@/stores/sidebar-store";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect } from "react";
import { Sidebar } from "./sidebar";

interface ReaderLayoutProps {
	children: React.ReactNode;
}

export function ReaderLayout({ children }: ReaderLayoutProps) {
	const { readerMode, hovered, setReaderMode, setHovered } = useSidebarStore();
	const reducedMotion = useReducedMotion() ?? false;

	useEffect(() => {
		setReaderMode(true);
		return () => {
			setReaderMode(false);
			setHovered(false);
		};
	}, [setReaderMode, setHovered]);

	const handleTriggerEnter = useCallback(() => {
		if (readerMode) setHovered(true);
	}, [readerMode, setHovered]);

	const handleSidebarLeave = useCallback(() => {
		if (readerMode) setHovered(false);
	}, [readerMode, setHovered]);

	const showSidebar = !readerMode || hovered;

	return (
		<div className="min-h-screen bg-neutral-50">
			{/* Left trigger area */}
			<div
				className="fixed left-0 top-0 z-40 h-full w-4 cursor-pointer"
				onMouseEnter={handleTriggerEnter}
				aria-hidden="true"
			/>

			{/* Sidebar */}
			<AnimatePresence initial={!reducedMotion}>
				{showSidebar && (
					<motion.div
						initial={reducedMotion ? false : { x: -280, opacity: 0 }}
						animate={{ x: 0, opacity: 1 }}
						exit={reducedMotion ? undefined : { x: -280, opacity: 0 }}
						transition={
							reducedMotion
								? { duration: 0 }
								: { type: "spring", damping: 25, stiffness: 200 }
						}
						onMouseLeave={handleSidebarLeave}
						className="fixed left-0 top-0 z-50"
					>
						<Sidebar />
					</motion.div>
				)}
			</AnimatePresence>

			{/* Backdrop overlay */}
			<AnimatePresence initial={!reducedMotion}>
				{readerMode && hovered && (
					<motion.div
						initial={reducedMotion ? false : { opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={reducedMotion ? undefined : { opacity: 0 }}
						transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
						className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
						onClick={() => setHovered(false)}
					/>
				)}
			</AnimatePresence>

			{/* Main content */}
			<main className="min-h-screen transition-all duration-300">
				{children}
			</main>
		</div>
	);
}
