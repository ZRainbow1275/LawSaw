"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { CategoryOverview } from "@/components/dashboard/category-overview";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSourceStats } from "@/hooks/use-sources";
import { apiClient } from "@/lib/api";
import {
	assertAiAvailabilityResponse,
	assertArticleStats,
	assertHealthResponse,
} from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	Database,
	Server,
	Zap,
} from "lucide-react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.1, delayChildren: 0.1 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 20 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function Dashboard() {
	const t = useT();

	const healthQuery = useQuery({
		queryKey: ["health"],
		queryFn: () => apiClient.get("/health", assertHealthResponse),
		refetchInterval: 30_000,
	});

	const statsQuery = useQuery({
		queryKey: ["articleStats"],
		queryFn: () => apiClient.get("/api/v1/articles/stats", assertArticleStats),
		refetchInterval: 30_000,
	});

	const sourceStatsQuery = useSourceStats();

	const aiAvailabilityQuery = useQuery({
		queryKey: ["aiAvailability"],
		queryFn: () =>
			apiClient.get("/api/v1/ai/available", assertAiAvailabilityResponse),
		refetchInterval: 30_000,
	});

	type ServiceStatus = "ok" | "warn" | "error" | "loading";

	function statusFromQuery(query: {
		isPending: boolean;
		isError: boolean;
	}): ServiceStatus {
		if (query.isPending) return "loading";
		if (query.isError) return "error";
		return "ok";
	}

	const apiStatus = statusFromQuery(healthQuery);
	const dbStatus = statusFromQuery(statsQuery);
	const sourcesStatus = statusFromQuery(sourceStatsQuery);

	const aiStatus: ServiceStatus = aiAvailabilityQuery.isPending
		? "loading"
		: aiAvailabilityQuery.isError
			? "error"
			: aiAvailabilityQuery.data?.available
				? "ok"
				: "warn";

	const overallStatus: ServiceStatus =
		apiStatus === "error" ||
		dbStatus === "error" ||
		sourcesStatus === "error" ||
		aiStatus === "error"
			? "error"
			: apiStatus === "loading" ||
					dbStatus === "loading" ||
					sourcesStatus === "loading" ||
					aiStatus === "loading"
				? "loading"
				: aiStatus === "warn"
					? "warn"
					: "ok";

	const systemServices: Array<{
		name: string;
		desc: string;
		icon: typeof Server;
		status: ServiceStatus;
	}> = [
		{
			name: t("API service"),
			desc:
				apiStatus === "ok"
					? t("Online (v{version})", {
							version: healthQuery.data?.version ?? "-",
						})
					: apiStatus === "loading"
						? t("Checking")
						: t("Error"),
			icon: Server,
			status: apiStatus,
		},
		{
			name: t("Ingestion service"),
			desc:
				sourcesStatus === "ok"
					? t("{count} sources available", {
							count: sourceStatsQuery.data?.total ?? 0,
						})
					: sourcesStatus === "loading"
						? t("Checking")
						: t("Error"),
			icon: Activity,
			status: sourcesStatus,
		},
		{
			name: t("AI service"),
			desc:
				aiStatus === "ok"
					? t("Enabled")
					: aiStatus === "warn"
						? t("Not configured (set AI API key)")
						: aiStatus === "loading"
							? t("Checking")
							: t("Error"),
			icon: Zap,
			status: aiStatus,
		},
		{
			name: t("Database"),
			desc:
				dbStatus === "ok"
					? t("Available (articles/stats OK)")
					: dbStatus === "loading"
						? t("Checking")
						: t("Error"),
			icon: Database,
			status: dbStatus,
		},
	];

	const overallBadge =
		overallStatus === "ok"
			? { label: t("All good"), className: "bg-green-100 text-green-700" }
			: overallStatus === "warn"
				? {
						label: t("Partially configured"),
						className: "bg-amber-100 text-amber-800",
					}
				: overallStatus === "loading"
					? {
							label: t("Checking"),
							className: "bg-neutral-100 text-neutral-700",
						}
					: { label: t("Degraded"), className: "bg-red-100 text-red-700" };

	const overallHeaderClass =
		overallStatus === "ok"
			? "from-green-50/80 to-emerald-50/50 border-green-100/50"
			: overallStatus === "warn"
				? "from-amber-50/80 to-orange-50/50 border-amber-100/50"
				: overallStatus === "loading"
					? "from-neutral-50/80 to-neutral-50/50 border-neutral-100/50"
					: "from-red-50/80 to-rose-50/50 border-red-100/50";

	const serviceCardClass = (status: ServiceStatus) => {
		if (status === "ok")
			return "from-green-50 to-emerald-50/50 border-green-100/50";
		if (status === "warn")
			return "from-amber-50 to-orange-50/50 border-amber-100/50";
		if (status === "error")
			return "from-red-50 to-rose-50/50 border-red-100/50";
		return "from-neutral-50 to-neutral-50/50 border-neutral-100/50";
	};

	const dotClass = (status: ServiceStatus) => {
		if (status === "ok") return "bg-green-500";
		if (status === "warn") return "bg-amber-500";
		if (status === "error") return "bg-red-500";
		return "bg-neutral-400";
	};

	const iconColor = (status: ServiceStatus) => {
		if (status === "ok") return "text-green-500";
		if (status === "warn") return "text-amber-600";
		if (status === "error") return "text-red-500";
		return "text-neutral-500";
	};

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-gradient-to-br from-neutral-50 via-white to-primary-50/20">
				<Sidebar />

				<MainContent>
					<Header />

					<motion.div
						className="p-6"
						variants={containerVariants}
						initial="hidden"
						animate="visible"
					>
						{/* Page Title */}
						<motion.div className="mb-8 relative" variants={itemVariants}>
							<div className="absolute -left-3 top-0 h-full w-1 rounded-full bg-gradient-to-b from-primary-500 to-primary-300" />
							<h1 className="text-2xl font-bold text-neutral-900">
								{t("Dashboard")}
							</h1>
							<p className="mt-1 text-sm text-neutral-500">
								{t("Monitor legal updates and system health in real time")}
							</p>
						</motion.div>

						{/* Stats Grid */}
						<motion.div variants={itemVariants}>
							<StatsCards />
						</motion.div>

						<motion.div
							className="grid grid-cols-1 gap-6 lg:grid-cols-3"
							variants={itemVariants}
						>
							{/* Categories Overview */}
							<CategoryOverview />

							{/* Recent Articles */}
							<RecentArticles />
						</motion.div>

						{/* System Status */}
						<motion.div variants={itemVariants}>
							<Card className="mt-6 overflow-hidden">
								<CardHeader
									className={`bg-gradient-to-r border-b ${overallHeaderClass}`}
								>
									<CardTitle className="flex items-center gap-2">
										{overallStatus === "error" ? (
											<AlertTriangle
												aria-hidden="true"
												className="h-5 w-5 text-red-500"
											/>
										) : (
											<motion.div
												animate={{ scale: [1, 1.1, 1] }}
												transition={{
													duration: 2,
													repeat: Number.POSITIVE_INFINITY,
												}}
											>
												<CheckCircle2
													aria-hidden="true"
													className="h-5 w-5 text-green-500"
												/>
											</motion.div>
										)}
										{t("System status")}
										<span
											className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${overallBadge.className}`}
										>
											{overallBadge.label}
										</span>
									</CardTitle>
								</CardHeader>
								<CardContent className="p-6">
									<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
										{systemServices.map((service, index) => (
											<motion.div
												key={service.name}
												className={`group relative overflow-hidden rounded-xl bg-gradient-to-br p-4 border ${serviceCardClass(service.status)}`}
												initial={{ opacity: 0, scale: 0.9 }}
												animate={{ opacity: 1, scale: 1 }}
												transition={{ delay: 0.5 + index * 0.1 }}
												whileHover={{ scale: 1.02, y: -2 }}
											>
												{/* Background */}
												<div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-green-200/30 blur-xl transition-all group-hover:scale-150" />

												<div className="relative flex items-center gap-3">
													<motion.div
														className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm border border-green-100"
														whileHover={{ rotate: 10 }}
													>
														<service.icon
															className={`h-5 w-5 ${iconColor(service.status)}`}
														/>
													</motion.div>
													<div>
														<div className="flex items-center gap-2">
															<motion.div
																className={`h-2 w-2 rounded-full ${dotClass(service.status)}`}
																animate={{
																	scale: [1, 1.3, 1],
																	opacity: [1, 0.7, 1],
																}}
																transition={{
																	duration: 1.5,
																	repeat: Number.POSITIVE_INFINITY,
																}}
															/>
															<span className="text-sm font-medium text-green-700">
																{service.name}
															</span>
														</div>
														<p className="mt-0.5 text-xs text-neutral-600">
															{service.desc}
														</p>
													</div>
												</div>
											</motion.div>
										))}
									</div>
								</CardContent>
							</Card>
						</motion.div>
					</motion.div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}
