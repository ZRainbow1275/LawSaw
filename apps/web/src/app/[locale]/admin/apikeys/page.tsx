"use client";

import { apiClient } from "@/lib/api";
import {
	assertApiKeyListResponse,
	assertCreateApiKeyResponse,
	assertDeleteResponse,
} from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { ApiKeysTab, uiMessageFromError } from "../../../settings/tabs";

function parseCsv(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function AdminApiKeysContent() {
	const t = useT();
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const [apiKeyName, setApiKeyName] = useState("");
	const [apiKeyPermissions, setApiKeyPermissions] = useState("");
	const [apiKeyRateLimit, setApiKeyRateLimit] = useState("");
	const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

	const apiKeysQuery = useQuery({
		queryKey: ["apikeys"],
		enabled: isAdmin,
		queryFn: () => apiClient.get("/api/v1/apikeys", assertApiKeyListResponse),
	});

	const createApiKeyMutation = useMutation({
		mutationFn: async () => {
			const name = apiKeyName.trim();
			if (!name) throw new Error(t("Please enter a key name"));
			const permissions = parseCsv(apiKeyPermissions);
			const rateLimitRaw = apiKeyRateLimit.trim();
			let rateLimit: number | undefined;
			if (rateLimitRaw) {
				const parsed = Number(rateLimitRaw);
				if (!Number.isFinite(parsed) || parsed <= 0)
					throw new Error(t("rate_limit must be a positive number"));
				rateLimit = parsed;
			}
			return apiClient.post(
				"/api/v1/apikeys",
				{
					name,
					permissions: permissions.length > 0 ? permissions : undefined,
					rate_limit: rateLimit,
				},
				assertCreateApiKeyResponse,
			);
		},
		onSuccess: (res) => {
			setCreatedRawKey(res.raw_key);
			setApiKeyName("");
			setApiKeyPermissions("");
			setApiKeyRateLimit("");
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
			toastSuccess(t("API key created"));
		},
		onError: (err) =>
			toastError(t("Create failed"), uiMessageFromError(err, t)),
	});

	const revokeApiKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.post(
				`/api/v1/apikeys/${id}/revoke`,
				undefined,
				assertDeleteResponse,
			),
		onSuccess: () => {
			toastSuccess(t("API key revoked"));
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) =>
			toastError(t("Update failed"), uiMessageFromError(err, t)),
	});

	const deleteApiKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.delete(`/api/v1/apikeys/${id}`, assertDeleteResponse),
		onSuccess: () => {
			toastSuccess(t("API key deleted"));
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) =>
			toastError(t("Delete failed"), uiMessageFromError(err, t)),
	});

	const handleCopyRawKey = async (value: string) => {
		await navigator.clipboard.writeText(value);
		toastSuccess(t("Copied to clipboard"));
	};

	return (
		<div className="space-y-6">
			<div className="rounded-3xl border p-6" style={surfaceStyle}>
				<div className="flex items-center gap-2 text-3xl font-bold tracking-tight" style={headingStyle}>
					<KeyRound
						aria-hidden="true"
						className="h-7 w-7"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<span>{t("API keys")}</span>
				</div>
				<p className="mt-2 text-sm" style={mutedTextStyle}>
					{t("Manage API keys and secret issuance.")}
				</p>
			</div>
			{!isAdmin ? null : (
				<ApiKeysTab
					t={t}
					createdRawKey={createdRawKey}
					onCopyRawKey={handleCopyRawKey}
					onClearRawKey={() => setCreatedRawKey(null)}
					apiKeyName={apiKeyName}
					setApiKeyName={setApiKeyName}
					apiKeyPermissions={apiKeyPermissions}
					setApiKeyPermissions={setApiKeyPermissions}
					apiKeyRateLimit={apiKeyRateLimit}
					setApiKeyRateLimit={setApiKeyRateLimit}
					createPending={createApiKeyMutation.isPending}
					onCreate={async () => {
						await createApiKeyMutation.mutateAsync();
					}}
					isLoading={apiKeysQuery.isLoading}
					isError={apiKeysQuery.isError}
					isFetching={apiKeysQuery.isFetching}
					error={apiKeysQuery.error}
					keys={apiKeysQuery.data?.keys ?? []}
					revokePending={revokeApiKeyMutation.isPending}
					deletePending={deleteApiKeyMutation.isPending}
					onRefetch={() => apiKeysQuery.refetch()}
					onRevoke={async (id: string) => {
						await revokeApiKeyMutation.mutateAsync(id);
					}}
					onDelete={async (id: string) => {
						await deleteApiKeyMutation.mutateAsync(id);
					}}
				/>
			)}
		</div>
	);
}

export default function AdminApiKeysPage() {
	return <AdminApiKeysContent />;
}
