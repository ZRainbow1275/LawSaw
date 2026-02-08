# Frontend API Integration Implementation Plan

> **维护状态（2026-02-08）**
> - 本文档属于 2025-01 的历史规划归档，主要用于追溯早期决策背景。
> - 当前系统交付状态请以 `prompt/audit-report.md`（v2.6 修复清单）与 `prompts/audit/2.6audit.md`（审计基线）为准。
> - 研发规范请参考 `.trellis/spec/`（`backend/`、`frontend/`、`guides/`）。
> - 若本文内容与现行代码冲突，请以代码与上述“真相源”文档为准。


> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the Next.js frontend to the Rust backend API, replacing all mock data with real API calls

**Architecture:** Create a typed API client layer using fetch + TanStack Query for data fetching, Zustand for auth state, and proper error handling. Follow the existing project structure under `apps/web/src/`.

**Tech Stack:** Next.js 15, React 19, TypeScript, TanStack Query v5, Zustand v5, fetch API

---

## Current State Analysis

| Component | Status | Gap |
|-----------|--------|-----|
| UI Components | ✅ Complete | None |
| API Client | ❌ Missing | Need typed fetch wrapper |
| Auth State | ❌ Missing | Need login/logout flow |
| Data Fetching | ❌ Mock data | Need TanStack Query hooks |
| Pages | ⚠️ Partial | Need real data integration |

## Backend API Endpoints (26 total)

| Module | Endpoints |
|--------|-----------|
| Articles | GET /, GET /{id}, POST /{id}/publish |
| Sources | GET /, POST /, GET /{id}, POST /{id}/fetch |
| Categories | GET / |
| Auth | POST /register, POST /login, POST /logout, GET /me |
| Users | GET /, GET /{id}, PATCH /{id}, PATCH /{id}/roles |
| Search | GET /, POST /semantic, POST /ask |
| AI | POST /process, POST /classify, POST /summarize, POST /risk, GET /status |
| API Keys | GET /, POST /, DELETE /{id}, POST /{id}/revoke |

---

## Task 1: Create API Client Foundation

**Files:**
- Create: `apps/web/src/lib/api/client.ts`
- Create: `apps/web/src/lib/api/types.ts`
- Create: `apps/web/src/lib/api/index.ts`

**Step 1: Create TypeScript types for API responses**

Create `apps/web/src/lib/api/types.ts`:

```typescript
// Base types matching Rust backend models

export interface Article {
  id: string;
  source_id: string;
  category_id: string | null;
  title: string;
  link: string;
  content: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  risk_score: number | null;
  importance: number | null;
  sentiment: "positive" | "negative" | "neutral" | "mixed" | null;
  ai_metadata: Record<string, unknown>;
  status: "pending" | "processing" | "published" | "archived" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  source_type: "rss" | "spider" | "api";
  config: Record<string, unknown>;
  schedule: string | null;
  priority: number;
  is_active: boolean;
  last_fetch: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  icon: string | null;
  color: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user: User | null;
}

export interface ArticleListResponse {
  data: Article[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResult {
  article_id: string;
  title: string;
  excerpt: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
}

export interface AskResponse {
  answer: string;
  sources: Array<{
    article_id: string;
    title: string;
    excerpt: string;
    relevance: number;
  }>;
  confidence: number;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: Record<string, unknown>;
  rate_limit: number;
  is_active: boolean;
  last_used: string | null;
  created_at: string;
}

export interface ApiError {
  error: string;
  status: number;
}
```

**Step 2: Create the API client**

Create `apps/web/src/lib/api/client.ts`:

```typescript
import type { ApiError } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      credentials: "include", // Include cookies for session auth
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error: ApiError = {
        error: await response.text().catch(() => "Unknown error"),
        status: response.status,
      };
      throw error;
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
```

**Step 3: Create index export**

Create `apps/web/src/lib/api/index.ts`:

```typescript
export * from "./client";
export * from "./types";
```

**Step 4: Create environment file**

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Step 5: Verify TypeScript compilation**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/lib/api apps/web/.env.local
git commit -m "feat(web): add typed API client foundation

- Add TypeScript types matching Rust backend models
- Create fetch-based API client with error handling
- Support session-based authentication via cookies

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Create TanStack Query Provider

**Files:**
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/components/providers/query-provider.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Create Query Client configuration**

Create `apps/web/src/lib/query-client.ts`:

```typescript
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
```

**Step 2: Create Query Provider component**

Create `apps/web/src/components/providers/query-provider.tsx`:

```typescript
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "@/lib/query-client";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

**Step 3: Add react-query-devtools dependency**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm add @tanstack/react-query-devtools`

**Step 4: Update layout.tsx to include provider**

Modify `apps/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { QueryProvider } from "@/components/providers/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "法眼 | Law Eye",
  description: "数字时代法律赛道的\"参考消息\" - 聚合多渠道法律资讯，构建权威信息仓库",
  keywords: ["法律", "法规", "资讯", "合规", "监管", "法眼", "Law Eye"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

**Step 5: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/lib/query-client.ts apps/web/src/components/providers apps/web/src/app/layout.tsx apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(web): add TanStack Query provider

- Configure QueryClient with sensible defaults
- Add ReactQueryDevtools for development
- Wrap app in QueryClientProvider

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Create Auth Store with Zustand

**Files:**
- Create: `apps/web/src/stores/auth-store.ts`
- Create: `apps/web/src/hooks/use-auth.ts`

**Step 1: Create auth store**

Create `apps/web/src/stores/auth-store.ts`:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/api/types";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        }),
    }),
    {
      name: "law-eye-auth",
      partialize: (state) => ({ user: state.user }),
    }
  )
);
```

**Step 2: Create auth hook with API integration**

Create `apps/web/src/hooks/use-auth.ts`:

```typescript
"use client";

import { useCallback, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api";
import type { AuthResponse } from "@/lib/api/types";

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  display_name?: string;
}

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout: storeLogout } = useAuthStore();

  // Check current session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await apiClient.get<AuthResponse>("/api/v1/auth/me");
        setUser(response.user);
      } catch {
        setUser(null);
      }
    };

    checkSession();
  }, [setUser]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setLoading(true);
      try {
        const response = await apiClient.post<AuthResponse>(
          "/api/v1/auth/login",
          credentials
        );
        if (response.success && response.user) {
          setUser(response.user);
          return { success: true };
        }
        return { success: false, error: response.message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "登录失败";
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [setUser, setLoading]
  );

  const register = useCallback(
    async (data: RegisterData) => {
      setLoading(true);
      try {
        const response = await apiClient.post<AuthResponse>(
          "/api/v1/auth/register",
          data
        );
        if (response.success && response.user) {
          setUser(response.user);
          return { success: true };
        }
        return { success: false, error: response.message };
      } catch (error) {
        const message = error instanceof Error ? error.message : "注册失败";
        return { success: false, error: message };
      } finally {
        setLoading(false);
      }
    },
    [setUser, setLoading]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/api/v1/auth/logout");
    } catch {
      // Ignore logout errors
    } finally {
      storeLogout();
    }
  }, [storeLogout]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
  };
}
```

**Step 3: Verify TypeScript compilation**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/stores apps/web/src/hooks
git commit -m "feat(web): add auth store and hook

- Create Zustand store with persist middleware
- Add useAuth hook for login/register/logout
- Auto-check session on mount

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Create API Query Hooks

**Files:**
- Create: `apps/web/src/hooks/use-articles.ts`
- Create: `apps/web/src/hooks/use-categories.ts`
- Create: `apps/web/src/hooks/use-sources.ts`
- Create: `apps/web/src/hooks/use-search.ts`
- Create: `apps/web/src/hooks/index.ts`

**Step 1: Create articles hook**

Create `apps/web/src/hooks/use-articles.ts`:

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Article, ArticleListResponse } from "@/lib/api/types";

interface ArticleFilters {
  limit?: number;
  offset?: number;
  category_id?: string;
  status?: string;
}

