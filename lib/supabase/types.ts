/**
 * Supabase の表（テーブル）の形。
 * 表の列名と、ここに書いた名前が一致している必要があります。
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
  published_at: string | null;
};

export type ImportanceLevel = "high" | "medium" | "low";

/** 高・中・低（英語の high / medium / low も受け付ける） */
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

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      topics: Table<
        Topic,
        {
          id?: string;
          name: string;
          created_at?: string;
        },
        {
          id?: string;
          name?: string;
          created_at?: string;
        }
      >;
      articles: Table<
        Article,
        {
          id?: string;
          topic_id: string;
          title: string;
          url: string;
          summary?: string | null;
          importance?: string | null;
          is_read?: boolean;
          published_at?: string | null;
        },
        {
          id?: string;
          topic_id?: string;
          title?: string;
          url?: string;
          summary?: string | null;
          importance?: string | null;
          is_read?: boolean;
          published_at?: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
