"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { FeedbackPagePrototype } from "@/components/feedback/prototype/feedback-page";
import { UserShell } from "@/components/layout/user-shell";

export default function FeedbackPage() {
	return (
		<ProtectedRoute>
			<UserShell widthVariant="default">
				<FeedbackPagePrototype />
			</UserShell>
		</ProtectedRoute>
	);
}
