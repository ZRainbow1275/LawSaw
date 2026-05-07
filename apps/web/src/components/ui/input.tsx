import { cn } from "@/lib/utils";
import * as React from "react";

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					"flex h-10 w-full rounded-lg border-2 border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 transition-all dark:border-white/10 dark:bg-white/5 dark:text-neutral-100 dark:placeholder:text-neutral-500",
					"focus:border-primary-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(255,107,53,0.1)] focus:scale-[1.02] focus:outline-none dark:focus:border-primary-400 dark:focus:bg-white/10",
					"hover:border-primary-200 dark:hover:border-primary-400/40",
					"disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };
