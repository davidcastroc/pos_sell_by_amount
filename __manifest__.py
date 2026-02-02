{
    "name": "POS Sell by Amount",
    "version": "18.0.1.0.0",
    "category": "Point of Sale",
    "depends": ["point_of_sale"],
    "assets": {
        "point_of_sale._assets_pos": [
            "pos_sell_by_amount/static/src/js/sell_by_amount.js",
            "pos_sell_by_amount/static/src/xml/sell_by_amount_button.xml",
        ],
    },
    "installable": True,
    "application": False,
}