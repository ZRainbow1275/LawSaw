"use client";

/**
 * Source create modal.
 *
 * Drives `useCreateSource`. The form mirrors `POST /api/v1/sources`:
 *   - rss   → name + url
 *   - spider → name + url + structured selector config (list/title/link
 *              required, content/date/delay optional)
 *
 * The backend does not yet expose a PATCH route, so the modal only handles
 * creation. Edit affordances on the listing page reuse this same form once
 * an update endpoint ships.
 */

import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateSource } from "@/hooks/use-sources";
import { ApiClientError } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { Globe, Loader2, Rss, Save } from "lucide-react";
import { useEffect, useState } from "react";

const SOURCE_TYPES: ReadonlyArray<{
	value: "rss" | "spider";
	labelKey: string;
}> = [
	{ value: "rss", labelKey: "RSS feed" },
	{ value: "spider", labelKey: "Web crawler" },
];

interface SpiderConfig {
	list_selector: string;
	title_selector: string;
	link_selector: string;
	content_selector: string;
	date_selector: string;
	delay_ms: string;
}

const EMPTY_SPIDER: SpiderConfig = {
	list_selector: "",
	title_selector: "",
	link_selector: "",
	content_selector: "",
	date_selector: "",
	delay_ms: "",
};

interface SourceFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreated?: () => void;
}

