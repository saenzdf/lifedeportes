"""
Tenant context resolver for single-agent multi-tenant isolation.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional


@dataclass
class TenantContext:
    tenant_id: str
    tenant_name: str
    policy_set: str
    secret_prefix: str


REGISTRY_PATH = Path(__file__).with_name("tenant_registry.json")


def _load_registry() -> Dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def resolve_tenant(phone_number: str, phone_number_id: Optional[str] = None) -> TenantContext:
    registry = _load_registry()
    tenants = registry.get("tenants", [])
    default_id = registry.get("default_tenant_id")

    normalized = "".join(ch for ch in (phone_number or "") if ch.isdigit())
    for tenant in tenants:
        allowed_numbers = set(tenant.get("allowed_whatsapp_numbers", []))
        allowed_ids = set(tenant.get("allowed_phone_number_ids", []))
        if normalized and normalized in allowed_numbers:
            return TenantContext(
                tenant_id=tenant["id"],
                tenant_name=tenant["name"],
                policy_set=tenant.get("policy_set", "sales_default_v1"),
                secret_prefix=tenant.get("secret_prefix", ""),
            )
        if phone_number_id and phone_number_id in allowed_ids:
            return TenantContext(
                tenant_id=tenant["id"],
                tenant_name=tenant["name"],
                policy_set=tenant.get("policy_set", "sales_default_v1"),
                secret_prefix=tenant.get("secret_prefix", ""),
            )

    fallback = next((t for t in tenants if t["id"] == default_id), tenants[0] if tenants else None)
    if not fallback:
        return TenantContext(
            tenant_id="unknown",
            tenant_name="Unknown Tenant",
            policy_set="sales_default_v1",
            secret_prefix="",
        )

    return TenantContext(
        tenant_id=fallback["id"],
        tenant_name=fallback["name"],
        policy_set=fallback.get("policy_set", "sales_default_v1"),
        secret_prefix=fallback.get("secret_prefix", ""),
    )


def build_tenant_prompt_block(context: TenantContext) -> str:
    return (
        "### TENANT CONTEXT\n"
        f"- tenant_id: {context.tenant_id}\n"
        f"- tenant_name: {context.tenant_name}\n"
        f"- policy_set: {context.policy_set}\n"
        "- Aisla datos y operaciones a este tenant.\n"
    )
