# Parches: nuevo flujo QC (Kapso + Odoo)

> Generado para aplicar en **Agent mode** o a mano. El workspace bloqueó ediciones a no-markdown mientras plan mode estaba activo.

## 1. Kapso — [`functions/print_qc_webhook_odoo.js`](../functions/print_qc_webhook_odoo.js)

Insertar **antes** de `async function resolvePrintPdfId`:

```javascript
/** PDF de pantalón / bermuda / etc.: no usar como arte de camiseta para QC (ej. *PANT*.pdf). */
function isNonJerseyPdfName(name) {
  const low = String(name || "").toLowerCase();
  if (low.includes("pantal") || low.includes("bermuda")) return true;
  if (/\bpant\b|pant\.\.|_pant| pant\.|\bpant\.|\(pant/i.test(low)) return true;
  if (/\bshorts?\b/.test(low)) return true;
  return false;
}
```

Reemplazar el cuerpo interno de `resolvePrintPdfId` desde `const skip = ...` hasta el cierre de `pickFromPdfList` (manteniendo el resto del `domain` / `search_read` igual) por:

```javascript
async function resolvePrintPdfId(executeKw, uid, taskId, triggerId, task) {
  const skip = (name) => {
    const low = String(name || "").toLowerCase();
    if (low.includes("muestra") && low.includes("color")) return true;
    if (low.includes("adic") && !low.includes("orden")) return true;
    return false;
  };

  const pickFromPdfList = (list) => {
    const candidates = list.filter((a) => !skip(a.name) && !isNonJerseyPdfName(a.name));
    if (!candidates.length) return null;
    const lowName = (a) => String(a.name || "").toLowerCase();
    if (triggerId) {
      const tr = candidates.find((a) => a.id === triggerId);
      if (tr) return tr.id;
    }
    const orden = candidates.filter((a) => lowName(a).includes("orden de trabajo"));
    if (orden.length === 1) return orden[0].id;
    if (orden.length > 1) {
      orden.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
      return orden[0].id;
    }
    const camHint = candidates.filter((a) => {
      const n = lowName(a);
      return (
        /\bcam\b/.test(n) ||
        n.includes("camiseta") ||
        n.includes("uniforme") ||
        n.includes("espalda")
      );
    });
    if (camHint.length >= 1) {
      camHint.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
      return camHint[0].id;
    }
    if (candidates.length === 1) return candidates[0].id;
    candidates.sort((a, b) => String(b.create_date).localeCompare(String(a.create_date)));
    return candidates[0].id;
  };
  // ... resto idéntico (domain pdfs task + sale.order)
}
```

## 2. Odoo — nuevo [`data/ir_config_parameter_qc_flow.xml`](../../odoo_website/lifedeportes_print_qc/data/ir_config_parameter_qc_flow.xml)

```xml
<?xml version="1.0" encoding="utf-8"?>
<odoo noupdate="1">
    <record id="param_auto_qc_on_pdf_attach" model="ir.config_parameter">
        <field name="key">lifedeportes_print_qc.auto_qc_on_pdf_attach</field>
        <field name="value">False</field>
    </record>
    <record id="param_kapso_webhook_url" model="ir.config_parameter">
        <field name="key">lifedeportes_print_qc.kapso_webhook_url</field>
        <field name="value"></field>
    </record>
    <record id="param_kapso_webhook_secret" model="ir.config_parameter">
        <field name="key">lifedeportes_print_qc.kapso_webhook_secret</field>
        <field name="value"></field>
    </record>
</odoo>
```

Añadir el archivo a `data` en [`__manifest__.py`](../../odoo_website/lifedeportes_print_qc/__manifest__.py).

## 3. Odoo — [`models/ir_attachment.py`](../../odoo_website/lifedeportes_print_qc/models/ir_attachment.py)

Después de `create`, solo disparar QC si el parámetro está activo:

```python
def create(self, vals_list):
    attachments = super().create(vals_list)
    auto = (
        self.env["ir.config_parameter"]
        .sudo()
        .get_param("lifedeportes_print_qc.auto_qc_on_pdf_attach", "False")
    )
    if str(auto).lower() not in ("1", "true", "yes"):
        return attachments
    pdf_on_task = attachments.filtered(...)
    ...
```

## 4. Odoo — [`models/project_task.py`](../../odoo_website/lifedeportes_print_qc/models/project_task.py)

- Añadir `_ld_non_jersey_pdf_name(name)` con la misma lógica que `isNonJerseyPdfName` (regex/re python).
- En `_ld_is_print_pdf_candidate`, devolver `False` si `_ld_non_jersey_pdf_name`.
- En `_ld_resolve_print_pdf`, tras filtrar candidatos, preferir nombre con `orden de trabajo`, luego palabras `cam`/`camiseta`/`uniforme`/`espalda` (orden por `create_date desc`).
- Añadir método `action_ld_print_qc_kapso(self)` con `urllib.request`, POST JSON `{"task_id": task.id, "event": "manual_odoo"}`, headers `Content-Type` + `X-LD-QC-Signature`, `UserError` si falta URL/secreto, `message_post` resumen (éxito HTTP / error).

Imports: `import re`, `import json`, `import urllib.error`, `import urllib.request`, `from odoo.exceptions import UserError`, `from odoo import _`.

## 5. Odoo — [`data/ir_actions_server.xml`](../../odoo_website/lifedeportes_print_qc/data/ir_actions_server.xml)

Segunda acción servidor:

```xml
<record id="ir_actions_server_task_kapso_print_qc" model="ir.actions.server">
    <field name="name">Auditar lista vs PDF (Kapso)</field>
    <field name="model_id" ref="project.model_project_task"/>
    <field name="binding_model_id" ref="project.model_project_task"/>
    <field name="binding_view_types">list,form</field>
    <field name="state">code</field>
    <field name="code">records.action_ld_print_qc_kapso()</field>
</record>
```

## 6. Odoo — [`views/project_task_views.xml`](../../odoo_website/lifedeportes_print_qc/views/project_task_views.xml)

Dentro de la página QC:

```xml
<button name="action_ld_print_qc_manual" type="object" string="Auditar (local)" class="btn-secondary"/>
<button name="action_ld_print_qc_kapso" type="object" string="Auditar (Kapso)" class="btn-primary"/>
```

## 7. Docs — [`docs/PRINT_QC_ODOO19_STUDIO_SETUP.md`](PRINT_QC_ODOO19_STUDIO_SETUP.md)

Tabla env Kapso: `PRINT_QC_COMPARE_MODE`, `PRINT_QC_NAME_NORMALIZE`, `PRINT_QC_NAME_EQUIVALENCE_JSON`, nota de exclusión nombres pantalón en `resolvePrintPdfId`.

---

**Siguiente paso:** abrir el chat en **Agent mode** y pedir “aplica IMPLEMENTATION_QC_FLOW_APPLY.md” o copiar parches manualmente.
