"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { CreateReportDialog } from "@/components/reports/create-report-dialog";
import { ReportDetail } from "@/components/reports/report-detail";
import { ReportExportDialog } from "@/components/reports/report-export-dialog";
import { ReportList } from "@/components/reports/report-list";
import type { Report } from "@/lib/api/types";
import { hasPermission } from "@/lib/authz";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { AnimatePresence, motion } from "framer-motion";
import { ClipboardList } from "lucide-react";
import { useCallback, useState } from "react";

type ViewMode = "list" | "detail";

export default function ReportsPage() {
	const t = useT();
	const permissions = useAuthStore((state) => state.permissions);
	const canManageReports = hasPermission(permissions, "reports:write");
	const canExportReports = hasPermission(permissions, "reports:export");
	const [viewMode, setViewMode] = useState<ViewMode>("list");
	const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [exportDialogReport, setExportDialogReport] = useState<Report | null>(
		null,
	);

	const handleReportClick = useCallback((report: Report) => {
		setSelectedReportId(report.id);
		setViewMode("detail");
	}, []);

	const handleBack = useCallback(() => {
		setViewMode("list");
		setSelectedReportId(null);
	}, []);

	const handleCreateSuccess = useCallback(() => {
		setCreateDialogOpen(false);
	}, []);

	const handleExportClick = useCallback((report: Report) => {
		setExportDialogReport(report);
	}, []);

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-100 to-primary-200">
									<ClipboardList
										aria-hidden="true"
										className="h-5 w-5 text-primary-600"
									/>
								</div>
								<div>
									<h1 className="text-2xl font-bold text-neutral-900">
										{t("Reports")}
									</h1>
									<p className="text-sm text-neutral-500">
										{t(
											"Create, manage, and export periodic legal analysis reports",
										)}
									</p>
								</div>
							</div>
						</div>

						{/* Content Area */}
						<AnimatePresence mode="wait">
							{viewMode === "list" ? (
								<motion.div
									key="list"
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -20 }}
									transition={{ duration: 0.2 }}
								>
									<ReportList
										canManageReports={canManageReports}
										canExportReports={canExportReports}
										onCreateClick={() => setCreateDialogOpen(true)}
										onReportClick={handleReportClick}
										onExportClick={handleExportClick}
									/>
								</motion.div>
							) : (
								<motion.div
									key="detail"
									initial={{ opacity: 0, x: 20 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: 20 }}
									transition={{ duration: 0.2 }}
								>
									{selectedReportId && (
										<ReportDetail
											reportId={selectedReportId}
											onBack={handleBack}
											onExportClick={handleExportClick}
										/>
									)}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</MainContent>
			</div>

			{/* Dialogs */}
			<CreateReportDialog
				isOpen={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onSuccess={handleCreateSuccess}
			/>
			<ReportExportDialog
				isOpen={!!exportDialogReport}
				onClose={() => setExportDialogReport(null)}
				report={exportDialogReport}
			/>
		</ProtectedRoute>
	);
}
