/**
 * バックエンド（FastAPI）への連絡先。
 * たとえ: 編集室への内線番号。画面から「今すぐ取得」を頼むときに使う。
 */

export const backendBaseUrl = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export type CurateResult = {
  fetched: number;
  new_items: number;
  inserted: number;
  message: string;
};

export async function runCurateJob(input: {
  topicId: string;
  feedUrl: string;
}): Promise<CurateResult> {
  const response = await fetch(`${backendBaseUrl}/jobs/curate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic_id: input.topicId,
      feed_url: input.feedUrl,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | CurateResult
    | { detail?: string | { msg?: string }[] }
    | null;

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload && "detail" in payload
        ? payload.detail
        : null;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg ?? JSON.stringify(item)).join(" / ")
          : `取得に失敗しました（HTTP ${response.status}）`;
    throw new Error(message);
  }

  if (!payload || !("message" in payload)) {
    throw new Error("バックエンドの応答が読めませんでした。");
  }

  return payload;
}
