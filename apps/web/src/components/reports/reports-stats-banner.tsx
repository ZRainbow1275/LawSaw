"use client";

/**
 * ReportsStatsBanner — 4-up KpiCard 状态总览。
 *
 * 直接命中 `/api/v1/reports?status=...&limit=1` 取每种状态的 total，
 * 不引入新端点。banner 渲染在 ReportsPageContent (prototype) 之前，
 * prototype 组件本身保持不动。
 */

import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useReports } from "@/hooks/use-reports";
import { useT } from "@/lib/i18n-client";
import {
	CheckCircle2,
	ClipboardList,
	FileEdit,
	GitPullRequestArrow,
} from "lucide-react";

export function ReportsStatsBanner() {
	const t = useT();

	const draftQuery = useReports({ limit: 1, status: "draft" });
	const reviewQuery = useReports({ limit: 1, status: "review" });
	const approvedQuery = useReports({ limit: 1, status: "approved" });
	const publishedQuery = useReports({ limit: 1, status: "published" });

	return (
		<section
			aria-label={t("Reports")}
			className="mb-6"
			data-testid="reports-stats-banner"
		>
			<KpiCardGrid columns={4}>
				<KpiCard
					tone="info"
					label={t("Draft")}
					value={draftQuery.data?.total ?? 0}
					icon={FileEdit}
				/>
				<KpiCard
					tone="warning"
					label={t("In review")}
					value={reviewQuery.data?.total ?? 0}
					icon={GitPullRequestArrow}
				/>
				<KpiCard
					tone="success"
					label={t("Approved")}
					value={approvedQuery.data?.total ?? 0}
					icon={CheckCircle2}
				/>
				<KpiCard
					tone="info"
					label={t("Published")}
					value={publishedQuery.data?.total ?? 0}
					icon={ClipboardList}
				/>
			</KpiCardGrid>
		</section>
	);
}
