"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { Bell, LogOut, Menu, Search, Settings } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Header() {
	const router = useRouter();
	const { user } = useAuthStore();
	const { logout } = useAuth();
	const { toggleMobile } = useSidebarStore();
	const [showMenu, setShowMenu] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (searchQuery.trim()) {
			router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
		}
	};

	const handleLogout = async () => {
		await logout();
		router.push("/login");
	};

	const displayName =
		user?.display_name || user?.email?.split("@")[0] || "用户";
	const initials = displayName.charAt(0).toUpperCase();
	const avatarSrc = user?.avatar_url ?? null;

	return (
		<header className="sticky top-0 z-20 flex h-16 items-center gap-4 px-4 md:px-6 glass border-b border-neutral-100/50">
			<div className="flex flex-1 items-center gap-3 min-w-0">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="md:hidden"
					aria-label="打开导航菜单"
					onClick={() => toggleMobile()}
				>
					<Menu className="h-5 w-5" />
				</Button>

				{/* Search */}
				<form
					onSubmit={handleSearch}
					className="relative w-full min-w-0 md:max-w-md"
				>
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
					<Input
						type="search"
						aria-label="全局搜索关键词"
						placeholder="搜索资讯、法规、关键词..."
						className="pl-10 pr-10"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
					<Button
						type="submit"
						variant="ghost"
						size="icon"
						className="absolute right-1 top-1/2 -translate-y-1/2"
						aria-label="执行全局搜索"
						disabled={!searchQuery.trim()}
					>
						<Search className="h-4 w-4" />
					</Button>
				</form>
			</div>

			{/* Right Actions */}
			<div className="flex items-center gap-2 md:gap-4">
				{/* Notifications */}
				<Button
					variant="ghost"
					size="icon"
					className="relative"
					aria-label="通知设置"
					onClick={() => router.push("/settings?tab=notifications")}
				>
					<Bell className="h-5 w-5" />
				</Button>

				{/* User Menu */}
				<div className="relative">
					<Button
						variant="ghost"
						className="gap-2"
						onClick={() => setShowMenu(!showMenu)}
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white">
							{avatarSrc ? (
								<Image
									src={avatarSrc}
									alt={displayName}
									width={32}
									height={32}
									sizes="32px"
									className="h-8 w-8 rounded-full object-cover"
									priority
								/>
							) : (
								<span className="text-sm font-medium">{initials}</span>
							)}
						</div>
						<span className="hidden sm:inline text-sm font-medium text-neutral-700">
							{displayName}
						</span>
					</Button>

					{showMenu && (
						<div className="absolute right-0 top-full mt-2 w-48 rounded-xl glass-card py-1.5 shadow-lg">
							<button
								type="button"
								className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50/80 transition-colors"
								onClick={() => {
									setShowMenu(false);
									router.push("/settings");
								}}
							>
								<Settings className="h-4 w-4" />
								设置
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
								onClick={() => {
									setShowMenu(false);
									handleLogout();
								}}
							>
								<LogOut className="h-4 w-4" />
								退出登录
							</button>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
