"""/api/rules — klasor kurallari CRUD (PRD §33/§34/§57).

Kural motoru `services/rules.py` (match/sort) ve `services/rule_engine.py`
(DB baglanti adaptoru) tarafindan kullanilir; bu modul yalnizca yonetim API'sidir.
`priority` kucuk olan kural once denenir (PRD §34).
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import NotFoundError, ValidationError
from ...models import Device, Rule, Target
from ...schemas import RuleCreateRequest, RuleResponse, RuleUpdateRequest
from ...security import audit
from ..deps import current_device_or_loopback, get_session

router = APIRouter(prefix="/rules", tags=["rules"])


async def _get_rule(session: AsyncSession, rule_id: str) -> Rule:
    rule = await session.get(Rule, rule_id)
    if rule is None:
        raise NotFoundError("Kural bulunamadi.")
    return rule


async def _target_name(session: AsyncSession, target_id: str) -> str | None:
    target = await session.get(Target, target_id)
    return target.name if target else None


def _to_response(rule: Rule, target_name: str | None) -> RuleResponse:
    return RuleResponse(
        id=rule.id,
        name=rule.name,
        priority=int(rule.priority),
        enabled=bool(rule.enabled),
        match_type=rule.match_type,  # type: ignore[arg-type]
        match_value=rule.match_value,
        target_id=rule.target_id,
        target_name=target_name,
        rename=rule.rename,
        conflict_policy=rule.conflict_policy,  # type: ignore[arg-type]
        created_at=rule.created_at,
    )


async def _next_priority(session: AsyncSession) -> int:
    """PRD §34 — mevcut en yuksek onceligin bir ustu; kural yoksa 0."""
    current_max = (await session.execute(select(func.max(Rule.priority)))).scalar_one_or_none()
    return (current_max if current_max is not None else -1) + 1


async def _require_enabled_target(session: AsyncSession, target_id: str) -> Target:
    """Hedef mevcut VE etkin olmali; aksi halde `targets` servisindeki mesajla tutarli hata."""
    target = await session.get(Target, target_id)
    if target is None or not target.enabled:
        raise ValidationError("Hedef bulunamadi.")
    return target


@router.get("", response_model=list[RuleResponse])
async def list_rules(
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> list[RuleResponse]:
    """Tum kurallar; LEFT JOIN ile hedef adi (hedef silinmisse null — PRD §34)."""
    rows = (
        await session.execute(
            select(Rule, Target.name)
            .outerjoin(Target, Target.id == Rule.target_id)
            .order_by(Rule.priority.asc(), Rule.id.asc())
        )
    ).all()
    return [_to_response(rule, target_name) for rule, target_name in rows]


@router.post("", response_model=RuleResponse, status_code=201)
async def create_rule(
    payload: RuleCreateRequest,
    device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> RuleResponse:
    target = await _require_enabled_target(session, payload.target_id)
    priority = payload.priority if payload.priority is not None else await _next_priority(session)
    rule = Rule(
        id=secrets.token_hex(6),
        name=str(payload.name),
        priority=int(priority),
        enabled=bool(payload.enabled),
        match_type=str(payload.match_type),
        match_value=str(payload.match_value),
        target_id=str(payload.target_id),
        rename=payload.rename,
        conflict_policy=str(payload.conflict_policy),
    )
    session.add(rule)
    await session.flush()
    await audit.record_audit(
        session,
        audit.RULE_CREATED,
        device_id=device.id if device else None,
        detail={"rule_id": rule.id, "name": rule.name, "target_id": rule.target_id},
    )
    return _to_response(rule, target.name)


@router.put("/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: str,
    payload: RuleUpdateRequest,
    device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> RuleResponse:
    rule = await _get_rule(session, rule_id)
    if payload.target_id is not None and payload.target_id != rule.target_id:
        target = await _require_enabled_target(session, payload.target_id)
        rule.target_id = str(payload.target_id)
    else:
        target = await session.get(Target, rule.target_id)

    if payload.name is not None:
        rule.name = str(payload.name)
    if payload.match_type is not None:
        rule.match_type = str(payload.match_type)
    if payload.match_value is not None:
        rule.match_value = str(payload.match_value)
    if payload.rename is not None:
        # Bos string schema validator'de None'a cevrilir (bos = degeri degistirmez).
        rule.rename = payload.rename
    if payload.conflict_policy is not None:
        rule.conflict_policy = str(payload.conflict_policy)
    if payload.priority is not None:
        rule.priority = int(payload.priority)
    if payload.enabled is not None:
        rule.enabled = bool(payload.enabled)

    await session.flush()
    await audit.record_audit(
        session,
        audit.RULE_CHANGED,
        device_id=device.id if device else None,
        detail={"rule_id": rule.id, "target_id": rule.target_id},
    )
    return _to_response(rule, target.name if target else None)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: str,
    device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> Response:
    rule = await _get_rule(session, rule_id)
    await session.delete(rule)
    await session.flush()
    await audit.record_audit(
        session,
        audit.RULE_REMOVED,
        device_id=device.id if device else None,
        detail={"rule_id": rule_id},
    )
    return Response(status_code=204)
