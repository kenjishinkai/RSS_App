import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

const backendUrl = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql+psycopg://newsdesk:newsdesk@127.0.0.1:5432/newsdesk_test";

function seedArticle(topicId: string, title: string): void {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const python = path.join(
    repoRoot,
    "backend",
    ".venv",
    "Scripts",
    "python.exe",
  );
  const script = `
import os, uuid, sys
os.environ["DATABASE_URL"] = ${JSON.stringify(databaseUrl)}
sys.path.insert(0, ${JSON.stringify(path.join(repoRoot, "backend"))})
sys.path.insert(0, ${JSON.stringify(repoRoot)})
from app.config import get_settings
from app.db import reset_engine, get_session_factory
from db.models import Article
get_settings.cache_clear()
reset_engine()
session = get_session_factory()()
try:
    row = Article(
        topic_id=uuid.UUID(${JSON.stringify(topicId)}),
        title=${JSON.stringify(title)},
        url=f"https://example.com/e2e/{uuid.uuid4().hex}",
        summary="E2E seed",
        importance="medium",
        is_read=False,
        is_favorite=False,
    )
    session.add(row)
    session.commit()
finally:
    session.close()
`;
  const result = spawnSync(python, ["-c", script], {
    encoding: "utf-8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.status !== 0) {
    throw new Error(
      `記事シード失敗: ${result.stderr || result.stdout || result.status}`,
    );
  }
}

test.describe("認証・トピック・記事", () => {
  test.beforeAll(async ({ request }) => {
    const health = await request.get(`${backendUrl}/health`);
    expect(
      health.ok(),
      `backend が起動していません（テスト DB で uvicorn を起動してください）: ${backendUrl}/health`,
    ).toBeTruthy();
  });

  test("登録→トピック追加→ログアウト", async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = "password123";

    await page.goto("/register");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill(password);
    await page.getByRole("button", { name: "登録する" }).click();

    await expect(page.getByText("ニュースデスク").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(email)).toBeVisible();

    const topicName = `E2E話題-${Date.now()}`;
    await page.getByPlaceholder("例: 人工知能").fill(topicName);
    await page.getByRole("button", { name: "追加" }).click();
    await expect(page.getByRole("button", { name: topicName })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "ログアウト" }).click();
    await expect(page.getByRole("heading", { name: /ログイン/ })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /ログイン/ })).toBeVisible();
  });

  test("記事のお気に入りと削除", async ({ page }) => {
    const email = `e2e-art-${Date.now()}@example.com`;
    const password = "password123";

    await page.goto("/register");
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード（8文字以上）").fill(password);
    await page.getByRole("button", { name: "登録する" }).click();
    await expect(page.getByText("ニュースデスク").first()).toBeVisible({
      timeout: 15_000,
    });

    const topicName = `記事あり-${Date.now()}`;
    await page.getByPlaceholder("例: 人工知能").fill(topicName);
    await page.getByRole("button", { name: "追加" }).click();
    await expect(page.getByRole("button", { name: topicName })).toBeVisible();

    const topics = await page.request.get(`${backendUrl}/topics`);
    expect(topics.ok()).toBeTruthy();
    const topicList = (await topics.json()) as { id: string; name: string }[];
    const topic = topicList.find((row) => row.name === topicName);
    expect(topic).toBeTruthy();

    const title = `E2E記事-${Date.now()}`;
    seedArticle(topic!.id, title);

    await page.reload();
    await expect(page.getByText("ニュースデスク").first()).toBeVisible({
      timeout: 15_000,
    });
    // リロード後は先頭トピックが選ばれるので、シードしたトピックを選び直す
    await page.getByRole("button", { name: topicName }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    const card = page.locator('[data-slot="card"]').filter({ hasText: title });
    await card.getByRole("button", { name: "お気に入り", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "お気に入り解除" }),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "削除", exact: true }).click();
    await expect(page.getByText(title)).toHaveCount(0, { timeout: 10_000 });
  });
});
