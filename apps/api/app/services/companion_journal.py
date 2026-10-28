from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CompanionConversation, CompanionMessage, User

GENERAL_CONTEXT_TITLE = "通用学伴"


def resolve_conversation_ref(scope: str, context: dict | None) -> tuple[str, str]:
    """Return (context_ref, context_title) used to group companion conversations."""
    if context is None:
        return "general", GENERAL_CONTEXT_TITLE

    route_key = str(context.get("route_key") or "").strip()
    context_ref = route_key[:80] if route_key else f"{scope}:unknown"
    title = str(context.get("title") or "").strip()
    subtitle = str(context.get("subtitle") or "").strip()
    if title and subtitle:
        context_title = f"{title} · {subtitle}"
    else:
        context_title = title or subtitle or GENERAL_CONTEXT_TITLE
    return context_ref, context_title[:255]


def get_or_create_conversation(
    db: Session,
    user: User,
    scope: str,
    context: dict | None,
) -> CompanionConversation:
    context_ref, context_title = resolve_conversation_ref(scope, context)
    conversation = db.scalar(
        select(CompanionConversation).where(
            CompanionConversation.user_id == user.id,
            CompanionConversation.scope == scope,
            CompanionConversation.context_ref == context_ref,
        )
    )
    if conversation is not None:
        if not conversation.context_title:
            conversation.context_title = context_title
        return conversation

    conversation = CompanionConversation(
        user_id=user.id,
        scope=scope,
        context_ref=context_ref,
        context_title=context_title,
    )
    db.add(conversation)
    db.flush()
    return conversation


def summarize_attachments(attachments: list[Any]) -> str | None:
    if not attachments:
        return None

    parts: list[str] = []
    for attachment in attachments:
        name = str(getattr(attachment, "name", "") or "附件")
        mime_type = str(getattr(attachment, "mime_type", "") or "application/octet-stream")
        size_kb = getattr(attachment, "size_kb", 0) or 0
        parts.append(f"{name} ({mime_type}, {size_kb} KB)")
    return "; ".join(parts)[:1000]


def append_companion_message(
    db: Session,
    conversation: CompanionConversation,
    *,
    role: str,
    content: str,
    provider_name: str | None = None,
    provider_mode: str | None = None,
    attachment_summary: str | None = None,
    is_blocked: bool = False,
    blocked_category: str | None = None,
    blocked_keyword: str | None = None,
) -> CompanionMessage:
    message = CompanionMessage(
        conversation_id=conversation.id,
        role=role,
        content=content,
        provider_name=provider_name,
        provider_mode=provider_mode,
        attachment_summary=attachment_summary,
        is_blocked=is_blocked,
        blocked_category=blocked_category,
        blocked_keyword=blocked_keyword,
    )
    db.add(message)
    conversation.message_count = (conversation.message_count or 0) + 1
    if is_blocked:
        conversation.blocked_count = (conversation.blocked_count or 0) + 1
    db.flush()
    return message
