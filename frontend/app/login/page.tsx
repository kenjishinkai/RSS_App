"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert, Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AuthRequiredError,
  fetchMe,
  loginUser,
} from "@/lib/auth";
import { withLog } from "@/lib/logging";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    void withLog("loginPageCheckSession", {}, async () => {
      try {
        await fetchMe();
        if (!ignore) {
          router.replace("/");
        }
      } catch (error) {
        if (ignore) {
          return;
        }
        if (!(error instanceof AuthRequiredError)) {
          setMessage(
            error instanceof Error
              ? error.message
              : "ログイン状態を確認できませんでした。",
          );
        }
        setChecking(false);
      }
    }).catch(() => {
      if (!ignore) {
        setChecking(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    await withLog("handleLogin", { email }, async () => {
      if (!email || !password) {
        setMessage("メールアドレスとパスワードを入力してください。");
        return;
      }

      setSubmitting(true);
      setMessage(null);

      try {
        await loginUser(email, password);
        router.replace("/");
      } catch (error) {
        setSubmitting(false);
        setMessage(
          error instanceof Error
            ? error.message
            : "ログインに失敗しました。",
        );
        throw error;
      }
    }).catch(() => {
      setSubmitting(false);
    });
  }

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        確認中...
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Newspaper className="size-5" />
          </span>
          <h1 className="text-lg font-medium">ニュースデスクにログイン</h1>
          <p className="text-xs text-muted-foreground">
            ログイン後は、全員が同じトピック・記事を共有します
          </p>
        </div>

        {message ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="email"
              className="text-xs font-medium text-muted-foreground"
            >
              メールアドレス
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={submitting}
              className="mt-1.5"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="text-xs font-medium text-muted-foreground"
            >
              パスワード（8文字以上）
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              disabled={submitting}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={submitting} className="mt-1 w-full">
            {submitting ? "ログイン中..." : "ログイン"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          アカウントがない場合は{" "}
          <Link href="/register" className="text-foreground underline">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
