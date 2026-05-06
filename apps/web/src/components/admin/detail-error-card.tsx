"use client";

import { ApiClientError } from "@/lib/api";
import { useT } from "@/lib/i18n-client";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Localized "load failed" card shared by admin detail pages.
 *
 * Surfaces a translated title + body (no raw English backend message) and a
 * single small `request_id` line for support copy-paste. Distinguishes 404
 * not-found from generic server errors so users see the right wording.
 */

type ResourceKind =
	| "user"
	| "source"
	| "feedback"
	| "entity"
	| "reportTemplate";

const RESOURCE_LABEL_KEY: Record<ResourceKind, string> = {
	user: "User",
	source: "Source",
	feedback: "Feedback",
	entity: "Entity",
	reportTemplate: "Report template",
};

interface AdminDetailErrorCardProps {
	resource: ResourceKind;
	error: unknown;
	onRetry: () => void;
}

export function AdminDetailErrorCard({
	resource,
	error,
	onRetry,
}: AdminDetailErrorCardProps) {
	const t = useT();

	const apiError = error instanceof ApiClientError ? error : null;
	const isNotFound = apiError?.status === 404;

	const resourceLabel = t(RESOURCE_LABEL_KEY[resource]);
	const title = t("Failed to load");
	const description = isNotFound
		? t("{resource} detail not found.", { resource: resourceLabel })
		: t("Failed to load. Please try again later.");
	const requestId = apiError?.requestId ?? null;

	return (
		<Card>
			<CardContent className="py-8">
				<EmptyState
					variant="error"
					title={title}
					description={description}
					action={{ label: t("Retry"), onClick: onRetry }}
				/>
				{requestId ? (
					<p
						className="mt-3 text-center font-mono text-xs"
						style={{ color: "var(--surface-muted-text)" }}
					>
						request_id: {requestId}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