export function useArticles(filters: ArticleFilters = {}) {
  const { limit = 20, offset = 0, category_id, status } = filters;

  const queryParams = new URLSearchParams();
  queryParams.set("limit", limit.toString());
  queryParams.set("offset", offset.toString());
  if (category_id) queryParams.set("category_id", category_id);
  if (status) queryParams.set("status", status);

  return useQuery({
    queryKey: ["articles", filters],
    queryFn: () =>
      apiClient.get<ArticleListResponse>(
        `/api/v1/articles?${queryParams.toString()}`
      ),
  });
}

export function useArticle(id: string) {
  return useQuery({
    queryKey: ["article", id],
    queryFn: () => apiClient.get<Article>(`/api/v1/articles/${id}`),
    enabled: !!id,
  });
}

export function usePublishArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<Article>(`/api/v1/articles/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    },
  });
}
```

**Step 2: Create categories hook**

Create `apps/web/src/hooks/use-categories.ts`:

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Category } from "@/lib/api/types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiClient.get<Category[]>("/api/v1/categories"),
    staleTime: 5 * 60 * 1000, // Categories rarely change
  });
}
```

**Step 3: Create sources hook**

Create `apps/web/src/hooks/use-sources.ts`:

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Source } from "@/lib/api/types";

interface CreateSourceInput {
  name: string;
  url: string;
  source_type: "rss" | "spider" | "api";
  config?: Record<string, unknown>;
  schedule?: string;
  priority?: number;
}

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => apiClient.get<Source[]>("/api/v1/sources"),
  });
}

export function useSource(id: string) {
  return useQuery({
    queryKey: ["source", id],
    queryFn: () => apiClient.get<Source>(`/api/v1/sources/${id}`),
    enabled: !!id,
  });
}

export function useCreateSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSourceInput) =>
      apiClient.post<Source>("/api/v1/sources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useTriggerFetch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/api/v1/sources/${id}/fetch`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}
```

**Step 4: Create search hook**

Create `apps/web/src/hooks/use-search.ts`:

```typescript
"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { SearchResponse, AskResponse } from "@/lib/api/types";

