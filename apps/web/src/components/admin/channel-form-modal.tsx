"use client";

/**
 * Channel create/edit modal.
 *
 * Drives `useCreateChannel` / `useUpdateChannel`. The form mirrors the schema
 * accepted by `POST/PATCH /api/v1/admin/channels` — `slug` is read-only when
 * editing because the slug is the public-facing key for category linkage and
 * permalink stability.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { useCategories } from "@/hooks/use-categories";
import {
	type ChannelRecord,
	type CreateChannelInput,
	type UpdateChannelInput,
	useCreateChannel,
	useUpdateChannel,
} from "@/hooks/use-channels";
import { ApiClientError } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { Layers3, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const CHANNEL_VISIBILITY_OPTIONS: ReadonlyArray<{
	value: ChannelRecord["visibility"];
	labelKey: string;
}> = [
	{ value: "public", labelKey: "Public" },
	{ value: "restricted", labelKey: "Restricted" },
	{ value: "verified", labelKey: "Verified" },
	{ value: "premium", labelKey: "Premium" },
];

const CHANNEL_SLUG_RE = /^[a-z][a-z0-9-]{2,31}$/;

interface ChannelFormModalProps {
	isOpen: boolean;
	mode: "create" | "edit";
	channel: ChannelRecord | null;
	onClose: () => void;
	onSaved?: (channel: ChannelRecord) => void;
}

interface FormState {
	slug: string;
	name: string;
	description: string;
	linked_category_id: string;
	visibility: ChannelRecord["visibility"];
	is_active: boolean;
}

const EMPTY_FORM: FormState = {
	slug: "",
	name: "",
	description: "",
	linked_category_id: "",
	visibility: "restricted",
	is_active: true,
};

export function ChannelFormModal({
	isOpen,
	mode,
	channel,
	onClose,
	onSaved,
}: ChannelFormModalProps) {
	const t = useT();
	const { success, error } = useToast();
	const categoriesQuery = useCategories();
	const createChannel = useCreateChannel();
	const updateChannel = useUpdateChannel();

	const [form, setForm] = useState<FormState>(EMPTY_FORM);

	useEffect(() => {
		if (!isOpen) return;
		if (mode === "edit" && channel) {
			setForm({
				slug: channel.slug,
				name: channel.name,
				description: channel.description ?? "",
				linked_category_id: channel.linked_category_id ?? "",
				visibility: channel.visibility,
				is_active: channel.is_active,
			});
		} else {
			setForm(EMPTY_FORM);
		}
	}, [channel, isOpen, mode]);

	const trimmedSlug = form.slug.trim();
	const trimmedName = form.name.trim();
	const slugValid = CHANNEL_SLUG_RE.test(trimmedSlug);

	const validation = useMemo(() => {
		if (!trimmedName) return t("Channel name is required.");
		if (mode === "create") {
			if (!trimmedSlug) return t("Channel slug is required.");
			if (!slugValid) {
				return t(
					"Invalid channel slug: start with a lowercase letter, length 3-32, only a-z0-9- allowed.",
				);
			}
		}
		return null;
	}, [mode, slugValid, t, trimmedName, trimmedSlug]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
		backgroundColor: "var(--color-background)",
		color: "var(--color-foreground)",
	} as const;

	const saving = createChannel.isPending || updateChannel.isPending;

	const handleSave = () => {
		if (validation) {
			error(t("Validation failed"), validation);
			return;
		}
		if (mode === "create") {
			const payload: CreateChannelInput = {
				slug: trimmedSlug,
				name: trimmedName,
				description: form.description.trim() || undefined,
				linked_category_id: form.linked_category_id || null,
				visibility: form.visibility,
				is_active: form.is_active,
			};
			createChannel.mutate(payload, {
				onSuccess: (created) => {
					success(
						t("Channel created"),
						t("The new channel is now available in the channel list."),
					);
					onSaved?.(created);
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
			});
			return;
		}
		if (!channel) return;
		const payload: UpdateChannelInput = {
			id: channel.id,
			name: trimmedName,
			description: form.description.trim() || undefined,
			visibility: form.visibility,
			is_active: form.is_active,
		};
		const trimmedLinked = form.linked_category_id || null;
		if ((channel.linked_category_id ?? null) !== trimmedLinked) {
			if (trimmedLinked === null) {
				payload.clear_linked_category = true;
			} else {
				payload.linked_category_id = trimmedLinked;
			}
		}
		updateChannel.mutate(payload, {
			onSuccess: (updated) => {
				success(
					t("Saved successfully"),
					t("The channel is now reflected in the live channel list."),
				);
				onSaved?.(updated);
				onClose();
			},
			onError: (cause) => {
				error(
					t("Save failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="md">
			<ModalHeader>
				<div className="flex items-center gap-3">
					<Layers3
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<div>
						<h2 className="text-lg font-semibold" style={headingStyle}>
							{mode === "create" ? t("Create channel") : t("Edit channel")}
						</h2>
						<p className="text-sm" style={mutedStyle}>
							{mode === "create"
								? t(
										"Slug must be a stable lowercase identifier — it cannot be changed after creation.",
									)
								: t(
										"Slug is read-only because content links and permalinks depend on it.",
									)}
						</p>
					</div>
				</div>
			</ModalHeader>

			<ModalBody className="space-y-4">
				<div className="space-y-1">
					<label
						htmlFor="channel-form-slug"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Slug")}
					</label>
					<Input
						id="channel-form-slug"
						value={form.slug}
						onChange={(event) =>
							setForm((prev) => ({ ...prev, slug: event.target.value }))
						}
						placeholder={t("e.g. industry-news")}
						disabled={mode === "edit"}
						maxLength={32}
						aria-invalid={trimmedSlug.length > 0 && !slugValid}
					/>
					<p className="text-xs" style={mutedStyle}>
						{t(
							"Channel slug rules: start with a lowercase letter, length 3-32, only a-z0-9- allowed.",
						)}
					</p>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="channel-form-name"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Name")}
					</label>
					<Input
						id="channel-form-name"
						value={form.name}
						onChange={(event) =>
							setForm((prev) => ({ ...prev, name: event.target.value }))
						}
						placeholder={t("Display name")}
					/>
				</div>

				<div className="space-y-1">
					<label
						htmlFor="channel-form-desc"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Description")}
					</label>
					<Input
						id="channel-form-desc"
						value={form.description}
						onChange={(event) =>
							setForm((prev) => ({
								...prev,
								description: event.target.value,
							}))
						}
						placeholder={t("Optional summary shown in tenant feed picker")}
					/>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor="channel-form-visibility"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Visibility")}
						</label>
						<select
							id="channel-form-visibility"
							value={form.visibility}
							onChange={(event) =>
								setForm((prev) => ({
									...prev,
									visibility: event.target.value as ChannelRecord["visibility"],
								}))
							}
							className="h-10 w-full rounded-lg border px-3 text-sm"
							style={fieldStyle}
						>
							{CHANNEL_VISIBILITY_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{t(option.labelKey)}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="channel-form-category"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Linked category")}
						</label>
						<select
							id="channel-form-category"
							value={form.linked_category_id}
							onChange={(event) =>
								setForm((prev) => ({
									...prev,
									linked_category_id: event.target.value,
								}))
							}
							className="h-10 w-full rounded-lg border px-3 text-sm"
							style={fieldStyle}
						>
							<option value="">{t("No linked category")}</option>
							{(categoriesQuery.data ?? []).map((category) => (
								<option key={category.id} value={category.id}>
									{category.name}
								</option>
							))}
						</select>
					</div>
				</div>

				<label className="flex items-center gap-2 text-sm" style={mutedStyle}>
					<input
						type="checkbox"
						checked={form.is_active}
						onChange={(event) =>
							setForm((prev) => ({
								...prev,
								is_active: event.target.checked,
							}))
						}
					/>
					{t("Active")}
				</label>

				{validation ? <p className="text-xs text-error">{validation}</p> : null}
			</ModalBody>

			<ModalFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t("Cancel")}
				</Button>
				<Button
					type="button"
					onClick={handleSave}
					disabled={saving || Boolean(validation)}
				>
					{saving ? (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					) : (
						<Save aria-hidden="true" className="h-4 w-4" />
					)}
					{mode === "create" ? t("Create channel") : t("Save changes")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
