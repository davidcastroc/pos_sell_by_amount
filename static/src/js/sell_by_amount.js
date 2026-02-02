/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

function roundCurrency(pos, amount) {
    const r = pos.currency.rounding || 0.01;
    return Math.round(amount / r) * r;
}

function roundUpToFive(qty) {
    return Math.ceil(qty / 5) * 5;
}

patch(ControlButtons.prototype, {
    async onClickSellByAmount() {
        const pos = this.pos;
        const order = pos.get_order();
        const line = order?.get_selected_orderline();

        if (!line) {
            this.dialog.add(AlertDialog, {
                title: "Sin producto",
                body: "Seleccioná el producto (ej. Maní) primero.",
            });
            return;
        }

        const amountStr = await makeAwaitable(
            this.dialog,
            NumberPopup,
            {
                title: "Monto exacto a cobrar (IVA incluido)",
                startingValue: "0",
                getPayload: v => v,
            }
        );

        if (!amountStr) return;

        const target = roundCurrency(pos, Number(amountStr));
        if (!target || target <= 0) return;

        // Precio base SIN IVA
        const basePrice = line.get_unit_price();

        // 1️⃣ Gramos teóricos
        const theoreticalQty = target / (basePrice * 1.13);

        // 2️⃣ Redondeo de balanza (5 en 5, SIEMPRE arriba)
        const roundedQty = roundUpToFive(theoreticalQty);

        // 3️⃣ Setear gramos
        line.set_quantity(roundedQty, true);

        // 4️⃣ Recalcular precio unitario interno para clavar el total
        const exactUnitPrice = target / roundedQty / 1.13;
        line.set_unit_price(exactUnitPrice);

        line.set_discount(0);
        line.price_manually_set = true;

        const finalTotal = roundCurrency(pos, line.get_price_with_tax());

        this.dialog.add(AlertDialog, {
            title: "Listo (modo gasolinera + balanza)",
            body:
                `Cobro exacto: ₡${target}\n` +
                `Gramos (redondeo balanza): ${roundedQty} g\n` +
                `Precio interno por gramo: ₡${exactUnitPrice.toFixed(6)}\n` +
                `Total final: ₡${finalTotal}`,
        });
    },
});