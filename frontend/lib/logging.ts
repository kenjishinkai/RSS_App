/**
 * フロントの開始／終了／例外ログ。
 * ブラウザから /api/logs へ送り、サーバーが Logs/frontend_YYYY-MM-DD.log に書く。
 * コンソールには出さない。
 */

type LogLevel = "INFO" | "ERROR";

const SENSITIVE = ["api_key", "key", "password", "token", "secret", "anon", "service_role"];

function shortRepr(value: unknown, limit = 80): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  let text: string;
  try {
    text = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length > limit) {
    return `${text.slice(0, limit - 1)}…`;
  }
  return text;
}

function formatArgs(args: unknown): string {
  if (args === undefined) {
    return "";
  }
  if (Array.isArray(args)) {
    return args.map((item) => shortRepr(item)).join(", ");
  }
  if (args && typeof args === "object") {
    return Object.entries(args as Record<string, unknown>)
      .map(([name, value]) => {
        const lowered = name.toLowerCase();
        if (SENSITIVE.some((word) => lowered.includes(word))) {
          return `${name}=***`;
        }
        return `${name}=${shortRepr(value)}`;
      })
      .join(", ");
  }
  return shortRepr(args);
}

async function sendLog(level: LogLevel, message: string, detail?: string) {
  try {
    await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message, detail }),
      keepalive: true,
    });
  } catch {
    // ログ失敗で本処理を止めない
  }
}

/** 関数の開始・終了・例外をファイルログに残す。例外は再送出する。 */
export async function withLog<T>(
  name: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  await sendLog("INFO", `開始: ${name}(${formatArgs(args)})`);
  try {
    const result = await fn();
    await sendLog("INFO", `終了: ${name}`);
    return result;
  } catch (error) {
    const detail =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ""}`
        : String(error);
    await sendLog("ERROR", `例外: ${name}`, detail);
    throw error;
  }
}
