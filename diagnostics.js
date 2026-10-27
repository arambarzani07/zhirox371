import { inspectBarcode } from "./diagnostics-core.mjs";

const $ = id => document.getElementById(id);
const input = $("scan-input");
const widthSelector = $("paper-width");
const sheet = $("test-sheet");

function feedback(id, value, success=false) {
  const target=$(id);
  target.textContent=value;
  target.classList.toggle("success",success);
}

function restorePaperWidth() {
  let width="58";
  try {
    const saved = localStorage.getItem("retail_diagnostic_paper_width");
    if (saved === "58" || saved === "80") width=saved;
  } catch (_) { /* Browser may block storage; default remains safe. */ }
  setPaperWidth(width);
}
function setPaperWidth(width) {
  const selected=width==="80"?"80":"58";
  widthSelector.value=selected;
  sheet.classList.toggle("wide",selected==="80");
  document.documentElement.style.setProperty("--diagnostic-paper",selected+"mm");
  $("paper-mark").textContent="WIDTH: "+selected+"mm";
  try {
    localStorage.setItem("retail_diagnostic_paper_width",selected);
  } catch (_) { /* Preference is optional and contains no user data. */ }
}
function connectionStatus() {
  $("network-status").textContent=navigator.onLine?"ڕاگەیەندراوە: Online":"ڕاگەیەندراوە: Offline";
  $("page-status").textContent=location.protocol==="https:"?"HTTPS":location.protocol==="file:"?"فایلی ناوخۆیی":"HTTP / ناوخۆیی";
}
$("focus-scanner").addEventListener("click",()=>{
  input.focus();
  feedback("scan-feedback","ئامادەی سکانکردن");
});
$("scan-form").addEventListener("submit",event=>{
  event.preventDefault();
  const code=input.value.trim();
  if (!code) {
    feedback("scan-feedback","بارکۆدێک بنووسە یان بسکانە");
    return;
  }
  const result=inspectBarcode(code);
  $("barcode-length").textContent=String(result.length);
  $("barcode-type").textContent=result.type;
  $("barcode-checksum").textContent=result.checksum;
  $("scale-code").textContent=result.scaleItemCode && result.scaleWeightKg !== null ?
    result.scaleItemCode+" — "+result.scaleWeightKg.toFixed(3)+" kg" : "—";
  if(result.possibleScaleBarcode) {
    feedback("scan-feedback",result.validEan13?
      "بارکۆدی تەرازوو خوێندرایەوە؛ کۆدی کاڵا و کێش بەردەستن، نرخ لە بارکۆدەکەدا نییە.":
      "کۆدی prefix 27 ـە، بەڵام checksum ـی EAN-13 نادروستە.",!!result.validEan13);
  } else if(result.validEan13===false) {
    feedback("scan-feedback","Checksum ـی EAN-13 نادروستە. تکایە بارکۆدەکە دووبارە بسکانە.");
  } else {
    feedback("scan-feedback","کۆد خوێندرایەوە؛ سکانەر پشتڕاست نەکراوە.",true);
  }
});
$("keyboard-input").addEventListener("keydown",event=>{
  $("key-last").textContent=event.key===" "?"Space":event.key;
  $("key-feedback").textContent=/^F(?:3|5|7|9|12)$/.test(event.key)?
    "دوگمەکە خوێندرایەوە؛ وێبگەڕ دەتوانێت کرداری تایبەتی خۆی هەبێت.":"";
});
widthSelector.addEventListener("change",event=>setPaperWidth(event.target.value));
$("test-print").addEventListener("click",()=>{
  // The print slip carries no sale, customer, price, payment or real receipt identifiers.
  // Browsers decide the printer/paper driver options; this cannot certify physical success.
  feedback("print-feedback","چاپکەر و کاغەز لە دیالۆگی چاپ هەڵبژێرە.");
  window.print();
});
window.addEventListener("online",connectionStatus);
window.addEventListener("offline",connectionStatus);
restorePaperWidth();
connectionStatus();
