"use client";

/**
 * SearchOverlay — Ctrl+K global search overlay (PR1).
 *
 * Visual structure mirrors `prototype/app.html` `.search-overlay` + `.search-panel`:
 *   - Backdrop: rgba(0,0,0,0.5) + 4px blur, click outside to dismiss
 *   - Panel: centered, 640px wide, max-height 500px
 *   - Header: search icon + autoFocus input + ESC chip
 *   - Results: live results from `useSearch`, click navigates to article
 *
 * Wires to real `/api/v1/search` via `useSearch` — no mock data.
 */

import { useSearch } from "@/hooks/use-search";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { FileText, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface SearchOverlayProps {
	open: boolean;
	onClose: () => void;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
	const t = useT();
	const router = useRouter();
	const locale = useLocale();
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	const panelRef = useRef<HTMLDialogElement | null>(null);

	const { data, isFetching } = useSearch(query, 8, 0);
	const results = data?.results ?? [];

	// Focus input on open
	useEffect(() => {
		if (!open) {
			setQuery("");
			return;
		}
		const id = window.setTimeout(() => inputRef.current?.focus(), 50);
		return () => window.clearTimeout(id);
	}, [open]);

	// ESC closes overlay
	useEffect(() => {
		if (!open) return;
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open, onClose]);

	const handleNavigateToArticle = (id: string) => {
		router.push(withLocalePath(locale, `/articles/${id}`));
		onClose();
	};

	const handleViewAll = () => {
		const trimmed = query.trim();
		if (trimmed) {
			router.push(
				withLocalePath(locale, `/search?q=${encodeURIComponent(trimmed)}`),
			);
		}
		onClose();
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (query.trim()) handleViewAll();
	};

	if (!open) return null;

	return (
		<>
			{/* Backdrop — clicking dismisses; keyboard ESC handled in window listener */}
			<div
				className="fixed inset-0 z-[490] backdrop-blur-sm"
				style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
				onClick={onClose}
				onKeyDown={(event) => {
					if (event.key === "Escape") onClose();
				}}
				role="button"
				tabIndex={-1}
				aria-label={t("Open search")}
			/>
			<dialog
				open
				ref={panelRef}
				aria-modal="true"
				aria-label={t("Open search")}
				className="fixed left-1/2 top-20 z-[500] m-0 w-full max-w-[640px] -translate-x-1/2 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-popup-deep animate-popup-in"
				style={{ maxHeight: "500px" }}
			>
				<form
					onSubmit={handleSubmit}
					className="flex items-center gap-3 border-b px-5 py-4"
					style={{ borderColor: "var(--color-neutral-100)" }}
				>
					<Search
						aria-hidden="true"
						className="h-5 w-5 shrink-0"
						style={{ color: "var(--color-neutral-400)" }}
					/>
					<input
						ref={inputRef}
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder={t("Search news, regulations, keywords...")}
						className="flex-1 border-0 bg-transparent text-base outline-none placeholder:text-neutral-400"
						style={{ color: "var(--field-foreground)" }}
						aria-label={t("Open search")}
					/>
					{isFetching ? (
						<Loader2
							aria-hidden="true"
							className="h-4 w-4 shrink-0 animate-spin"
							style={{ color: "var(--color-neutral-400)" }}
						/>
					) : null}
					<span
						className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
						style={{
							backgroundColor: "var(--color-neutral-100)",
							color: "var(--color-neutral-500)",
						}}
					>
						ESC
					</span>
				</form>

				<div className="max-h-[400px] overflow-y-auto p-2">
					{query.trim().length <= 2 ? (
						<div
							className="px-5 py-8 text-center text-sm"
							style={{ color: "var(--color-neutral-400)" }}
						>
							{t("Type to start searching...")}
						</div>
					) : results.length === 0 && !isFetching ? (
						<div
							className="px-5 py-8 text-center text-sm"
							style={{ color: "var(--color-neutral-400)" }}
						>
							{t("No matching results")}
						</div>
					) : (
						<ul className="space-y-1">
							{results.map((result) => (
								<li key={result.article_id}>
									<button
										type="button"
										onClick={() => handleNavigateToArticle(result.article_id)}
										className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-neutral-50"
									>
										<span
											className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
											style={{
												backgroundColor: "var(--surface-accent-icon-bg)",
												color: "var(--color-primary-500)",
											}}
										>
											<FileText aria-hidden="true" className="h-4 w-4" />
										</span>
										<div className="min-w-0 flex-1">
											<div
												className="truncate text-sm font-semibold"
												style={{ color: "var(--field-foreground)" }}
											>
												{result.title}
											</div>
											{result.excerpt ? (
												<div
													className="truncate text-xs"
													style={{ color: "var(--color-neutral-500)" }}
												>
													{result.excerpt}
												</div>
											) : null}
										</div>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</dialog>
		</>
	);
}
