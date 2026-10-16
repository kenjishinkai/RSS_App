"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  LogOut,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
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
import {
  AuthRequiredError,
  type AuthUser,
  fetchMe,
  logoutUser,
} from "@/lib/auth";
import {
  createTopic,
  deleteArticle,
  deleteTopic,
  fetchArticles,
  fetchTopics,
  markArticleFavorite,
  markArticleRead,
  runCurateJob,
  unmarkArticleFavorite,
  updateTopic,
} from "@/lib/backend";
import { withLog } from "@/lib/logging";
import {
  importanceLabel,
  toImportanceLevel,
  type Article,
  type Topic,
} from "@/lib/types";
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
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [editTopicName, setEditTopicName] = useState("");
  const [updatingTopic, setUpdatingTopic] = useState(false);
  const [deletingTopic, setDeletingTopic] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [favoritingId, setFavoritingId] = useState<string | null>(null);
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(
    null,
  );
  const [showRead, setShowRead] = useState(false);
  const [curating, setCurating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [articlesRefreshKey, setArticlesRefreshKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const selectedTopic =
    topics.find((topic) => topic.id === selectedTopicId) ?? null;
  const visibleArticles = showRead
    ? articles
    : articles.filter((article) => !article.is_read);
  const unreadCount = articles.filter((article) => !article.is_read).length;

  function redirectToLogin() {
    router.replace("/login");
  }

  useEffect(() => {
    let ignore = false;

    async function checkAuthAndLoadTopics() {
      await withLog("checkAuthAndLoadTopics", {}, async () => {
        try {
          const me = await fetchMe();
          if (ignore) {
            return;
          }
          setUser(me);
          setAuthChecking(false);

          const nextTopics = await fetchTopics();
          if (ignore) {
            return;
          }
          const firstTopicId = nextTopics[0]?.id ?? null;
          setTopics(nextTopics);
          setSelectedTopicId(firstTopicId);
          if (nextTopics.length > 0) {
            setArticlesLoading(true);
          }
          setTopicsLoading(false);
        } catch (error) {
          if (ignore) {
            return;
          }
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "トピックを読み込めませんでした。バックエンド（uvicorn）が起動しているか確認してください。",
          );
          setAuthChecking(false);
          setTopicsLoading(false);
          throw error;
        }
      });
    }

    void checkAuthAndLoadTopics().catch(() => {
      if (!ignore) {
        setAuthChecking(false);
        setTopicsLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedTopicId) {
      return;
    }

    const topicId = selectedTopicId;
    let ignore = false;

    async function loadArticles() {
      await withLog("loadArticles", { topicId }, async () => {
        setArticlesLoading(true);
        try {
          const data = await fetchArticles(topicId);
          if (ignore) {
            return;
          }
          setArticles(data);
          setArticlesLoading(false);
        } catch (error) {
          if (ignore) {
            return;
          }
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "記事を読み込めませんでした。",
          );
          setArticles([]);
          setArticlesLoading(false);
          throw error;
        }
      });
    }

    void loadArticles().catch(() => {
      setArticlesLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [selectedTopicId, articlesRefreshKey, router]);

  async function handleAddTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();

    await withLog("handleAddTopic", { name }, async () => {
      if (!name) {
        setMessage("トピック名を入力してください。");
        return;
      }

      setSavingTopic(true);
      setMessage(null);

      try {
        const data = await createTopic(name);
        setSavingTopic(false);
        form.reset();
        setTopics((current) => [...current, data]);
        setSelectedTopicId(data.id);
        setEditingTopic(false);
      } catch (error) {
        setSavingTopic(false);
        if (error instanceof AuthRequiredError) {
          redirectToLogin();
          return;
        }
        setMessage(
          error instanceof Error
            ? error.message
            : "トピックを追加できませんでした。",
        );
        throw error;
      }
    }).catch(() => {
      setSavingTopic(false);
    });
  }

  async function handleUpdateTopic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTopic) {
      return;
    }

    const name = editTopicName.trim();
    await withLog(
      "handleUpdateTopic",
      { topicId: selectedTopic.id, name },
      async () => {
        if (!name) {
          setMessage("トピック名を入力してください。");
          return;
        }

        setUpdatingTopic(true);
        setMessage(null);

        try {
          const updated = await updateTopic(selectedTopic.id, name);
          setTopics((current) =>
            current.map((topic) =>
              topic.id === updated.id ? updated : topic,
            ),
          );
          setEditingTopic(false);
          setUpdatingTopic(false);
        } catch (error) {
          setUpdatingTopic(false);
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "トピックを更新できませんでした。",
          );
          throw error;
        }
      },
    ).catch(() => {
      setUpdatingTopic(false);
    });
  }

  async function handleDeleteTopic() {
    if (!selectedTopic) {
      return;
    }

    const confirmed = window.confirm(
      `トピック「${selectedTopic.name}」を削除しますか？\n記事が残っている場合は削除できません。`,
    );
    if (!confirmed) {
      return;
    }

    await withLog(
      "handleDeleteTopic",
      { topicId: selectedTopic.id },
      async () => {
        setDeletingTopic(true);
        setMessage(null);

        try {
          const deletedId = selectedTopic.id;
          await deleteTopic(deletedId);
          const nextTopics = topics.filter((topic) => topic.id !== deletedId);
          setTopics(nextTopics);
          setSelectedTopicId(nextTopics[0]?.id ?? null);
          setArticles([]);
          setEditingTopic(false);
          setDeletingTopic(false);
          setMessage("トピックを削除しました。");
        } catch (error) {
          setDeletingTopic(false);
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "トピックを削除できませんでした。",
          );
          throw error;
        }
      },
    ).catch(() => {
      setDeletingTopic(false);
    });
  }

  async function handleMarkAsRead(articleId: string) {
    await withLog("handleMarkAsRead", { articleId }, async () => {
      setReadingId(articleId);
      setMessage(null);

      try {
        await markArticleRead(articleId);
        setReadingId(null);
        setArticles((current) =>
          current.map((article) =>
            article.id === articleId ? { ...article, is_read: true } : article,
          ),
        );
      } catch (error) {
        setReadingId(null);
        if (error instanceof AuthRequiredError) {
          redirectToLogin();
          return;
        }
        setMessage(
          error instanceof Error
            ? error.message
            : "既読に更新できませんでした。",
        );
        throw error;
      }
    }).catch(() => {
      setReadingId(null);
    });
  }

  async function handleToggleFavorite(article: Article) {
    await withLog(
      "handleToggleFavorite",
      { articleId: article.id, next: !article.is_favorite },
      async () => {
        setFavoritingId(article.id);
        setMessage(null);

        try {
          const updated = article.is_favorite
            ? await unmarkArticleFavorite(article.id)
            : await markArticleFavorite(article.id);
          setFavoritingId(null);
          setArticles((current) =>
            current.map((row) => (row.id === updated.id ? updated : row)),
          );
        } catch (error) {
          setFavoritingId(null);
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "お気に入りの更新に失敗しました。",
          );
          throw error;
        }
      },
    ).catch(() => {
      setFavoritingId(null);
    });
  }

  async function handleDeleteArticle(article: Article) {
    const confirmed = window.confirm(
      `記事「${article.title}」を削除しますか？\n削除すると全員の一覧から消えます。`,
    );
    if (!confirmed) {
      return;
    }

    await withLog(
      "handleDeleteArticle",
      { articleId: article.id },
      async () => {
        setDeletingArticleId(article.id);
        setMessage(null);

        try {
          await deleteArticle(article.id);
          setDeletingArticleId(null);
          setArticles((current) =>
            current.filter((row) => row.id !== article.id),
          );
          setMessage("記事を削除しました。");
        } catch (error) {
          setDeletingArticleId(null);
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          setMessage(
            error instanceof Error
              ? error.message
              : "記事を削除できませんでした。",
          );
          throw error;
        }
      },
    ).catch(() => {
      setDeletingArticleId(null);
    });
  }

  async function handleCurateNow() {
    if (!selectedTopic) {
      setMessage("先にトピックを選んでください。");
      return;
    }

    await withLog(
      "handleCurateNow",
      { topicId: selectedTopic.id, topicName: selectedTopic.name },
      async () => {
        setCurating(true);
        setMessage(null);

        try {
          const result = await runCurateJob({
            topicId: selectedTopic.id,
            topicName: selectedTopic.name,
          });
          setMessage(result.message);
          setArticlesRefreshKey((current) => current + 1);
        } catch (error) {
          if (error instanceof AuthRequiredError) {
            redirectToLogin();
            return;
          }
          const text =
            error instanceof Error
              ? error.message
              : "取得に失敗しました。バックエンド（uvicorn）が起動しているか確認してください。";
          setMessage(text);
          throw error instanceof Error ? error : new Error(text);
        } finally {
          setCurating(false);
        }
      },
    ).catch(() => {
      setCurating(false);
    });
  }

  async function handleLogout() {
    await withLog("handleLogout", {}, async () => {
      setLoggingOut(true);
      try {
        await logoutUser();
        router.replace("/login");
      } catch (error) {
        setLoggingOut(false);
        setMessage(
          error instanceof Error
            ? error.message
            : "ログアウトに失敗しました。",
        );
        throw error;
      }
    }).catch(() => {
      setLoggingOut(false);
    });
  }

  if (authChecking) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        ログイン確認中...
      </div>
    );
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
        <div className="flex items-center gap-2">
          {user ? (
            <span className="hidden max-w-[12rem] truncate text-xs text-muted-foreground sm:inline">
              {user.email}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
          >
            <LogOut />
            {loggingOut ? "処理中..." : "ログアウト"}
          </Button>
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
            <span className="text-xs text-muted-foreground">
              {topics.length} 件
            </span>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-1 px-3 pb-3">
              {topicsLoading ? (
                <p className="px-2 py-6 text-sm text-muted-foreground">
                  読み込み中...
                </p>
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
                      setEditingTopic(false);
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
            <label
              htmlFor="topic-name"
              className="text-xs font-medium text-muted-foreground"
            >
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
              <Button
                type="submit"
                disabled={savingTopic}
              >
                <Plus />
                追加
              </Button>
            </div>
          </form>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 border-b px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-medium">
                  {selectedTopic ? selectedTopic.name : "記事"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedTopic
                    ? `未読 ${unreadCount} 件`
                    : "左のトピックを選ぶと、記事がここに並びます"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedTopic ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updatingTopic || deletingTopic}
                      onClick={() => {
                        setEditTopicName(selectedTopic.name);
                        setEditingTopic((current) => !current);
                        setMessage(null);
                      }}
                    >
                      <Pencil />
                      {editingTopic ? "編集をやめる" : "名前を編集"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={updatingTopic || deletingTopic}
                      onClick={() => void handleDeleteTopic()}
                    >
                      <Trash2 />
                      {deletingTopic ? "削除中..." : "削除"}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant={showRead ? "secondary" : "outline"}
                  onClick={() => setShowRead((current) => !current)}
                  aria-pressed={showRead}
                >
                  {showRead ? "既読を隠す" : "既読を表示"}
                </Button>
                {selectedTopic ? (
                  <Button
                    type="button"
                    onClick={() => void handleCurateNow()}
                    disabled={curating}
                  >
                    <RefreshCw className={cn(curating && "animate-spin")} />
                    {curating ? "取得中..." : "今すぐ取得"}
                  </Button>
                ) : null}
              </div>
            </div>
            {selectedTopic && editingTopic ? (
              <form
                onSubmit={handleUpdateTopic}
                className="flex flex-wrap items-end gap-2"
              >
                <div className="min-w-[12rem] flex-1">
                  <label
                    htmlFor="edit-topic-name"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    トピック名
                  </label>
                  <Input
                    id="edit-topic-name"
                    value={editTopicName}
                    onChange={(event) => setEditTopicName(event.target.value)}
                    disabled={updatingTopic}
                    className="mt-1.5"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" disabled={updatingTopic}>
                  {updatingTopic ? "保存中..." : "保存"}
                </Button>
              </form>
            ) : null}
            {selectedTopic ? (
              <p className="text-xs text-muted-foreground">
                「今すぐ取得」で Google News（日本）から「{selectedTopic.name}
                」の最新記事 1 件を取り込みます。記事があるトピックは削除できません。
              </p>
            ) : null}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
              {!selectedTopic && !topicsLoading ? (
                <EmptyState text="トピックを選ぶと、その話題の記事がタイムラインで表示されます。" />
              ) : null}

              {selectedTopic && articlesLoading ? (
                <p className="py-10 text-sm text-muted-foreground">
                  記事を読み込んでいます...
                </p>
              ) : null}

              {selectedTopic &&
              !articlesLoading &&
              visibleArticles.length === 0 ? (
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
                      pendingRead={readingId === article.id}
                      pendingFavorite={favoritingId === article.id}
                      pendingDelete={deletingArticleId === article.id}
                      onMarkAsRead={() => handleMarkAsRead(article.id)}
                      onToggleFavorite={() => handleToggleFavorite(article)}
                      onDelete={() => handleDeleteArticle(article)}
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
  pendingRead,
  pendingFavorite,
  pendingDelete,
  onMarkAsRead,
  onToggleFavorite,
  onDelete,
}: {
  article: Article;
  pendingRead: boolean;
  pendingFavorite: boolean;
  pendingDelete: boolean;
  onMarkAsRead: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const level = toImportanceLevel(article.importance);

  return (
    <Card className={cn(article.is_read && "opacity-60 saturate-50")}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={importanceClassName[level]}>
            重要度 {importanceLabel[level]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatPublishedAt(article.published_at)}
          </span>
          {article.is_read ? (
            <span className="text-xs text-muted-foreground">既読</span>
          ) : null}
          {article.is_favorite ? (
            <span className="text-xs text-amber-700">お気に入り</span>
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
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          AI要約
        </p>
        <p className="mt-1.5 text-sm leading-7">
          {article.summary?.trim() ? article.summary : "要約はまだありません。"}
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-2 bg-transparent">
        <Button
          type="button"
          variant="destructive"
          disabled={pendingDelete}
          onClick={onDelete}
        >
          <Trash2 />
          {pendingDelete ? "削除中..." : "削除"}
        </Button>
        <Button
          type="button"
          variant={article.is_favorite ? "secondary" : "outline"}
          disabled={pendingFavorite || pendingDelete}
          onClick={onToggleFavorite}
          aria-pressed={article.is_favorite}
        >
          <Star
            className={cn(article.is_favorite && "fill-current text-amber-500")}
          />
          {pendingFavorite
            ? "更新中..."
            : article.is_favorite
              ? "お気に入り解除"
              : "お気に入り"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={article.is_read || pendingRead || pendingDelete}
          onClick={onMarkAsRead}
        >
          <Check />
          {article.is_read ? "既読" : pendingRead ? "更新中..." : "既読にする"}
        </Button>
      </CardFooter>
    </Card>
  );
}
