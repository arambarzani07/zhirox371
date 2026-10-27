/** Pure diagnostic helpers: no data storage and no network calls. */
import "./scale-barcode.js";
export function isValidEan13(value) {
  if (typeof value !== "string" || !/^[0-9]{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const digit = (10 - (sum % 10)) % 10;
  return digit === Number(value[12]);
}

export function inspectBarcode(input) {
  const code = String(input ?? "").trim();
  const numeric13 = /^[0-9]{13}$/.test(code);
  const valid = numeric13 ? isValidEan13(code) : null;
  const scale = numeric13 && code.startsWith("27");
  const parsed = scale ? globalThis.ScaleBarcode.inspect(code) : null;
  return Object.freeze({
    length: code.length,
    type: numeric13 ? "EAN-13" : /^[0-9]+$/.test(code) ? "ژمارەیی" : "ئەلفانوومێریک",
    checksum: numeric13 ? (valid ? "دروستە" : "نادروستە") : "پەیوەندی نییە",
    scaleItemCode: parsed?.valid ? parsed.productCode : null,
    scaleWeightKg: parsed?.valid ? parsed.kilograms : null,
    possibleScaleBarcode: scale,
    validEan13: valid
  });
}
