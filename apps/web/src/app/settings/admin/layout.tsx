import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { fetchSession, isAdminTier } from "@/lib/auth/server";

export default async function AdminLayout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await fetchSession();
	if (!session) {
		redirect("/login");
	}
	if (!isAdminTier(session.roleTier)) {
		redirect("/me/feed");
	}
	return <>{children}</>;
}
