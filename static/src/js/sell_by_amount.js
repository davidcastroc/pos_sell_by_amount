/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

function roundCurrency(pos, amount) {
    const r = pos.currency.rounding || 0.01; // CRC normalmente 0.01
    return Math.round(amount / r) * r;
}

function roundUpToStep(value, step) {
    if (!step || step <= 0) return value;
    return Math.ceil(value / step) * step;
}

/**
 * Obtiene el factor real de impuestos de la línea (con lo que Odoo realmente calcula),
 * evitando hardcodear 1.13.
 */
function getLineTaxFactor(line) {
    // get_all_prices usa el motor de impuestos real del POS para la línea actual
    const prices = line.get_all_prices?.();
    const without = prices?.priceWithoutTax;
    const withTax = prices?.priceWithTax;

    if (!without || without <= 0 || !withTax) return 1.0;
    return withTax / without;
}

patch(ControlButtons.prototype, {
    async onClickSellByAmount() {
        const pos = this.pos;
        const order = pos.get_order();
        const line = order?.get_selected_orderline();

        if (!line) {
            this.dialog.add(AlertDialog, {
                title: "Seleccioná un producto",
                body: "Primero seleccioná el producto por gramos (ej. Almendra / Maní).",
            });
            return;
        }

        const amountStr = await makeAwaitable(this.dialog, NumberPopup, {
            title: "Monto a cobrar (IVA incluido)",
            startingValue: "0",
            getPayload: (v) => v,
        });
        if (!amountStr) return;

        const raw = Number(String(amountStr).replace(",", "."));
        if (!raw || raw <= 0) return;

        // 1) Definí cómo querés cobrar: exacto al colón o en múltiplos (ej. 5 en 5)
        const cashStep = 1; // <-- poné 5 si querés redondear SIEMPRE a ₡5
        const target = roundUpToStep(roundCurrency(pos, raw), cashStep);

        // 2) Precio unitario actual SIN IVA (el que usa POS como base)
        const basePrice = line.get_unit_price();
        if (!basePrice || basePrice <= 0) {
            this.dialog.add(AlertDialog, {
                title: "Precio inválido",
                body: "El producto seleccionado no tiene un precio base válido.",
            });
            return;
        }

        // 3) Factor real de impuestos (no hardcodeado)
        const taxFactor = getLineTaxFactor(line);

        // 4) Calcular gramos teóricos y redondear “balanza” (5g en 5g para arriba)
        const weightStep = 5; // 5g
        const theoreticalQty = target / (basePrice * taxFactor);
        const qty = roundUpToStep(theoreticalQty, weightStep);

        // Setear cantidad
        line.set_quantity(qty, true);

        // 5) Calcular precio por gramo SIN IVA para “clavar” el total con IVA
        let unit = target / (qty * taxFactor);

        const r = pos.currency.rounding || 0.01;
        const maxIter = 25;

        for (let i = 0; i < maxIter; i++) {
            line.set_unit_price(unit);

            const total = roundCurrency(pos, line.get_price_with_tax());
            const diff = target - total;

            if (Math.abs(diff) < r / 2) break;

            // Ajuste proporcional
            unit += diff / (qty * taxFactor);
        }

        // Limpieza/seguridad
        line.set_discount(0);
        line.price_manually_set = true;

        const finalTotal = roundCurrency(pos, line.get_price_with_tax());

        this.dialog.add(AlertDialog, {
            title: "Listo",
            body:
                `Monto objetivo: ₡${target.toFixed(2)}\n` +
                `Cantidad: ${qty} g\n` +
                `Precio interno por gramo: ₡${unit.toFixed(6)}\n` +
                `Total final: ₡${finalTotal.toFixed(2)}`,
        });
    },
});
