"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSidebarStore } from "@/stores/sidebar-store";
import { Sidebar } from "./sidebar";

interface ReaderLayoutProps {
  children: React.ReactNode;
}

export function ReaderLayout({ children }: ReaderLayoutProps) {
  const { readerMode, hovered, setReaderMode, setHovered } = useSidebarStore();

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
      {/* 左侧透明触发带 */}
      <div
        className="fixed left-0 top-0 z-40 h-full w-4 cursor-pointer"
        onMouseEnter={handleTriggerEnter}
        aria-hidden="true"
      />

      {/* 侧边栏 */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            onMouseLeave={handleSidebarLeave}
            className="fixed left-0 top-0 z-50"
          >
            <Sidebar />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 背景遮罩 */}
      <AnimatePresence>
        {readerMode && hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setHovered(false)}
          />
        )}
      </AnimatePresence>

      {/* 主内容区 */}
      <main className="min-h-screen transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
