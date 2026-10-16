/**
 * ログイン／登録／ログアウト。Cookie（httpOnly）でセッションを持つ。
 */

import { getBackendBaseUrl } from "@/lib/backendBaseUrl";
import { withLog } from "@/lib/logging";

export type AuthUser = {
  id: string;
  email: string;
  created_at: string;
};

export class AuthRequiredError extends Error {
  constructor(message = "ログインが必要です。") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: string | { msg?: string }[];
  } | null;
  const detail = payload?.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg ?? JSON.stringify(item)).join(" / ");
  }
  return `${fallback}（HTTP ${response.status}）`;
}

export async function fetchMe(): Promise<AuthUser> {
  return withLog("fetchMe", {}, async () => {
    const base = getBackendBaseUrl();
    const response = await fetch(`${base}/auth/me`, {
      credentials: "include",
    });
    if (response.status === 401) {
      throw new AuthRequiredError(
        await readErrorMessage(response, "ログインが必要です。"),
      );
    }
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "ログイン状態を確認できませんでした。"),
      );
    }
    return (await response.json()) as AuthUser;
  });
}

export async function registerUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  return withLog("registerUser", { email }, async () => {
    const base = getBackendBaseUrl();
    const response = await fetch(`${base}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "ユーザー登録に失敗しました。"),
      );
    }
    return (await response.json()) as AuthUser;
  });
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  return withLog("loginUser", { email }, async () => {
    const base = getBackendBaseUrl();
    const response = await fetch(`${base}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "ログインに失敗しました。"),
      );
    }
    return (await response.json()) as AuthUser;
  });
}

export async function logoutUser(): Promise<void> {
  return withLog("logoutUser", {}, async () => {
    const base = getBackendBaseUrl();
    const response = await fetch(`${base}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "ログアウトに失敗しました。"),
      );
    }
  });
}