export function SourceFormModal({
	isOpen,
	onClose,
	onCreated,
}: SourceFormModalProps) {
	const t = useT();
	const { success, error } = useToast();
	const createSource = useCreateSource();

	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [schedule, setSchedule] = useState("");
	const [sourceType, setSourceType] = useState<"rss" | "spider">("rss");
	const [spider, setSpider] = useState<SpiderConfig>(EMPTY_SPIDER);

	useEffect(() => {
		if (!isOpen) {
			setName("");
			setUrl("");
			setSchedule("");
			setSourceType("rss");
			setSpider(EMPTY_SPIDER);
		}
	}, [isOpen]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
		backgroundColor: "var(--color-background)",
		color: "var(--color-foreground)",
	} as const;

	const trimmedName = name.trim();
	const trimmedUrl = url.trim();

	const validation = (() => {
		if (!trimmedName) return t("Source name is required.");
		if (!trimmedUrl) return t("Source URL is required.");
		try {
			new URL(trimmedUrl);
		} catch {
			return t("Source URL must be a valid http(s) URL.");
		}
		if (sourceType === "spider") {
			if (!spider.list_selector.trim() || !spider.title_selector.trim() || !spider.link_selector.trim()) {
				return t("Crawler requires list/title/link selectors.");
			}
		}
		if (spider.delay_ms.trim()) {
			const parsed = Number(spider.delay_ms);
			if (!Number.isFinite(parsed) || parsed < 0) {
				return t("delay_ms must be a non-negative number");
			}
		}
		return null;
	})();

	const handleSave = () => {
		if (validation) {
			error(t("Validation failed"), validation);
			return;
		}
		const config: Record<string, unknown> = {};
		if (sourceType === "spider") {
			config.list_selector = spider.list_selector.trim();
			config.title_selector = spider.title_selector.trim();
			config.link_selector = spider.link_selector.trim();
			if (spider.content_selector.trim()) {
				config.content_selector = spider.content_selector.trim();
			}
			if (spider.date_selector.trim()) {
				config.date_selector = spider.date_selector.trim();
			}
			if (spider.delay_ms.trim()) {
				config.delay_ms = Number(spider.delay_ms);
			}
		}
		createSource.mutate(
			{
				name: trimmedName,
				url: trimmedUrl,
				source_type: sourceType,
				schedule: schedule.trim() || undefined,
				config,
			},
			{
				onSuccess: () => {
					success(
						t("Source created"),
						t("The new source is now available in the source list."),
					);
					onCreated?.();
					onClose();
				},
				onError: (cause) => {
					error(
						t("Create failed"),
						cause instanceof ApiClientError
							? cause.message
							: cause instanceof Error
								? cause.message
								: t("Unknown error"),
					);
				},
			},
		);
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="lg">
			<ModalHeader>
				<div className="flex items-center gap-3">
					{sourceType === "rss" ? (
						<Rss
							aria-hidden="true"
							className="h-5 w-5"
							style={{ color: "var(--color-primary-500)" }}
						/>
					) : (
						<Globe
							aria-hidden="true"
							className="h-5 w-5"
							style={{ color: "var(--color-primary-500)" }}
						/>
					)}
					<div>
						<h2 className="text-lg font-semibold" style={headingStyle}>
							{t("New source")}
						</h2>
						<p className="text-sm" style={mutedStyle}>
							{t(
								"Configure a feed (RSS) or web crawler. URL must be reachable from the worker.",
							)}
						</p>
					</div>
				</div>
			</ModalHeader>

			<ModalBody className="space-y-4">
				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor="source-form-name"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Name")}
						</label>
						<Input
							id="source-form-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder={t("e.g., Example News")}
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="source-form-type"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Type")}
						</label>
						<select
							id="source-form-type"
							value={sourceType}
							onChange={(event) =>
								setSourceType(event.target.value as "rss" | "spider")
							}
							className="h-10 w-full rounded-lg border px-3 text-sm"
							style={fieldStyle}
						>
							{SOURCE_TYPES.map((option) => (
								<option key={option.value} value={option.value}>
									{t(option.labelKey)}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="source-form-url"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						URL
					</label>
					<Input
						id="source-form-url"
						value={url}
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://example.com/feed.xml"
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="source-form-schedule"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Schedule")}
					</label>
					<Input
						id="source-form-schedule"
						value={schedule}
						onChange={(event) => setSchedule(event.target.value)}
						placeholder={t("Cron expression, e.g., 0 */15 * * * *")}
					/>
					<p className="text-xs" style={mutedStyle}>
						{t(
							"Leave empty to use the worker default schedule. Cron format follows the worker convention.",
						)}
					</p>
				</div>

				{sourceType === "spider" ? (
					<section
						className="rounded-2xl border p-4"
						style={{
							backgroundColor: "var(--surface-muted-bg)",
							borderColor: "var(--surface-muted-border)",
						}}
					>
						<header>
							<h3 className="text-sm font-semibold" style={headingStyle}>
								{t("Crawler config")}
							</h3>
							<p className="mt-1 text-xs" style={mutedStyle}>
								{t(
									"Required: list/title/link selectors. Optional: content/date selectors and delay (ms).",
								)}
							</p>
						</header>
						<div className="mt-3 grid gap-3 md:grid-cols-3">
							<div className="space-y-1">
								<label
									htmlFor="spider-list"
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									list_selector
								</label>
								<Input
									id="spider-list"
									value={spider.list_selector}
									onChange={(event) =>
										setSpider((prev) => ({
											...prev,
											list_selector: event.target.value,
										}))
									}
									placeholder=".article-list a"
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="spider-title"
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									title_selector
								</label>
								<Input
									id="spider-title"
									value={spider.title_selector}
									onChange={(event) =>
										setSpider((prev) => ({
											...prev,
											title_selector: event.target.value,
										}))
									}
									placeholder=".title"
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="spider-link"
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									link_selector
								</label>
								<Input
									id="spider-link"
									value={spider.link_selector}
									onChange={(event) =>
										setSpider((prev) => ({
											...prev,
											link_selector: event.target.value,
										}))
									}
									placeholder="a"
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="spider-content"
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									content_selector
								</label>
								<Input
									id="spider-content"
									value={spider.content_selector}
									onChange={(event) =>
										setSpider((prev) => ({
											...prev,
											content_selector: event.target.value,
										}))
									}
									placeholder="article"
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="spider-date"
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									date_selector
								</label>
								<Input
									id="spider-date"
									value={spider.date_selector}
									onChange={(event) =>
										setSpider((prev) => ({
											...prev,
											date_selector: event.target.value,
										}))
									}
									placeholder="time"
								/>
							</div>
							<div className="space-y-1">
								<label
									htmlFor="spider-delay"
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									delay_ms
								</label>
								<Input
									id="spider-delay"
									type="number"
									min={0}
									value={spider.delay_ms}
									onChange={(event) =>
										setSpider((prev) => ({
											...prev,
											delay_ms: event.target.value,
										}))
									}
									placeholder="500"
								/>
							</div>
						</div>
					</section>
				) : null}

				{validation ? (
					<p className="text-xs text-error">{validation}</p>
				) : null}
			</ModalBody>

			<ModalFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t("Cancel")}
				</Button>
				<Button
					type="button"
					onClick={handleSave}
					disabled={createSource.isPending || Boolean(validation)}
				>
					{createSource.isPending ? (
						<Loader2
							aria-hidden="true"
							className="h-4 w-4 animate-spin"
						/>
					) : (
						<Save aria-hidden="true" className="h-4 w-4" />
					)}
					{t("Create source")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
