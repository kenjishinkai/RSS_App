"""AI 要約・重要度サービス。

役割: 記事本文（または RSS の短い説明）から summary と importance を作る。
たとえ: 編集部が記事を読み、「一言まとめ」と「高・中・低」の札を付ける。

手順:
1. OPENAI_API_KEY があれば OpenAI API で要約を生成する
2. importance は high / medium / low に正規化する
3. キー未設定や失敗時は、安全なデフォルト（短い要約 or タイトル、importance=low）にする
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_MAX_INPUT_CHARS = 4000
_MAX_SUMMARY_CHARS = 280

_SYSTEM_PROMPT = """あなたは日本語のニュース編集者です。
与えられたタイトルと本文（または短い説明）から、次の JSON だけを返してください。
他の文章は書かないでください。

{
  "summary": "日本語で2〜3文の要約。事実を簡潔に。",
  "importance": "high | medium | low のいずれか"
}

重要度の目安:
- high: 重大な発表、大きな事故、政策変更、市場に強く影響しそうな話
- medium: 一般的に注目されそうなニュース
- low: 軽い話題、短報、影響が限定的なもの
"""


@dataclass(frozen=True)
class ArticleEnrichment:
    summary: str | None
    importance: str
    used_ai: bool = False


def enrich_article(
    title: str,
    content: str | None = None,
    settings: Settings | None = None,
) -> ArticleEnrichment:
    """タイトルと本文から要約・重要度を返す。"""
    cfg = settings or get_settings()
    clean_title = (title or "").strip() or "無題"
    clean_content = (content or "").strip() or None

    if not cfg.is_openai_configured:
        return _fallback(clean_title, clean_content, used_ai=False)

    try:
        return _enrich_with_openai(clean_title, clean_content, cfg)
    except Exception as exc:
        logger.warning("AI 要約に失敗したためフォールバックします: %s", exc)
        return _fallback(clean_title, clean_content, used_ai=False)


def normalize_importance(value: str | None) -> str:
    """重要度の表記ゆれを high / medium / low に揃える。"""
    normalized = (value or "").strip().lower()

    if normalized in {"high", "高", "高い", "重要"}:
        return "high"
    if normalized in {"medium", "mid", "中", "中程度", "普通"}:
        return "medium"
    if normalized in {"low", "低", "低い"}:
        return "low"

    # 英語の一部表現にも軽く対応
    if "high" in normalized or "critical" in normalized:
        return "high"
    if "medium" in normalized or "moderate" in normalized:
        return "medium"
    return "low"


def _enrich_with_openai(
    title: str,
    content: str | None,
    settings: Settings,
) -> ArticleEnrichment:
    body_text = content or "（本文なし。タイトルのみから判断してください）"
    user_prompt = (
        f"タイトル: {title}\n\n"
        f"本文または説明:\n{body_text[:_MAX_INPUT_CHARS]}"
    )

    payload = {
        "model": settings.openai_model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }

    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            _OPENAI_URL,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    raw_text = _extract_message_text(data)
    parsed = _parse_json_object(raw_text)
    summary = _clip_summary(str(parsed.get("summary") or "").strip() or None)
    if not summary:
        summary = _fallback_summary(title, content)

    return ArticleEnrichment(
        summary=summary,
        importance=normalize_importance(str(parsed.get("importance") or "")),
        used_ai=True,
    )


def _extract_message_text(data: dict[str, Any]) -> str:
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError("OpenAI の応答形式が想定外です") from exc

    if isinstance(content, list):
        # 一部の応答は parts 配列になることがある
        texts = [
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict)
        ]
        return "\n".join(texts).strip()

    if not isinstance(content, str) or not content.strip():
        raise ValueError("OpenAI の応答が空です")
    return content.strip()


def _parse_json_object(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # 余計な前後テキストが付いた場合に備える
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        raise ValueError("JSON を取り出せませんでした")
    parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("JSON オブジェクトではありません")
    return parsed


def _fallback(
    title: str,
    content: str | None,
    *,
    used_ai: bool,
) -> ArticleEnrichment:
    return ArticleEnrichment(
        summary=_fallback_summary(title, content),
        importance="low",
        used_ai=used_ai,
    )


def _fallback_summary(title: str, content: str | None) -> str:
    if content:
        return _clip_summary(content) or title
    return _clip_summary(title) or title


def _clip_summary(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        return None
    if len(cleaned) <= _MAX_SUMMARY_CHARS:
        return cleaned
    return cleaned[: _MAX_SUMMARY_CHARS - 1].rstrip() + "…"
