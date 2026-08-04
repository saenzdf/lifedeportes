/** @odoo-module **/

/*
 *  Life Deportes — Componente OWL del formulario de cotización.
 *  -------------------------------------------------------------
 *  Se monta sobre [data-ld-quote-form="1"] de la home y envía
 *  el lead al endpoint /website/form/crm.lead (website_form /
 *  `website_crm` en SaaS estándar).
 *
 *  Si el módulo CRM no está disponible, hace fallback a una
 *  redirección a WhatsApp con el mensaje pre-rellenado.
 *
 *  Este es el ejemplo "OWL" del módulo: el resto del home es QWeb
 *  porque OWL no es necesario para contenido estático en SSR.
 */

import { Component, mount, useState } from "@odoo/owl";
import { templates } from "@web/core/templates";

class ContactQuoteForm extends Component {
    static template = "lifedeportes_theme.ContactQuoteForm";

    setup() {
        this.state = useState({
            name: "",
            tipo: "",
            phone: "",
            email: "",
            message: "",
            submitting: false,
            success: false,
            error: "",
        });
    }

    get whatsappFallbackUrl() {
        const base = "https://wa.me/573103362484";
        const text = `Hola, soy ${this.state.name || "interesado"}. ` +
            `Quiero cotizar uniformes de ${this.state.tipo || "deportes"}. ` +
            `${this.state.message ? `\nDetalle: ${this.state.message}` : ""}`;
        return `${base}?text=${encodeURIComponent(text)}`;
    }

    _validate() {
        if (!this.state.name.trim()) return "Por favor escribe tu nombre.";
        if (!this.state.tipo) return "Selecciona el tipo de uniforme.";
        if (!this.state.phone.trim()) return "Necesitamos tu WhatsApp / teléfono.";
        return "";
    }

    _csrfToken() {
        const inp = document.querySelector('input[name="csrf_token"]');
        if (inp && inp.value) return inp.value.trim();
        const m = typeof document.cookie === "string" && document.cookie.match(/\bcsrf_token=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : "";
    }

    async onSubmit(ev) {
        ev.preventDefault();
        const err = this._validate();
        if (err) {
            this.state.error = err;
            return;
        }
        this.state.error = "";
        this.state.submitting = true;
        try {
            const csrf = this._csrfToken();
            const formData = new FormData();
            if (csrf) {
                formData.append("csrf_token", csrf);
            }
            formData.append("contact_name", this.state.name);
            formData.append("name", `Cotización web — ${this.state.tipo}`);
            formData.append("phone", this.state.phone);
            formData.append("email_from", this.state.email);
            formData.append("description",
                `Tipo de uniforme: ${this.state.tipo}\n\n` +
                `Mensaje:\n${this.state.message || "(sin mensaje)"}`);

            const response = await fetch("/website/form/crm.lead", {
                method: "POST",
                body: formData,
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
            });
            if (response.ok) {
                this.state.success = true;
            } else {
                throw new Error("Endpoint no disponible");
            }
        } catch (e) {
            // Fallback elegante: te llevamos a WhatsApp con el mensaje listo.
            window.location.href = this.whatsappFallbackUrl;
        } finally {
            this.state.submitting = false;
        }
    }
}

// Auto-mount sobre cualquier placeholder en el DOM.
function mountContactQuoteForm() {
    const targets = document.querySelectorAll("[data-ld-quote-form='1']");
    targets.forEach((target) => {
        if (target.dataset.mounted === "1") return;
        target.dataset.mounted = "1";
        mount(ContactQuoteForm, target, {
            templates,
            dev: false,
        });
    });
}

if (document.readyState !== "loading") {
    mountContactQuoteForm();
} else {
    document.addEventListener("DOMContentLoaded", mountContactQuoteForm);
}

export default ContactQuoteForm;
