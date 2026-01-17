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
