import { Skeleton } from "@/components/ui/skeleton";

const NAV_KEYS = [
	"nav-0",
	"nav-1",
	"nav-2",
	"nav-3",
	"nav-4",
	"nav-5",
	"nav-6",
	"nav-7",
] as const;

const STAT_KEYS = ["stat-0", "stat-1", "stat-2", "stat-3"] as const;

const CARD_KEYS = ["card-0", "card-1", "card-2"] as const;

export default function Loading() {
	return (
		<div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
			{/* Sidebar skeleton */}
			<div className="hidden w-64 border-r border-neutral-200 bg-white lg:block dark:border-white/10 dark:bg-neutral-900">
				<div className="space-y-4 p-4">
					<div className="flex items-center gap-3 border-b border-neutral-100 pb-4 dark:border-white/10">
						<Skeleton variant="circular" width={40} height={40} />
						<Skeleton variant="text" width={100} height={24} />
					</div>
					<div className="space-y-2">
						{NAV_KEYS.map((key) => (
							<div key={key} className="flex items-center gap-3 px-3 py-2">
								<Skeleton variant="rectangular" width={20} height={20} />
								<Skeleton variant="text" width={80} height={18} />
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Main content skeleton */}
			<div className="flex flex-1 flex-col">
				{/* Header skeleton */}
				<div className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6 dark:border-white/10 dark:bg-neutral-900">
					<Skeleton variant="text" width={120} height={24} />
					<div className="flex items-center gap-3">
						<Skeleton variant="circular" width={32} height={32} />
						<Skeleton variant="circular" width={32} height={32} />
					</div>
				</div>

				{/* Content skeleton */}
				<div className="space-y-6 p-6">
					<div className="space-y-2">
						<Skeleton variant="text" width={200} height={32} />
						<Skeleton variant="text" width={300} height={20} />
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{STAT_KEYS.map((key) => (
							<div
								key={key}
								className="rounded-xl border border-neutral-100 bg-white p-6 dark:border-white/10 dark:bg-neutral-900"
							>
								<div className="flex items-center justify-between">
									<div className="space-y-2">
										<Skeleton variant="text" width={80} height={16} />
										<Skeleton variant="text" width={120} height={32} />
									</div>
									<Skeleton variant="circular" width={48} height={48} />
								</div>
							</div>
						))}
					</div>

					<div className="space-y-4">
						{CARD_KEYS.map((key) => (
							<div
								key={key}
								className="rounded-xl border border-neutral-100 bg-white p-4 space-y-3 dark:border-white/10 dark:bg-neutral-900"
							>
								<div className="flex gap-2">
									<Skeleton variant="rectangular" width={60} height={24} />
									<Skeleton variant="rectangular" width={48} height={24} />
								</div>
								<Skeleton variant="text" width="100%" height={24} />
								<Skeleton variant="text" width="85%" height={20} />
								<div className="flex gap-4 pt-2">
									<Skeleton variant="text" width={80} height={16} />
									<Skeleton variant="text" width={60} height={16} />
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
