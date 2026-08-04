"""
Servicios de cotización Kapso-ready para Life Deportes.

Se apoyan en `mcp_odoo_executor` (odoo_connector) y NO dependen
de la capa de LLM, solo de datos ya estructurados.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol


class OdooExecutor(Protocol):
    def __call__(self, method: str, model: str, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        ...


@dataclass
class QuoteLine:
    product_id: int
    name: str
    quantity: float
    unit_price: float


@dataclass
class QuoteRequest:
    phone: str
    partner_id: int
    lines: List[QuoteLine]
    notes: Optional[str] = None


def _find_quote_template(executor: OdooExecutor) -> Optional[int]:
    """
    Busca la plantilla de presupuesto que incluye forma de pago 50/50.
    Asumimos que solo hay una: se puede filtrar por nombre si hace falta.
    """
    res = executor(
        "search_read",
        "sale.order.template",
        {
            "domain": [],
            "fields": ["id", "name"],
            "limit": 5,
        },
    )
    templates = res.get("result", []) if res.get("success") else []
    if not templates:
        return None
    # Si solo hay una, usarla. Si hay varias, se podría filtrar por nombre.
    return templates[0]["id"]


def _ensure_partner_for_phone(executor: OdooExecutor, phone: str) -> int:
    """Obtiene o crea el partner asociado a un número de WhatsApp."""
    phone_clean = phone.replace(" ", "")
    search = executor(
        "search_read",
        "res.partner",
        {
            "domain": [["phone", "=", phone_clean]],
            "fields": ["id"],
            "limit": 1,
        },
    )
    if search.get("success") and search.get("result"):
        return search["result"][0]["id"]

    create = executor(
        "create",
        "res.partner",
        {
            "vals": {
                "name": f"Cliente WhatsApp {phone_clean}",
                "phone": phone_clean,
            }
        },
    )
    if not create.get("success"):
        raise RuntimeError(f"No se pudo crear partner para {phone_clean}: {create.get('error')}")
    return create["result"]


def create_quote_with_template(req: QuoteRequest, executor: OdooExecutor) -> Dict[str, Any]:
    """
    Crea una cotización (sale.order) usando la plantilla de presupuesto 50/50.
    """
    template_id = _find_quote_template(executor)
    partner_id = req.partner_id or _ensure_partner_for_phone(executor, req.phone)

    order_vals: Dict[str, Any] = {
        "partner_id": partner_id,
        "note": req.notes or "",
    }
    if template_id:
        order_vals["sale_order_template_id"] = template_id

    # Crear sale.order vacío primero (la plantilla puede inyectar líneas).
    create_res = executor(
        "create",
        "sale.order",
        {
            "vals": order_vals,
        },
    )
    if not create_res.get("success"):
        raise RuntimeError(f"Error creando sale.order: {create_res.get('error')}")
    order_id = create_res["result"]

    # Agregar / ajustar líneas específicas del pedido.
    for line in req.lines:
        executor(
            "create",
            "sale.order.line",
            {
                "vals": {
                    "order_id": order_id,
                    "product_id": line.product_id,
                    "name": line.name,
                    "product_uom_qty": line.quantity,
                    "price_unit": line.unit_price,
                }
            },
        )

    return {"order_id": order_id, "partner_id": partner_id}