export function useSearch(query: string, limit = 10) {
  return useQuery({
    queryKey: ["search", query, limit],
    queryFn: () =>
      apiClient.get<SearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`
      ),
    enabled: query.length > 2,
  });
}

export function useSemanticSearch() {
  return useMutation({
    mutationFn: (data: { query: string; limit?: number }) =>
      apiClient.post<SearchResponse>("/api/v1/search/semantic", data),
  });
}

export function useAskQuestion() {
  return useMutation({
    mutationFn: (data: { question: string; top_k?: number }) =>
      apiClient.post<AskResponse>("/api/v1/search/ask", data),
  });
}
```

**Step 5: Create hooks index**

Create `apps/web/src/hooks/index.ts`:

```typescript
export * from "./use-auth";
export * from "./use-articles";
export * from "./use-categories";
export * from "./use-sources";
export * from "./use-search";
```

**Step 6: Verify TypeScript compilation**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/hooks
git commit -m "feat(web): add TanStack Query hooks for all API endpoints

- useArticles, useArticle, usePublishArticle
- useCategories
- useSources, useSource, useCreateSource, useTriggerFetch
- useSearch, useSemanticSearch, useAskQuestion

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Create Auth Provider and Protected Route

**Files:**
- Create: `apps/web/src/components/providers/auth-provider.tsx`
- Create: `apps/web/src/components/auth/protected-route.tsx`
- Modify: `apps/web/src/app/layout.tsx`

**Step 1: Create Auth Provider**

Create `apps/web/src/components/providers/auth-provider.tsx`:

```typescript
"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiClient } from "@/lib/api";
import type { AuthResponse } from "@/lib/api/types";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const checkSession = async () => {
      setLoading(true);
      try {
        const response = await apiClient.get<AuthResponse>("/api/v1/auth/me");
        setUser(response.user);
      } catch {
        setUser(null);
      }
    };

    checkSession();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
```

**Step 2: Create Protected Route component**

Create `apps/web/src/components/auth/protected-route.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      fallback ?? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
```

**Step 3: Update layout with AuthProvider**

Modify `apps/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "法眼 | Law Eye",
  description: "数字时代法律赛道的\"参考消息\" - 聚合多渠道法律资讯，构建权威信息仓库",
  keywords: ["法律", "法规", "资讯", "合规", "监管", "法眼", "Law Eye"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

**Step 4: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/components/providers apps/web/src/components/auth apps/web/src/app/layout.tsx
git commit -m "feat(web): add auth provider and protected route

- AuthProvider checks session on mount
- ProtectedRoute redirects to login if not authenticated
- Shows loading spinner during auth check

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: Create Login Page

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/components/auth/login-form.tsx`

**Step 1: Create Login Form component**

Create `apps/web/src/components/auth/login-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export function LoginForm() {
  const router = useRouter();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const result = await login({ email, password });
    if (result.success) {
      router.push("/");
    } else {
      setError(result.error || "登录失败，请重试");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-error-light p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-neutral-700">
          邮箱
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          密码
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "登录中..." : "登录"}
      </Button>

      <p className="text-center text-sm text-neutral-500">
        还没有账号？{" "}
        <a href="/register" className="text-primary-600 hover:underline">
          立即注册
        </a>
      </p>
    </form>
  );
}
```

**Step 2: Create Login Page**

Create `apps/web/src/app/login/page.tsx`:

```typescript
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg">
            <span className="text-3xl">⚖️</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">欢迎回来</h1>
          <p className="mt-2 text-neutral-500">登录您的法眼账户</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-neutral-400">
          登录即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/app/login apps/web/src/components/auth/login-form.tsx
git commit -m "feat(web): add login page

- Create LoginForm component with error handling
- Create login page with branding
- Redirect to home on success

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Create Register Page

**Files:**
- Create: `apps/web/src/app/register/page.tsx`
- Create: `apps/web/src/components/auth/register-form.tsx`

**Step 1: Create Register Form component**

Create `apps/web/src/components/auth/register-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export function RegisterForm() {
  const router = useRouter();
  const { register, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("密码至少需要8个字符");
      return;
    }

    const result = await register({
      email,
      password,
      display_name: displayName || undefined,
    });

    if (result.success) {
      router.push("/");
    } else {
      setError(result.error || "注册失败，请重试");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-error-light p-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="displayName" className="text-sm font-medium text-neutral-700">
          显示名称 <span className="text-neutral-400">(可选)</span>
        </label>
        <Input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="您的名称"
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-neutral-700">
          邮箱
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-neutral-700">
          密码
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少8个字符"
          required
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "注册中..." : "创建账户"}
      </Button>

      <p className="text-center text-sm text-neutral-500">
        已有账号？{" "}
        <a href="/login" className="text-primary-600 hover:underline">
          立即登录
        </a>
      </p>
    </form>
  );
}
```

**Step 2: Create Register Page**

Create `apps/web/src/app/register/page.tsx`:

```typescript
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg">
            <span className="text-3xl">⚖️</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">创建账户</h1>
          <p className="mt-2 text-neutral-500">加入法眼，掌握法律资讯前沿</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl bg-white p-8 shadow-sm">
          <RegisterForm />
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-neutral-400">
          注册即表示您同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/app/register apps/web/src/components/auth/register-form.tsx
git commit -m "feat(web): add register page

- Create RegisterForm with validation
- Create register page with branding
- Auto-login after successful registration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: Integrate Dashboard with Real API Data

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/dashboard/stats-cards.tsx`
- Create: `apps/web/src/components/dashboard/category-overview.tsx`
- Create: `apps/web/src/components/dashboard/recent-articles.tsx`

**Step 1: Create StatsCards component**

Create `apps/web/src/components/dashboard/stats-cards.tsx`:

```typescript
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FileText, Rss, Clock, AlertTriangle } from "lucide-react";
import { useArticles } from "@/hooks/use-articles";
import { useSources } from "@/hooks/use-sources";

export function StatsCards() {
  const { data: articlesData, isLoading: articlesLoading } = useArticles({ limit: 1 });
  const { data: sourcesData, isLoading: sourcesLoading } = useSources();

  const activeSources = sourcesData?.filter((s) => s.is_active).length ?? 0;
  const pendingArticles = articlesData?.data?.filter((a) => a.status === "pending").length ?? 0;
  const highRiskArticles = articlesData?.data?.filter((a) => (a.risk_score ?? 0) > 70).length ?? 0;

  const stats = [
    {
      title: "今日资讯",
      value: articlesLoading ? "-" : (articlesData?.total ?? 0).toString(),
      icon: FileText,
      color: "primary",
    },
    {
      title: "活跃信息源",
      value: sourcesLoading ? "-" : activeSources.toString(),
      icon: Rss,
      color: "success",
    },
    {
      title: "待处理",
      value: articlesLoading ? "-" : pendingArticles.toString(),
      icon: Clock,
      color: "warning",
    },
    {
      title: "风险预警",
      value: articlesLoading ? "-" : highRiskArticles.toString(),
      icon: AlertTriangle,
      color: "error",
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-500">{stat.title}</p>
                <p className="mt-2 text-3xl font-bold text-neutral-900">{stat.value}</p>
              </div>
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  stat.color === "primary"
                    ? "bg-primary-100 text-primary-600"
                    : stat.color === "success"
                    ? "bg-success-light text-success"
                    : stat.color === "warning"
                    ? "bg-warning-light text-warning"
                    : "bg-error-light text-error"
                }`}
              >
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Step 2: Create CategoryOverview component**

Create `apps/web/src/components/dashboard/category-overview.tsx`:

```typescript
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { useCategories } from "@/hooks/use-categories";

export function CategoryOverview() {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary-500" />
            板块概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-neutral-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary-500" />
          板块概览
        </CardTitle>
        <CardDescription>{categories?.length ?? 0} 大分类资讯分布</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories?.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-neutral-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{category.icon}</span>
                <span className="text-sm font-medium text-neutral-700">
                  {category.name}
                </span>
              </div>
              <Badge variant={category.slug as any}>
                {category.sort_order}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Create RecentArticles component**

Create `apps/web/src/components/dashboard/recent-articles.tsx`:

```typescript
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowUpRight, Clock } from "lucide-react";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import Link from "next/link";

type RiskLevel = "low" | "medium" | "high";

const riskColors: Record<RiskLevel, "success" | "warning" | "destructive"> = {
  low: "success",
  medium: "warning",
  high: "destructive",
};

const riskLabels: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

function getRiskLevel(score: number | null): RiskLevel {
  if (!score || score <= 30) return "low";
  if (score <= 70) return "medium";
  return "high";
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "未知时间";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export function RecentArticles() {
  const { data: articlesData, isLoading } = useArticles({ limit: 5, status: "published" });
  const { data: categories } = useCategories();

  const articles = articlesData?.data ?? [];

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId || !categories) return null;
    return categories.find((c) => c.id === categoryId);
  };

  if (isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary-500" />
            最新资讯
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-neutral-100" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary-500" />
            最新资讯
          </CardTitle>
          <CardDescription>近期采集的重要法律资讯</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/articles">
            查看全部
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {articles.length === 0 ? (
            <p className="text-center text-neutral-500 py-8">暂无资讯</p>
          ) : (
            articles.map((article) => {
              const category = getCategoryName(article.category_id);
              const riskLevel = getRiskLevel(article.risk_score);

              return (
                <div
                  key={article.id}
                  className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
                >
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      {category && (
                        <Badge variant={category.slug as any}>
                          {category.name}
                        </Badge>
                      )}
                      <Badge variant={riskColors[riskLevel]}>
                        {riskLabels[riskLevel]}
                      </Badge>
                    </div>
                    <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600">
                      {article.title}
                    </h4>
                    <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
                      {article.author && <span>来源：{article.author}</span>}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(article.published_at)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    asChild
                  >
                    <a href={article.link} target="_blank" rel="noopener noreferrer">
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 4: Update Dashboard page**

Replace `apps/web/src/app/page.tsx`:

```typescript
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { CategoryOverview } from "@/components/dashboard/category-overview";
import { RecentArticles } from "@/components/dashboard/recent-articles";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />

        <main className="ml-[280px] flex-1">
          <Header />

          <div className="p-6">
            {/* Page Title */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-neutral-900">数据看板</h1>
              <p className="text-sm text-neutral-500">实时监控法律资讯动态与系统运行状态</p>
            </div>

            {/* Stats Grid */}
            <StatsCards />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Categories Overview */}
              <CategoryOverview />

              {/* Recent Articles */}
              <RecentArticles />
            </div>

            {/* System Status */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  系统状态
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">API 服务</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">运行正常</p>
                  </div>
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">采集服务</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">信息源正常</p>
                  </div>
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">AI 服务</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">LLM Gateway 在线</p>
                  </div>
                  <div className="rounded-lg bg-success-light p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span className="text-sm font-medium text-success">数据库</span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">PostgreSQL + Redis 正常</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

**Step 5: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 6: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/components/dashboard apps/web/src/app/page.tsx
git commit -m "feat(web): integrate dashboard with real API data

- Create StatsCards with live article/source counts
- Create CategoryOverview with real categories
- Create RecentArticles with real article data
- Add loading states and empty states

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: Integrate Articles Page with Real API Data

**Files:**
- Modify: `apps/web/src/app/articles/page.tsx`

**Step 1: Update Articles page with real data**

Replace `apps/web/src/app/articles/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import {
  FileText,
  Clock,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import Link from "next/link";

type RiskLevel = "low" | "medium" | "high";

const riskColors: Record<RiskLevel, "success" | "warning" | "destructive"> = {
  low: "success",
  medium: "warning",
  high: "destructive",
};

const riskLabels: Record<RiskLevel, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

function getRiskLevel(score: number | null): RiskLevel {
  if (!score || score <= 30) return "low";
  if (score <= 70) return "medium";
  return "high";
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "未知时间";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const PAGE_SIZE = 20;

export default function ArticlesPage() {
  const [page, setPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: articlesData, isLoading: articlesLoading } = useArticles({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    category_id: selectedCategory ?? undefined,
  });

  const { data: categories } = useCategories();

  const articles = articlesData?.data ?? [];
  const total = articlesData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId || !categories) return null;
    return categories.find((c) => c.id === categoryId);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />

        <main className="ml-[280px] flex-1">
          <Header />

          <div className="p-6">
            {/* Page Title */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">资讯列表</h1>
                <p className="text-sm text-neutral-500">
                  共 {total} 条资讯
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                筛选
              </Button>
            </div>

            {/* Category Filters */}
            <div className="mb-6 flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedCategory(null);
                  setPage(0);
                }}
              >
                全部
              </Badge>
              {categories?.map((category) => (
                <Badge
                  key={category.id}
                  variant={selectedCategory === category.id ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setPage(0);
                  }}
                >
                  {category.icon} {category.name}
                </Badge>
              ))}
            </div>

            {/* Articles List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary-500" />
                  资讯列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {articlesLoading ? (
                  <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-24 rounded-lg bg-neutral-100" />
                    ))}
                  </div>
                ) : articles.length === 0 ? (
                  <p className="py-12 text-center text-neutral-500">暂无资讯</p>
                ) : (
                  <div className="space-y-4">
                    {articles.map((article) => {
                      const category = getCategoryName(article.category_id);
                      const riskLevel = getRiskLevel(article.risk_score);

                      return (
                        <div
                          key={article.id}
                          className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
                        >
                          <div className="flex-1">
                            <div className="mb-2 flex items-center gap-2">
                              {category && (
                                <Badge variant={category.slug as any}>
                                  {category.icon} {category.name}
                                </Badge>
                              )}
                              <Badge variant={riskColors[riskLevel]}>
                                {riskLabels[riskLevel]}
                              </Badge>
                              <Badge variant="outline">{article.status}</Badge>
                            </div>
                            <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600">
                              {article.title}
                            </h4>
                            {article.summary && (
                              <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                                {article.summary}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
                              {article.author && <span>来源：{article.author}</span>}
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(article.published_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 transition-opacity group-hover:opacity-100"
                              asChild
                            >
                              <a href={article.link} target="_blank" rel="noopener noreferrer">
                                <ArrowUpRight className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <p className="text-sm text-neutral-500">
                      第 {page + 1} / {totalPages} 页
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        下一页
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

**Step 2: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/app/articles/page.tsx
git commit -m "feat(web): integrate articles page with real API data

- Add category filtering
- Add pagination
- Show real article data from API
- Add loading and empty states

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: Update Header with Real User Data

**Files:**
- Modify: `apps/web/src/components/layout/header.tsx`

**Step 1: Update Header component**

Replace `apps/web/src/components/layout/header.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, User, LogOut, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useAuth } from "@/hooks/use-auth";

export function Header() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const displayName = user?.display_name || user?.email?.split("@")[0] || "用户";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-neutral-200 bg-white/95 px-6 backdrop-blur-sm">
      {/* Search */}
      <form onSubmit={handleSearch} className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          type="search"
          placeholder="搜索资讯、法规、关键词..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
            3
          </span>
        </Button>

        {/* User Menu */}
        <div className="relative">
          <Button
            variant="ghost"
            className="gap-2"
            onClick={() => setShowMenu(!showMenu)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={displayName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span className="text-sm font-medium">{initials}</span>
              )}
            </div>
            <span className="text-sm font-medium text-neutral-700">{displayName}</span>
          </Button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => {
                  setShowMenu(false);
                  router.push("/settings");
                }}
              >
                <Settings className="h-4 w-4" />
                设置
              </button>
              <button
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-error hover:bg-neutral-50"
                onClick={() => {
                  setShowMenu(false);
                  handleLogout();
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
```

**Step 2: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/components/layout/header.tsx
git commit -m "feat(web): integrate header with real user data

- Show user name and avatar from auth store
- Add user dropdown menu
- Add logout functionality
- Add search form that navigates to search page

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: Create Search Page

**Files:**
- Create: `apps/web/src/app/search/page.tsx`

**Step 1: Create Search Page**

Create `apps/web/src/app/search/page.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useSearch, useAskQuestion } from "@/hooks/use-search";
import { Search, ArrowUpRight, Sparkles, MessageCircle, Send } from "lucide-react";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [question, setQuestion] = useState("");
  const [showAI, setShowAI] = useState(false);

  const { data: searchData, isLoading: searching } = useSearch(searchTerm);
  const askMutation = useAskQuestion();

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      setSearchTerm(q);
    }
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(query);
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    askMutation.mutate({ question, top_k: 5 });
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />

        <main className="ml-[280px] flex-1">
          <Header />

          <div className="p-6">
            {/* Page Title */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-neutral-900">搜索</h1>
              <p className="text-sm text-neutral-500">搜索法律资讯或向 AI 提问</p>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
                <Input
                  type="search"
                  placeholder="输入关键词搜索..."
                  className="h-12 pl-12 pr-24 text-lg"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  disabled={searching}
                >
                  搜索
                </Button>
              </div>
            </form>

            {/* Toggle AI Mode */}
            <div className="mb-6 flex items-center gap-4">
              <Button
                variant={showAI ? "outline" : "default"}
                size="sm"
                onClick={() => setShowAI(false)}
              >
                <Search className="mr-2 h-4 w-4" />
                关键词搜索
              </Button>
              <Button
                variant={showAI ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAI(true)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                AI 问答
              </Button>
            </div>

            {showAI ? (
              /* AI Q&A Section */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5 text-primary-500" />
                    AI 智能问答
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAsk} className="mb-6">
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入您的法律问题..."
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        className="flex-1"
                      />
                      <Button type="submit" disabled={askMutation.isPending}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </form>

                  {askMutation.isPending && (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
                    </div>
                  )}

                  {askMutation.data && (
                    <div className="space-y-4">
                      <div className="rounded-lg bg-primary-50 p-4">
                        <p className="font-medium text-neutral-900">
                          {askMutation.data.answer}
                        </p>
                        <p className="mt-2 text-xs text-neutral-500">
                          置信度: {(askMutation.data.confidence * 100).toFixed(0)}%
                        </p>
                      </div>

                      {askMutation.data.sources.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-medium text-neutral-700">
                            参考来源:
                          </h4>
                          <div className="space-y-2">
                            {askMutation.data.sources.map((source, i) => (
                              <div
                                key={i}
                                className="rounded border border-neutral-100 p-3"
                              >
                                <p className="text-sm font-medium">{source.title}</p>
                                <p className="mt-1 text-xs text-neutral-500">
                                  {source.excerpt}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Search Results */
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-primary-500" />
                    搜索结果
                    {searchData && (
                      <Badge variant="outline">{searchData.total} 条结果</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {searching ? (
                    <div className="animate-pulse space-y-4">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-20 rounded-lg bg-neutral-100" />
                      ))}
                    </div>
                  ) : !searchData || searchData.results.length === 0 ? (
                    <p className="py-12 text-center text-neutral-500">
                      {searchTerm ? "未找到相关结果" : "输入关键词开始搜索"}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {searchData.results.map((result) => (
                        <div
                          key={result.article_id}
                          className="group flex items-start justify-between rounded-lg border border-neutral-100 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50"
                        >
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold text-neutral-900 group-hover:text-primary-600">
                              {result.title}
                            </h4>
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                              {result.excerpt}
                            </p>
                            <p className="mt-2 text-xs text-neutral-400">
                              相关度: {(result.score * 100).toFixed(0)}%
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

**Step 2: Verify build**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd D:/Desktop/LawSaw
git add apps/web/src/app/search
git commit -m "feat(web): add search page with AI Q&A

- Full-text search with results display
- AI Q&A mode with RAG integration
- Toggle between search and AI modes
- Show answer sources and confidence

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 12: Final Verification and Summary

**Step 1: Full build verification**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm build`
Expected: Build succeeds with no errors

**Step 2: TypeScript check**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm tsc --noEmit`
Expected: No errors

**Step 3: Start dev server**

Run: `cd D:/Desktop/LawSaw/apps/web && pnpm dev --port 3333`
Expected: Server starts on http://localhost:3333

**Step 4: Manual verification checklist**

- [ ] Visit http://localhost:3333/login - should see login page
- [ ] Visit http://localhost:3333/register - should see register page
- [ ] Visit http://localhost:3333 - should redirect to login if not authenticated
- [ ] Login with valid credentials - should redirect to dashboard
- [ ] Dashboard shows real stats from API (may show 0 if no data)
- [ ] Categories load from API
- [ ] Articles page shows real data
- [ ] Search page works with keyword search
- [ ] AI Q&A sends requests to backend
- [ ] Logout works

**Step 5: Final commit**

```bash
cd D:/Desktop/LawSaw
git add .
git commit -m "feat(web): complete frontend-backend API integration

Summary of changes:
- API client with typed fetch wrapper
- TanStack Query for data fetching
- Zustand for auth state management
- Login/Register pages with error handling
- Protected routes with auth guards
- Dashboard with real API data
- Articles page with filtering/pagination
- Search page with AI Q&A
- Header with user menu and logout

API Coverage: 15/26 endpoints integrated
Remaining: sources management, users admin, API keys

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Acceptance Criteria

After completing all tasks:

| Requirement | Status |
|-------------|--------|
| API client with TypeScript types | ✅ |
| TanStack Query provider | ✅ |
| Zustand auth store | ✅ |
| Login page | ✅ |
| Register page | ✅ |
| Protected routes | ✅ |
| Dashboard with real data | ✅ |
| Articles page with real data | ✅ |
| Search page with AI Q&A | ✅ |
| User menu with logout | ✅ |

## Remaining Work (Future Tasks)

| Feature | Priority | Endpoints |
|---------|----------|-----------|
| Sources management page | P2 | GET/POST /sources, POST /sources/{id}/fetch |
| Article detail page | P2 | GET /articles/{id} |
| User settings page | P3 | PATCH /users/{id} |
| Admin users page | P3 | GET/PATCH /users |
| API keys management | P3 | GET/POST/DELETE /apikeys |

---

> **Document Version**: 1.0.0
> **Created**: 2025-01-18
> **Status**: Ready for execution
