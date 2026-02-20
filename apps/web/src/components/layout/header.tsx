"use client";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { readIndexedDbJson, writeIndexedDbJson } from "@/lib/indexeddb-kv";
import { useAuthStore } from "@/stores/auth-store";
import { useSidebarStore } from "@/stores/sidebar-store";
import { Bell, Globe, LogOut, Menu, Search, Settings } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SEARCH_HISTORY_KEY = "header.search.history";
const MAX_SEARCH_HISTORY_ITEMS = 10;

export function Header() {
	const router = useRouter();
	const locale = useLocale();
	const t = useT();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const { user } = useAuthStore();
	const { logout } = useAuth();
	const { toggleMobile } = useSidebarStore();
	const [showMenu, setShowMenu] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [recentSearches, setRecentSearches] = useState<string[]>([]);
	const menuButtonRef = useRef<HTMLButtonElement | null>(null);
	const menuPanelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let mounted = true;

		const loadHistory = async () => {
			try {
				const history = await readIndexedDbJson<string[]>(SEARCH_HISTORY_KEY);
				if (!mounted || !Array.isArray(history)) return;
				setRecentSearches(
					history
						.filter((item): item is string => typeof item === "string")
						.slice(0, MAX_SEARCH_HISTORY_ITEMS),
				);
			} catch (error) {
				console.warn("failed to load search history from IndexedDB", error);
			}
		};

		void loadHistory();

		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (!showMenu) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setShowMenu(false);
			menuButtonRef.current?.focus();
		};

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (menuPanelRef.current?.contains(target)) return;
			if (menuButtonRef.current?.contains(target)) return;
			setShowMenu(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("pointerdown", handlePointerDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [showMenu]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (searchQuery.trim()) {
			const query = searchQuery.trim();
			router.push(
				withLocalePath(locale, `/search?q=${encodeURIComponent(query)}`),
			);

			setRecentSearches((prev) => {
				const next = [query, ...prev.filter((item) => item !== query)].slice(
					0,
					MAX_SEARCH_HISTORY_ITEMS,
				);
				void writeIndexedDbJson(SEARCH_HISTORY_KEY, next).catch((error) => {
					console.warn("failed to persist search history to IndexedDB", error);
				});
				return next;
			});
		}
	};

	const handleLogout = async () => {
		await logout();
		router.push(withLocalePath(locale, "/login"));
	};

	const displayName =
		user?.display_name || user?.email?.split("@")[0] || t("User");
	const initials = displayName.charAt(0).toUpperCase();
	const avatarSrc = user?.avatar_url ?? null;

	const handleToggleLocale = () => {
		const nextLocale = locale === "zh" ? "en" : "zh";
		const query = searchParams.toString();
		const withoutLocale = stripLocalePrefix(pathname || "/");
		const target = withLocalePath(
			nextLocale,
			query ? `${withoutLocale}?${query}` : withoutLocale,
		);
		router.push(target);
	};

	return (
		<header className="sticky top-0 z-20 glass border-b border-neutral-100/50">
			<div className="flex h-16 items-center gap-4 px-4 md:px-6">
				<div className="flex flex-1 items-center gap-3 min-w-0">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="md:hidden"
						aria-label={t("Open navigation")}
						onClick={() => toggleMobile()}
					>
						<Menu aria-hidden="true" className="h-5 w-5" />
					</Button>

					{/* Search */}
					<form
						onSubmit={handleSearch}
						className="relative w-full min-w-0 md:max-w-md"
					>
						<Search
							aria-hidden="true"
							className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
						/>
						<Input
							type="search"
							aria-label={t("Global search keywords")}
							placeholder={t("Search news, regulations, keywords...")}
							className="pl-10 pr-10"
							list="global-search-history"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						<datalist id="global-search-history">
							{recentSearches.map((item) => (
								<option key={item} value={item} />
							))}
						</datalist>
						<Button
							type="submit"
							variant="ghost"
							size="icon"
							className="absolute right-1 top-1/2 -translate-y-1/2"
							aria-label={t("Run search")}
							disabled={!searchQuery.trim()}
						>
							<Search aria-hidden="true" className="h-4 w-4" />
						</Button>
					</form>
				</div>

				{/* Right Actions */}
				<div className="flex items-center gap-2 md:gap-4">
					{/* Locale */}
					<Button
						variant="ghost"
						size="icon"
						className="relative"
						aria-label={t("Switch language")}
						onClick={handleToggleLocale}
					>
						<Globe aria-hidden="true" className="h-5 w-5" />
					</Button>

					{/* Notifications */}
					<Button
						variant="ghost"
						size="icon"
						className="relative"
						aria-label={t("Notifications")}
						onClick={() =>
							router.push(withLocalePath(locale, "/settings?tab=notifications"))
						}
					>
						<Bell aria-hidden="true" className="h-5 w-5" />
					</Button>

					{/* User Menu */}
					<div className="relative">
						<Button
							variant="ghost"
							className="gap-2"
							ref={menuButtonRef}
							onClick={() => setShowMenu(!showMenu)}
							aria-haspopup="menu"
							aria-expanded={showMenu}
							aria-controls="header-user-menu"
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
							<div
								id="header-user-menu"
								ref={menuPanelRef}
								role="menu"
								aria-label={t("User menu")}
								className="absolute right-0 top-full mt-2 w-48 rounded-xl glass-card py-1.5 shadow-lg"
							>
								<button
									type="button"
									role="menuitem"
									className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50/80 transition-colors"
									onClick={() => {
										setShowMenu(false);
										router.push(withLocalePath(locale, "/settings"));
										menuButtonRef.current?.focus();
									}}
								>
									<Settings aria-hidden="true" className="h-4 w-4" />
									{t("Settings")}
								</button>
								<button
									type="button"
									role="menuitem"
									className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
									onClick={() => {
										setShowMenu(false);
										handleLogout();
										menuButtonRef.current?.focus();
									}}
								>
									<LogOut aria-hidden="true" className="h-4 w-4" />
									{t("Sign out")}
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
			<div className="border-t border-neutral-100/50 px-4 py-2 md:px-6">
				<Breadcrumbs pathname={pathname || "/"} />
			</div>
		</header>
	);
}
