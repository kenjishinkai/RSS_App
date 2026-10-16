/**
 * バックエンド API のベース URL。
 * ブラウザでは Next.js の /backend プロキシ経由にする。
 * （localhost と 127.0.0.1 が混ざると Cookie が届かずログインできないため）
 */

export function getBackendBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "/backend";
  }

  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}
