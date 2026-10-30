// V34: authenticated, server-authored immutable receipt preview for isolated
// PostgreSQL / TLS LAN trials. No browser-supplied lines, prices or raw print jobs.
// A physical spooler is intentionally NOT enabled or claimed by this module.
import {createLocalAuthV3} from "./local-auth-v3.mjs";
import {createLocalCashierHandlerV32} from "./local-cashier-server-v32.mjs";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"};
const send=(res,status,body)=>{
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",...headers});
 res.end(JSON.stringify(body));
};
const decimal=(value,max=9999999999999n)=>{
 if(typeof value!=="string"&&(!Number.isSafeInteger(value)||typeof value!=="number"))
  throw Error("corrupt_receipt");
 const s=String(value);
 if(!/^(0|[1-9][0-9]{0,15})$/.test(s))throw Error("corrupt_receipt");
 const n=BigInt(s);
 if(n>max)throw Error("corrupt_receipt");
 return n;
};
function checkReceipt(row){
 if(!row||!UUID.test(row.sale_id)||!Array.isArray(row.lines)||
    row.lines.length<1||row.lines.length>100||
    typeof row.store_name_snapshot!=="string"||
    row.store_name_snapshot.length<1||row.store_name_snapshot.length>200)
  throw Error("corrupt_receipt");
 const total=decimal(row.total_minor),no=decimal(row.receipt_no,9223372036854775807n);
 if(no<1n)throw Error("corrupt_receipt");
 let sum=0n;
 for(const [i,line] of row.lines.entries()){
  if(!line||line.line_no!==i+1||typeof line.name!=="string"||
     !line.name.trim()||line.name.length>240||
     !["unit","carton","scale"].includes(line.sale_mode))
    throw Error("corrupt_receipt");
  const count=decimal(line.scan_quantity,100n);
  const base=decimal(line.quantity_base_units,9999999999999n);
  decimal(line.unit_price_minor);
  const part=decimal(line.line_total_minor);
  if(count<1n||base<1n||(line.sale_mode==="scale"&&count!==1n))
   throw Error("corrupt_receipt");
  sum+=part;
 }
 if(sum!==total)throw Error("corrupt_receipt");
 const issued=new Date(row.issued_at);
 if(Number.isNaN(issued.getTime()))throw Error("corrupt_receipt");
 return {...row,receipt_no:String(row.receipt_no),total_minor:String(row.total_minor),
   issued_at:issued.toISOString()};
}
function htmlEscape(s){
 return String(s).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 })[c]);
}
const money=n=>BigInt(n).toLocaleString("en-US");
function lineQty(line){
 if(line.sale_mode==="scale"){
  const g=BigInt(line.quantity_base_units);
  return (g/1000n)+"."+String(g%1000n).padStart(3,"0");
 }
 return String(line.scan_quantity);
}
export function renderReceiptV34(receipt,width=80){
 if(width!==58&&width!==80)throw Error("invalid_paper_width");
 const rows=receipt.lines.map(l=>`<tr><td>${l.line_no}</td><td class="product">${htmlEscape(l.name)}</td><td>${l.sale_mode==="scale"?"کیلۆگرام":l.sale_mode==="carton"?"کارتۆن":"دانە"}</td><td>${money(l.unit_price_minor)}</td><td>${lineQty(l)}</td><td>${money(l.line_total_minor)}</td></tr>`).join("");
 return `<!doctype html><html lang="ckb" dir="rtl"><head><meta charset="UTF-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <title>پسووڵەی ${htmlEscape(receipt.receipt_no)}</title>
 <style>
 @page{margin:2mm}
 *{box-sizing:border-box}
 html,body{margin:0;background:white;color:#000;font-family:Tahoma,Arial,sans-serif}
 main{width:${width-4}mm;max-width:100%;margin:auto;padding:2mm 0;font-size:${width===58?9:11}px}
 h1{font-size:1.3em;margin:0;text-align:center}
 header,footer{text-align:center}
 small{font-size:.9em}
 table{border-collapse:collapse;width:100%;margin-top:3mm;table-layout:fixed}
 td,th{border-top:1px solid #000;border-bottom:1px solid #000;padding:2px 1px;text-align:center;overflow-wrap:anywhere}
 td.product{width:35%;text-align:right}
 .total{margin-top:3mm;border-top:2px solid black;padding:3mm 0;font-weight:bold}
 @media print{body{margin:0}main{margin:0}}
 </style></head><body><main>
 <header><h1>${htmlEscape(receipt.store_name_snapshot)}</h1><div>کوردستان</div>
 <small>ژمارەی پسووڵە: ${htmlEscape(receipt.receipt_no)}</small>
 <div><small>${htmlEscape(receipt.issued_at)}</small></div></header>
 <table><thead><tr><th>ژمارە</th><th>ناوی کاڵا</th><th>یەکە</th><th>نرخ</th><th>بڕ</th><th>کۆ</th></tr></thead>
 <tbody>${rows}</tbody></table>
 <div class="total">کۆی گشتی: ${money(receipt.total_minor)} IQD</div>
 <footer><small>پسووڵەی PostgreSQL ـی ناوخۆیی — تاقیکردنەوە</small></footer>
 </main></body></html>`;
}
export function createLocalReceiptHandlerV34({pool,secret,clock}){
 if(typeof pool?.query!=="function"||typeof pool?.connect!=="function")
  throw Error("invalid_local_pool");
 const auth=createLocalAuthV3({pool,secret,clock});
 const previous=createLocalCashierHandlerV32({pool,secret,clock});
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||"/","http://localhost");}
  catch{return send(res,400,{error:"invalid_url"});}
  const preview=url.pathname==="/api/local/v34/print-preview";
  const detail=url.pathname==="/api/local/v34/receipt";
  if(!preview&&!detail)return previous(req,res);
  if(req.method!=="GET")return send(res,405,{error:"method_not_allowed"});
  const match=/^Bearer (\S+)$/.exec(req.headers.authorization||"");
  const principal=match?await auth.authorize(match[1]).catch(()=>null):null;
  if(!principal)return send(res,401,{error:"invalid_session"});
  const keys=[...url.searchParams.keys()];
  if(keys.length!==new Set(keys).size||
     keys.some(k=>k!=="sale_id"&&!(preview&&k==="width"))||
     !UUID.test(url.searchParams.get("sale_id")||"")||
     (preview&&!["58","80"].includes(url.searchParams.get("width")||"80")))
   return send(res,400,{error:"invalid_receipt_query"});
  if(!preview&&url.searchParams.has("width"))
   return send(res,400,{error:"invalid_receipt_query"});
  try{
   const {rows}=await pool.query(
    "SELECT sale_id,receipt_no,total_minor,store_name_snapshot,issued_at,lines FROM zhirox_local.receipt_snapshots_v34 WHERE store_id=$1::uuid AND cashier_id=$2::uuid AND sale_id=$3::uuid",
    [principal.store_id,principal.user_id,url.searchParams.get("sale_id")]);
   if(!rows.length)return send(res,404,{error:"receipt_not_found"});
   const receipt=checkReceipt(rows[0]);
   if(!preview)return send(res,200,{ok:true,receipt});
   const width=Number(url.searchParams.get("width")||"80");
   res.writeHead(200,{"Content-Type":"text/html; charset=utf-8",
     "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
     ...headers});
   return res.end(renderReceiptV34(receipt,width));
  }catch{return send(res,503,{error:"verified_receipt_unavailable"});}
 };
}
