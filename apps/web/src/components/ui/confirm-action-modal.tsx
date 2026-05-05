"use client";

import { Button } from "@/components/ui/button";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ConfirmActionModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	description?: string;
	confirmLabel: string;
	cancelLabel: string;
	confirmVariant?: "default" | "destructive" | "outline";
	busy?: boolean;
	extraContent?: React.ReactNode;
}

export function ConfirmActionModal({
	isOpen,
	onClose,
	onConfirm,
	title,
	description,
	confirmLabel,
	cancelLabel,
	confirmVariant = "destructive",
	busy = false,
	extraContent,
}: ConfirmActionModalProps) {
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	return (
		<Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} size="sm">
			<ModalHeader className="pr-14">
				<h2 className="text-lg font-semibold" style={headingStyle}>
					{title}
				</h2>
			</ModalHeader>
			<ModalBody>
				{description ? (
					<p className="text-sm leading-6" style={mutedTextStyle}>
						{description}
					</p>
				) : null}
				{extraContent ? <div className="mt-3">{extraContent}</div> : null}
			</ModalBody>
			<ModalFooter className="justify-end">
				<Button
					type="button"
					variant="outline"
					onClick={onClose}
					disabled={busy}
				>
					{cancelLabel}
				</Button>
				<Button
					type="button"
					variant={confirmVariant}
					onClick={onConfirm}
					disabled={busy}
					className={cn(
						confirmVariant === "outline"
							? "[border-color:var(--color-border)]"
							: "",
					)}
				>
					{busy ? (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					) : null}
					{confirmLabel}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
