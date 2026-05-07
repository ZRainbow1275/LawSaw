import { ReactionInsightsPage } from "@/components/admin/insights/reactions/reaction-insights-page";

/**
 * Server-side admin guard is provided by `[locale]/admin/layout.tsx`
 * (super_admin / tenant_admin tier check). The page itself is a thin
 * wrapper around the client dashboard.
 */
export default function AdminReactionInsightsRoute() {
	return <ReactionInsightsPage />;
}
