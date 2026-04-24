"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
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
import { useAuthStore } from "@/stores/auth-store";
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

const dashboardPageShellStyle = {
	backgroundColor: "var(--color-background)",
	backgroundImage: "none",
} as const;

const dashboardPageAccentLineStyle = {
	backgroundImage: "var(--surface-hero-primary-gradient)",
} as const;

const dashboardPageHeadingTextStyle = {
	color: "var(--field-foreground)",
} as const;

const dashboardPageMutedTextStyle = {
	color: "var(--surface-muted-text)",
} as const;

export function DashboardPageContent() {
	const t = useT();
	const permissions = useAuthStore((state) => state.permissions);
	const canReadSources =
		permissions.includes("sources:read") || permissions.includes("*");

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

	const sourceStatsQuery = useSourceStats({ enabled: canReadSources });

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
	const sourcesStatus: ServiceStatus = canReadSources
		? statusFromQuery(sourceStatsQuery)
		: "warn";

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
					: !canReadSources
						? t("Restricted")
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
			? {
					label: t("All good"),
					style: {
						backgroundColor:
							"color-mix(in srgb, var(--color-success) 14%, var(--surface-muted-bg) 86%)",
						color: "var(--color-success)",
					},
				}
			: overallStatus === "warn"
				? {
						label: t("Partially configured"),
						style: {
							backgroundColor:
								"color-mix(in srgb, var(--color-warning) 16%, var(--surface-muted-bg) 84%)",
							color: "var(--color-warning)",
						},
					}
				: overallStatus === "loading"
					? {
							label: t("Checking"),
							style: {
								backgroundColor: "var(--control-hover-bg)",
								color: "var(--surface-muted-text)",
							},
						}
					: {
							label: t("Degraded"),
							style: {
								backgroundColor:
									"color-mix(in srgb, var(--color-error) 14%, var(--surface-muted-bg) 86%)",
								color: "var(--color-error)",
							},
						};

	const overallHeaderStyle =
		overallStatus === "ok"
			? {
					backgroundImage: "var(--surface-hero-emerald-gradient)",
					borderColor:
						"color-mix(in srgb, var(--color-success) 24%, transparent)",
				}
			: overallStatus === "warn"
				? {
						backgroundImage: "var(--surface-hero-amber-gradient)",
						borderColor:
							"color-mix(in srgb, var(--color-warning) 24%, transparent)",
					}
				: overallStatus === "loading"
					? {
							backgroundImage: "var(--surface-hero-primary-gradient)",
							borderColor: "var(--surface-muted-border)",
						}
					: {
							backgroundImage:
								"linear-gradient(90deg, color-mix(in srgb, var(--color-error) 12%, transparent), color-mix(in srgb, var(--color-error) 8%, white 92%))",
							borderColor:
								"color-mix(in srgb, var(--color-error) 24%, transparent)",
						};

	const serviceCardStyle = (status: ServiceStatus) => {
		if (status === "ok") {
			return {
				backgroundImage: "var(--surface-hero-emerald-gradient)",
				borderColor:
					"color-mix(in srgb, var(--color-success) 22%, transparent)",
			};
		}
		if (status === "warn") {
			return {
				backgroundImage: "var(--surface-hero-amber-gradient)",
				borderColor:
					"color-mix(in srgb, var(--color-warning) 24%, transparent)",
			};
		}
		if (status === "error") {
			return {
				backgroundImage:
					"linear-gradient(135deg, color-mix(in srgb, white 98%, transparent) 0%, color-mix(in srgb, var(--color-error-light) 92%, white 8%) 52%, color-mix(in srgb, var(--color-error-light) 88%, var(--surface-muted-bg) 12%) 100%)",
				borderColor:
					"color-mix(in srgb, var(--color-error) 22%, transparent)",
			};
		}
		return {
			backgroundImage: "var(--surface-hero-primary-gradient)",
			borderColor: "var(--surface-muted-border)",
		};
	};

	const serviceGlowStyle = (status: ServiceStatus) => {
		if (status === "ok") {
			return {
				backgroundColor:
					"color-mix(in srgb, var(--color-success) 16%, transparent)",
			};
		}
		if (status === "warn") {
			return {
				backgroundColor:
					"color-mix(in srgb, var(--color-warning) 16%, transparent)",
			};
		}
		if (status === "error") {
			return {
				backgroundColor:
					"color-mix(in srgb, var(--color-error) 16%, transparent)",
			};
		}
		return {
			backgroundColor:
				"color-mix(in srgb, var(--surface-muted-text) 12%, transparent)",
		};
	};

	const serviceIconShellStyle = (status: ServiceStatus) => ({
		backgroundColor: "var(--surface-accent-icon-bg)",
		borderColor:
			status === "ok"
				? "color-mix(in srgb, var(--color-success) 24%, transparent)"
				: status === "warn"
					? "color-mix(in srgb, var(--color-warning) 24%, transparent)"
					: status === "error"
						? "color-mix(in srgb, var(--color-error) 24%, transparent)"
						: "var(--surface-muted-border)",
	});

	const serviceAccentStyle = (status: ServiceStatus) => ({
		color:
			status === "ok"
				? "var(--color-success)"
				: status === "warn"
					? "var(--color-warning)"
					: status === "error"
						? "var(--color-error)"
						: "var(--surface-muted-text)",
	});

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen" style={dashboardPageShellStyle}>
				<Sidebar />

				<MainContent>
					<Header />

					<motion.div
						className="p-6"
						variants={containerVariants}
						initial="hidden"
						animate="visible"
					>
						<motion.div className="relative mb-8" variants={itemVariants}>
							<div
								className="absolute -left-3 top-0 h-full w-1 rounded-full"
								style={dashboardPageAccentLineStyle}
							/>
							<h1
								className="text-2xl font-bold"
								style={dashboardPageHeadingTextStyle}
							>
								{t("Dashboard")}
							</h1>
							<p className="mt-1 text-sm" style={dashboardPageMutedTextStyle}>
								{t("Monitor legal updates and system health in real time")}
							</p>
						</motion.div>

						<motion.div variants={itemVariants}>
							<DashboardHero />
						</motion.div>

						<motion.div variants={itemVariants}>
							<StatsCards />
						</motion.div>

						<motion.div variants={itemVariants}>
							<RecentArticles />
						</motion.div>

						<motion.div variants={itemVariants}>
							<Card className="mt-6 overflow-hidden">
								<CardHeader className="border-b" style={overallHeaderStyle}>
									<CardTitle className="flex items-center gap-2">
										{overallStatus === "error" ? (
											<AlertTriangle
												aria-hidden="true"
												className="h-5 w-5"
												style={{ color: "var(--color-error)" }}
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
													className="h-5 w-5"
													style={{ color: "var(--color-success)" }}
												/>
											</motion.div>
										)}
										{t("System status")}
										<span
											className="ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
											style={overallBadge.style}
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
											className="group relative overflow-hidden rounded-xl border p-4"
											style={serviceCardStyle(service.status)}
												initial={{ opacity: 0, scale: 0.9 }}
												animate={{ opacity: 1, scale: 1 }}
												transition={{ delay: 0.5 + index * 0.1 }}
												whileHover={{ scale: 1.02, y: -2 }}
											>
											<div
												className="absolute -right-4 -top-4 h-16 w-16 rounded-full blur-xl transition-all group-hover:scale-150"
												style={serviceGlowStyle(service.status)}
											/>

												<div className="relative flex items-center gap-3">
												<motion.div
													className="flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm"
													style={serviceIconShellStyle(service.status)}
													whileHover={{ rotate: 10 }}
												>
													<service.icon
														className="h-5 w-5"
														style={serviceAccentStyle(service.status)}
													/>
												</motion.div>
													<div>
														<div className="flex items-center gap-2">
														<motion.div
															className="h-2 w-2 rounded-full"
															style={{
																backgroundColor:
																	serviceAccentStyle(service.status).color,
															}}
																animate={{
																	scale: [1, 1.3, 1],
																	opacity: [1, 0.7, 1],
																}}
																transition={{
																	duration: 1.5,
																	repeat: Number.POSITIVE_INFINITY,
																}}
															/>
														<span
															className="text-sm font-medium"
															style={serviceAccentStyle(service.status)}
														>
																{service.name}
															</span>
														</div>
												<p
													className="mt-0.5 text-xs"
													style={dashboardPageMutedTextStyle}
												>
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
