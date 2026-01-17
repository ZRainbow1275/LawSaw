import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg">
            <span className="text-3xl">&#x2696;&#xFE0F;</span>
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
