"use client";

import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/stores/sidebar-store";

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  const { collapsed } = useSidebarStore();

  return (
    <main
      className={cn(
        "flex-1 transition-all duration-300",
        collapsed ? "ml-16" : "ml-[280px]",
        className
      )}
    >
      {children}
    </main>
  );
}
