"use client";

import { apiClient } from "@/lib/api";
import {
	type ChangePasswordResponse,
	type LoginActivityResponse,
	type MfaTotpSetupResponse,
	type MfaTotpStatusResponse,
	assertChangePasswordResponse,
	assertLoginActivityResponse,
	assertMfaTotpSetupResponse,
	assertMfaTotpStatusResponse,
} from "@/lib/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Login activity
// ---------------------------------------------------------------------------

export function useLoginActivity() {
	return useQuery({
		queryKey: ["loginActivity"],
		queryFn: () =>
			apiClient.get<LoginActivityResponse>(
				"/api/v1/users/me/login-activity",
				assertLoginActivityResponse,
			),
	});
}

// ---------------------------------------------------------------------------
// MFA TOTP — setup / confirm / disable
// ---------------------------------------------------------------------------

export function useMfaTotpSetup() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			apiClient.post<MfaTotpSetupResponse>(
				"/api/v1/auth/mfa/totp/setup",
				{},
				assertMfaTotpSetupResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["loginActivity"] });
		},
	});
}

export function useMfaTotpConfirm() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (code: string) =>
			apiClient.post<MfaTotpStatusResponse>(
				"/api/v1/auth/mfa/totp/confirm",
				{ code },
				assertMfaTotpStatusResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["loginActivity"] });
		},
	});
}

export function useMfaTotpDisable() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			apiClient.post<MfaTotpStatusResponse>(
				"/api/v1/auth/mfa/totp/disable",
				{},
				assertMfaTotpStatusResponse,
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["loginActivity"] });
		},
	});
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

export function useChangePassword() {
	return useMutation({
		mutationFn: (input: { current_password: string; new_password: string }) =>
			apiClient.post<ChangePasswordResponse>(
				"/api/v1/users/me/change-password",
				input,
				assertChangePasswordResponse,
			),
	});
}
