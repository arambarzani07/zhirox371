/* ZHIROX scale barcode: verified local 27 + five product digits + five grams + EAN-13 checksum.
 * Example: 2700001 00245 1 -> item 2700001, net 0.245 kg.
 * This is a WEIGHT barcode, not a price barcode. Never infer IQD/kg from its digits.
 * No network, no database access and no checkout mutations.
 */
(function (root) {
  "use strict";
  function isValidEan13(value) {
    if (typeof value !== "string" || !/^[0-9]{13}$/.test(value)) return false;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(value[i]) * (i % 2 ? 3 : 1);
    return (10 - sum % 10) % 10 === Number(value[12]);
  }
  function inspect(input) {
    const barcode = String(input ?? "").trim();
    if (!/^27[0-9]{11}$/.test(barcode)) return null;
    if (!isValidEan13(barcode)) return Object.freeze({
      kind: "invalid", valid: false, barcode, reason: "checksum"
    });
    const grams = Number(barcode.slice(7, 12));
    if (grams < 1 || grams > 99999) return Object.freeze({
      kind: "invalid", valid: false, barcode, reason: "weight"
    });
    return Object.freeze({
      kind: "weight", valid: true, barcode,
      productCode: barcode.slice(0, 7),
      grams, kilograms: grams / 1000,
      eanCheckDigit: Number(barcode[12]),
    });
  }
  root.ScaleBarcode = Object.freeze({isValidEan13, inspect});
})(typeof globalThis !== "undefined" ? globalThis : window);
