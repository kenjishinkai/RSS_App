/**
 * API / DB 行の形。
 * 列名は PostgreSQL（newsdesk）側と一致している必要がある。
 * feed_url 列は無い（取得元は Google News 固定）。
 */

export type Topic = {
  id: string;
  name: string;
  created_at: string;
};

export type Article = {
  id: string;
  topic_id: string;
  title: string;
  url: string;
  summary: string | null;
  importance: string | null;
  is_read: boolean;
  is_favorite: boolean;
  published_at: string | null;
};

export type ImportanceLevel = "high" | "medium" | "low";

/** high / medium / low（日本語の 高 / 中 も受け付ける） */
export function toImportanceLevel(
  value: string | null | undefined,
): ImportanceLevel {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "high" || normalized === "高") {
    return "high";
  }

  if (
    normalized === "medium" ||
    normalized === "mid" ||
    normalized === "中"
  ) {
    return "medium";
  }

  return "low";
}

export const importanceLabel: Record<ImportanceLevel, string> = {
  high: "高",
  medium: "中",
  low: "低",
};
