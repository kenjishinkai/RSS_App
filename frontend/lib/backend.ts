/**
 * バックエンド（FastAPI）への連絡先。
 * トピック / 記事の CRUD と「今すぐ取得」（POST /jobs/curate）を呼ぶ。
 * Cookie 認証のため credentials: "include" を付ける。
 */

import { AuthRequiredError } from "@/lib/auth";
import { getBackendBaseUrl } from "@/lib/backendBaseUrl";
import { withLog } from "@/lib/logging";
import type { Article, Topic } from "@/lib/types";

export type CurateResult = {
  fetched: number;
  new_items: number;
  inserted: number;
  message: string;
};

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

async function apiFetch(
  url: string,
  init?: RequestInit,
  fallback = "リクエストに失敗しました。",
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (response.status === 401) {
    throw new AuthRequiredError(
      await readErrorMessage(response, "ログインが必要です。"),
    );
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallback));
  }
  return response;
}

export async function fetchTopics(): Promise<Topic[]> {
  return withLog("fetchTopics", {}, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/topics`,
      undefined,
      "トピックを読み込めませんでした。バックエンドが起動しているか確認してください。",
    );
    return (await response.json()) as Topic[];
  });
}

export async function createTopic(name: string): Promise<Topic> {
  return withLog("createTopic", { name }, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/topics`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      "トピックを追加できませんでした。",
    );
    return (await response.json()) as Topic;
  });
}

export async function updateTopic(
  topicId: string,
  name: string,
): Promise<Topic> {
  return withLog("updateTopic", { topicId, name }, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/topics/${topicId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      },
      "トピックを更新できませんでした。",
    );
    return (await response.json()) as Topic;
  });
}

export async function deleteTopic(topicId: string): Promise<void> {
  return withLog("deleteTopic", { topicId }, async () => {
    await apiFetch(
      `${getBackendBaseUrl()}/topics/${topicId}`,
      { method: "DELETE" },
      "トピックを削除できませんでした。",
    );
  });
}

export async function fetchArticles(topicId: string): Promise<Article[]> {
  return withLog("fetchArticles", { topicId }, async () => {
    const params = new URLSearchParams({ topic_id: topicId });
    const response = await apiFetch(
      `${getBackendBaseUrl()}/articles?${params}`,
      undefined,
      "記事を読み込めませんでした。",
    );
    return (await response.json()) as Article[];
  });
}

export async function markArticleRead(articleId: string): Promise<Article> {
  return withLog("markArticleRead", { articleId }, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/articles/${articleId}/read`,
      { method: "PATCH" },
      "既読に更新できませんでした。",
    );
    return (await response.json()) as Article;
  });
}

export async function deleteArticle(articleId: string): Promise<void> {
  return withLog("deleteArticle", { articleId }, async () => {
    await apiFetch(
      `${getBackendBaseUrl()}/articles/${articleId}`,
      { method: "DELETE" },
      "記事を削除できませんでした。",
    );
  });
}

export async function markArticleFavorite(
  articleId: string,
): Promise<Article> {
  return withLog("markArticleFavorite", { articleId }, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/articles/${articleId}/favorite`,
      { method: "PATCH" },
      "お気に入りに登録できませんでした。",
    );
    return (await response.json()) as Article;
  });
}

export async function unmarkArticleFavorite(
  articleId: string,
): Promise<Article> {
  return withLog("unmarkArticleFavorite", { articleId }, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/articles/${articleId}/favorite`,
      { method: "DELETE" },
      "お気に入りを解除できませんでした。",
    );
    return (await response.json()) as Article;
  });
}

export async function runCurateJob(input: {
  topicId: string;
  topicName: string;
}): Promise<CurateResult> {
  return withLog("runCurateJob", input, async () => {
    const response = await apiFetch(
      `${getBackendBaseUrl()}/jobs/curate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_id: String(input.topicId),
          topic_name: String(input.topicName),
        }),
      },
      "取得に失敗しました。",
    );

    const payload = (await response.json()) as CurateResult;
    if (!payload || !("message" in payload)) {
      throw new Error("バックエンドの応答が読めませんでした。");
    }
    return payload;
  });
}
