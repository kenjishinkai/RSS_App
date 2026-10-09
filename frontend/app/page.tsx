"use client";

import { useEffect, useState } from "react";
import { Check, CircleAlert, ExternalLink, Newspaper, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { runCurateJob } from "@/lib/backend";
import { getFeedUrl, setFeedUrl } from "@/lib/feed-urls";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  importanceLabel,
  toImportanceLevel,
  type Article,
  type Topic,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

const importanceClassName = {
  high: "border-transparent bg-red-600 text-white",
  medium: "border-transparent bg-amber-400 text-amber-950",
  low: "border-transparent bg-neutral-200 text-neutral-700",
} as const;

function formatPublishedAt(value: string | null) {
  if (!value) {
    return "日付なし";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日付なし";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function HomePage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(isSupabaseConfigured);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [showRead, setShowRead] = useState(false);
  const [feedUrl, setFeedUrlInput] = useState("");
  const [curating, setCurating] = useState(false);
  const [articlesRefreshKey, setArticlesRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(
    isSupabaseConfigured
      ? null
      : "Supabase の接続情報が未設定です。.env.example をコピーして .env.local を作り、URL と anon key を入れてから開発サーバーを再起動してください。",
  );

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const visibleArticles = showRead
    ? articles
    : articles.filter((article) => !article.is_read);
  const unreadCount = articles.filter((article) => !article.is_read).length;

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let ignore = false;

    async function loadTopics() {
      const { data, error } = await supabase!
        .from("topics")
        .select("id, name, created_at")
        .order("created_at", { ascending: true });

      if (ignore) {
        return;
      }

      if (error) {
        setMessage(
          "トピックを読み込めませんでした。テーブル名と、Supabase の読み取り許可（RLS）を確認してください。",
        );
        setTopicsLoading(false);
        return;
      }

      const nextTopics = data ?? [];
      const firstTopicId = nextTopics[0]?.id ?? null;
      setTopics(nextTopics);
      setSelectedTopicId(firstTopicId);
      setFeedUrlInput(firstTopicId ? getFeedUrl(firstTopicId) : "");
      if (nextTopics.length > 0) {
        setArticlesLoading(true);
      }
      setTopicsLoading(false);
    }

    void loadTopics();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase || !selectedTopicId) {
      return;
    }

    const client = supabase;
    const topicId = selectedTopicId;
    let ignore = false;

    async function loadArticles() {
      setArticlesLoading(true);

      const { data, error } = await client
        .from("articles")
        .select(
          "id, topic_id, title, url, summary, importance, is_read, published_at",
        )
        .eq("topic_id", topicId)
        .order("published_at", { ascending: false, nullsFirst: false });

      if (ignore) {
        return;
      }

      if (error) {
        setMessage("記事を読み込めませんでした。articles テーブルを確認してください。");
        setArticles([]);
      } else {
        setArticles(data ?? []);
      }

      setArticlesLoading(false);
    }

    void loadArticles();

    return () => {
      ignore = true;
    };
  }, [selectedTopicId, articlesRefreshKey]);

  async function handleAddTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();

    if (!name) {
      setMessage("トピック名を入力してください。");
      return;
    }

    if (!supabase) {
      setMessage(".env.local に Supabase の URL と anon key を設定してください。");
      return;
    }

    setSavingTopic(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("topics")
      .insert({ name })
      .select("id, name, created_at")
      .single();

    setSavingTopic(false);

    if (error || !data) {
      setMessage("トピックを追加できませんでした。書き込み許可（RLS）を確認してください。");
      return;
    }

    form.reset();
    setTopics((current) => [...current, data]);
    setSelectedTopicId(data.id);
    setFeedUrlInput("");
  }

  async function handleMarkAsRead(articleId: string) {
    if (!supabase) {
      return;
    }

    setReadingId(articleId);
    setMessage(null);

    const { error } = await supabase
      .from("articles")
      .update({ is_read: true })
      .eq("id", articleId);

    setReadingId(null);

    if (error) {
      setMessage("既読に更新できませんでした。書き込み許可（RLS）を確認してください。");
      return;
    }

    setArticles((current) =>
      current.map((article) =>
        article.id === articleId ? { ...article, is_read: true } : article,
      ),
    );
  }

  async function handleCurateNow() {
    if (!selectedTopicId) {
      setMessage("先にトピックを選んでください。");
      return;
    }

    const trimmed = feedUrl.trim();
    if (!trimmed) {
      setMessage("RSS の URL を入力してください。例: https://www.nasa.gov/rss/dyn/breaking_news.rss");
      return;
    }

    setFeedUrl(selectedTopicId, trimmed);
    setCurating(true);
    setMessage(null);

    try {
      const result = await runCurateJob({
        topicId: selectedTopicId,
        feedUrl: trimmed,
      });
      setMessage(result.message);
      setArticlesRefreshKey((current) => current + 1);
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "取得に失敗しました。バックエンド（uvicorn）が起動しているか確認してください。";
      setMessage(text);
    } finally {
      setCurating(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Newspaper className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium leading-none">ニュースデスク</p>
            <p className="mt-1 text-xs text-muted-foreground">
              話題ごとに、未読の記事だけを追う
            </p>
          </div>
        </div>
      </header>

      {message ? (
        <div className="flex items-start gap-2 border-b bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{message}</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[46vh] w-full shrink-0 flex-col border-b bg-sidebar md:max-h-none md:w-80 md:border-r md:border-b-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-medium">トピック</h2>
            <span className="text-xs text-muted-foreground">{topics.length} 件</span>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 px-3 pb-3">
              {topicsLoading ? (
                <p className="px-2 py-6 text-sm text-muted-foreground">読み込み中...</p>
              ) : null}

              {!topicsLoading && topics.length === 0 ? (
                <p className="px-2 py-6 text-sm leading-6 text-muted-foreground">
                  まだトピックがありません。下の欄から追加できます。
                </p>
              ) : null}

              {topics.map((topic) => {
                const selected = topic.id === selectedTopicId;

                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => {
                      setMessage(null);
                      if (topic.id === selectedTopicId) {
                        return;
                      }
                      setArticles([]);
                      setArticlesLoading(true);
                      setSelectedTopicId(topic.id);
                      setFeedUrlInput(getFeedUrl(topic.id));
                    }}
                    className={cn(
                      "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                    aria-current={selected ? "true" : undefined}
                  >
                    {topic.name}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <form onSubmit={handleAddTopic} className="border-t p-4">
            <label htmlFor="topic-name" className="text-xs font-medium text-muted-foreground">
              新規トピック追加
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="topic-name"
                name="name"
                placeholder="例: 人工知能"
                disabled={savingTopic}
                autoComplete="off"
              />
              <Button type="submit" disabled={savingTopic || !isSupabaseConfigured}>
                <Plus />
                追加
              </Button>
            </div>
          </form>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 border-b px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-medium">
                  {selectedTopic ? selectedTopic.name : "記事"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedTopic
                    ? `未読 ${unreadCount} 件`
                    : "左のトピックを選ぶと、記事がここに並びます"}
                </p>
              </div>
              <Button
                type="button"
                variant={showRead ? "secondary" : "outline"}
                onClick={() => setShowRead((current) => !current)}
                aria-pressed={showRead}
              >
                {showRead ? "既読を隠す" : "既読を表示"}
              </Button>
            </div>

            {selectedTopic ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="feed-url"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    このトピックの RSS URL
                  </label>
                  <Input
                    id="feed-url"
                    className="mt-1.5"
                    value={feedUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFeedUrlInput(value);
                      setFeedUrl(selectedTopic.id, value);
                    }}
                    placeholder="例: https://www.nasa.gov/rss/dyn/breaking_news.rss"
                    disabled={curating}
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleCurateNow()}
                  disabled={curating || !selectedTopic}
                >
                  <RefreshCw className={cn(curating && "animate-spin")} />
                  {curating ? "取得中..." : "今すぐ取得"}
                </Button>
              </div>
            ) : null}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
              {!selectedTopic && !topicsLoading ? (
                <EmptyState text="トピックを選ぶと、その話題の記事がタイムラインで表示されます。" />
              ) : null}

              {selectedTopic && articlesLoading ? (
                <p className="py-10 text-sm text-muted-foreground">記事を読み込んでいます...</p>
              ) : null}

              {selectedTopic && !articlesLoading && visibleArticles.length === 0 ? (
                <EmptyState
                  text={
                    articles.length > 0
                      ? "未読の記事はありません。「既読を表示」を押すと、読んだ記事がグレーで残ります。"
                      : "このトピックの記事はまだありません。"
                  }
                />
              ) : null}

              {selectedTopic && !articlesLoading
                ? visibleArticles.map((article) => (
                    <ArticleCard
                      key={article.id}
                      article={article}
                      pending={readingId === article.id}
                      onMarkAsRead={() => handleMarkAsRead(article.id)}
                    />
                  ))
                : null}
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm leading-6 text-muted-foreground">
      {text}
    </div>
  );
}

function ArticleCard({
  article,
  pending,
  onMarkAsRead,
}: {
  article: Article;
  pending: boolean;
  onMarkAsRead: () => void;
}) {
  const level = toImportanceLevel(article.importance);

  return (
    <Card className={cn(article.is_read && "opacity-60 saturate-50")}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={importanceClassName[level]}>重要度 {importanceLabel[level]}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatPublishedAt(article.published_at)}
          </span>
          {article.is_read ? (
            <span className="text-xs text-muted-foreground">既読</span>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-lg leading-7">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-start gap-1.5 hover:underline"
          >
            {article.title}
            <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs font-medium tracking-wide text-muted-foreground">AI要約</p>
        <p className="mt-1.5 text-sm leading-7">
          {article.summary?.trim() ? article.summary : "要約はまだありません。"}
        </p>
      </CardContent>
      <CardFooter className="justify-end bg-transparent">
        <Button
          type="button"
          variant="outline"
          disabled={article.is_read || pending}
          onClick={onMarkAsRead}
        >
          <Check />
          {article.is_read ? "既読" : pending ? "更新中..." : "既読にする"}
        </Button>
      </CardFooter>
    </Card>
  );
}
