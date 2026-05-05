"use client";

/**
 * Invite-user modal — placeholder.
 *
 * The user-invite endpoint is not yet exposed by the backend, so the modal
 * collects the form data but renders the submit action as disabled and
 * surfaces an explanatory notice. Once the backend ships an invite route,
 * the form payload can be passed through `useInviteUser` without changes
 * to the calling site.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { type RoleTier, roleTierLabelKey } from "@/lib/authz";
import { useT } from "@/lib/i18n-client";
import { Info, Send, UserPlus } from "lucide-react";
import { useState } from "react";

const TIER_OPTIONS: readonly RoleTier[] = [
	"basic_user",
	"verified_user",
	"premium_user",
];

interface InviteUserModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function InviteUserModal({ isOpen, onClose }: InviteUserModalProps) {
	const t = useT();
	const [email, setEmail] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [tier, setTier] = useState<RoleTier>("basic_user");

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="md">
			<ModalHeader>
				<div className="flex items-center gap-3">
					<UserPlus
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<div>
						<h2 className="text-lg font-semibold" style={headingStyle}>
							{t("Invite user")}
						</h2>
						<p className="text-sm" style={mutedStyle}>
							{t(
								"Pre-stage an invitation that will be sent once the backend invite endpoint ships.",
							)}
						</p>
					</div>
				</div>
			</ModalHeader>

			<ModalBody className="space-y-4">
				<section
					className="flex items-start gap-3 rounded-2xl border p-4"
					style={surfaceStyle}
					data-testid="invite-user-notice"
				>
					<Info
						aria-hidden="true"
						className="mt-0.5 h-4 w-4"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<div>
						<p className="text-sm font-medium" style={headingStyle}>
							{t("Invitation delivery is pending backend support")}
						</p>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{t(
								"You can compose the invite, but the submit button stays disabled until the corresponding API route is exposed.",
							)}
						</p>
					</div>
				</section>

				<div className="space-y-2">
					<label
						htmlFor="invite-email"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Email")}
					</label>
					<Input
						id="invite-email"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="user@example.com"
					/>
				</div>

				<div className="space-y-2">
					<label
						htmlFor="invite-name"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Display name")}
					</label>
					<Input
						id="invite-name"
						value={displayName}
						onChange={(event) => setDisplayName(event.target.value)}
						placeholder={t("Optional")}
					/>
				</div>

				<div className="space-y-2">
					<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
						{t("Initial tier")}
					</p>
					<div className="flex flex-wrap gap-2">
						{TIER_OPTIONS.map((option) => {
							const active = tier === option;
							return (
								<button
									key={option}
									type="button"
									onClick={() => setTier(option)}
									className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
									style={
										active
											? {
													backgroundColor: "var(--surface-accent-strong)",
													borderColor: "var(--color-primary-500)",
													color: "var(--color-foreground)",
												}
											: {
													backgroundColor: "var(--field-surface)",
													borderColor: "var(--field-border)",
													color: "var(--surface-muted-text)",
												}
									}
									aria-pressed={active}
								>
									{t(roleTierLabelKey(option))}
								</button>
							);
						})}
					</div>
				</div>

				<section
					className="rounded-2xl border p-3"
					style={surfaceStyle}
					data-testid="invite-user-summary"
				>
					<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
						{t("Summary")}
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<Badge variant="outline">{email || t("No email")}</Badge>
						{displayName ? (
							<Badge variant="outline">{displayName}</Badge>
						) : null}
						<Badge variant="secondary">{t(roleTierLabelKey(tier))}</Badge>
					</div>
				</section>
			</ModalBody>

			<ModalFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t("Cancel")}
				</Button>
				<Button type="button" disabled>
					<Send aria-hidden="true" className="h-4 w-4" />
					{t("Send invite")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
