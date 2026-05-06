"use client";

import { UserShell } from "@/components/layout/user-shell";
import MeSettingsPage from "@/components/me/me-settings-page";

export default function MeSettingsRoute() {
	return (
		<UserShell widthVariant="default">
			<MeSettingsPage />
		</UserShell>
	);
}
