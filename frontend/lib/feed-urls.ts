/**
 * トピックごとの RSS URL をブラウザに覚えておく。
 * たとえ: 各話題の「購読リストのメモ」を付箋でモニターに貼っておく感じ。
 * （DB の topics に feed_url 列を足すまでの簡易版）
 */

const STORAGE_KEY = "rss-app.topic-feed-urls";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getFeedUrl(topicId: string): string {
  return readMap()[topicId] ?? "";
}

export function setFeedUrl(topicId: string, feedUrl: string) {
  const map = readMap();
  const trimmed = feedUrl.trim();
  if (!trimmed) {
    delete map[topicId];
  } else {
    map[topicId] = trimmed;
  }
  writeMap(map);
}
