/* V24 isolated, loopback-only PC pilot. No cloud, browser DB credentials or Supabase.
 * Cashier React demo remains separate and is NOT allowed to copy a pilot receipt.
 */
export interface LocalPilotItem {
  id: string;
  name: string;
  barcode: string;
  price_minor: number;
  stock_base_units: number;
  base_unit: "unit"|"gram";
  sale_mode: "unit"|"carton"|"scale";
  quantity_base_units: number;
  weight_grams: number|null;
  unit_price_minor: number;
}
export interface PilotLine { barcode: string; qty: number }
export interface PilotPending { request_id: string; lines: PilotLine[]; expected_total_minor: number }
export interface PilotResult { sale_id: string; receipt_no: number; total_minor: number; replayed: boolean }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pilotEnabled=import.meta.env.DEV&&import.meta.env.VITE_ENABLE_LOCAL_PILOT==="true";

async function request<T>(path:string,init:RequestInit={},token?:string):Promise<T> {
  if(!pilotEnabled)throw new Error("pilot_disabled");
  if(!path.startsWith("/api/local/v")||path.includes("//"))throw new Error("invalid_path");
  const response=await fetch(path,{
    ...init,
    cache:"no-store",credentials:"omit",redirect:"error",
    headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...init.headers}
  });
  if(!response.ok){
    // A verified price mismatch is a definite rollback, not an uncertain
    // network outcome. Other errors retain their original request UUID.
    const failure=await response.json().catch(()=>null) as {error?:string}|null;
    if(response.status===409&&failure?.error==="price_changed")
      throw new Error("price_changed");
    throw new Error("local_api_"+response.status);
  }
  const data:unknown=await response.json();
  if(!data||typeof data!=="object"||!("ok" in data)||(data as {ok?:unknown}).ok!==true)
    throw new Error("invalid_local_response");
  return data as T;
}
export async function loginLocal(store_id:string,username:string,password:string){
  if(!uuid.test(store_id)||username.trim().length<3||!password)throw new Error("invalid_login");
  const data=await request<{ok:true;token:string;role:string;expires_in_seconds:number}>(
    "/api/local/v3/login",{method:"POST",body:JSON.stringify({store_id,username:username.trim(),password})}
  );
  if(!data.token||!["owner","manager","cashier"].includes(data.role)||!Number.isFinite(data.expires_in_seconds))
    throw new Error("invalid_local_session");
  return data;
}
export async function scanLocal(token:string,barcode:string):Promise<LocalPilotItem>{
  if(!/^[0-9A-Za-z._-]{4,80}$/.test(barcode))throw new Error("invalid_barcode");
  const data=await request<{ok:true;product:{id:string;name:string;barcode:string;price_minor:string;
    stock_base_units:string;base_unit:"unit"|"gram";sale_mode:"unit"|"carton"|"scale";
    quantity_base_units:number;weight_grams:number|null;unit_price_minor:string}}>(
    "/api/local/v26/scan?code="+encodeURIComponent(barcode),{},token
  );
  const p=data.product;
  const price=Number(p?.price_minor),stock=Number(p?.stock_base_units);
  const baseQty=Number(p?.quantity_base_units),unitPrice=Number(p?.unit_price_minor);
  if(!uuid.test(p?.id||"")||!p.name||p.barcode!==barcode||
      !Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(stock)||stock<0||
      !Number.isSafeInteger(baseQty)||baseQty<1||!Number.isSafeInteger(unitPrice)||unitPrice<0||
      !["unit","gram"].includes(p.base_unit)||!["unit","carton","scale"].includes(p.sale_mode)||
      (p.base_unit==="gram"&&(p.sale_mode!=="scale"||baseQty!==Number(p.weight_grams)))||
      (p.base_unit==="unit"&&(p.sale_mode==="scale"||
        (p.sale_mode==="unit"&&baseQty!==1)||(p.sale_mode==="carton"&&baseQty<2))))
    throw new Error("invalid_product");
  return {id:p.id,name:p.name,barcode,price_minor:price,stock_base_units:stock,
    base_unit:p.base_unit,sale_mode:p.sale_mode,quantity_base_units:baseQty,
    weight_grams:p.weight_grams??null,unit_price_minor:unitPrice};
}
export function validPilotPending(value:unknown):value is PilotPending{
 if(!value||typeof value!=="object")return false;
 const p=value as PilotPending;
 return uuid.test(p.request_id||"")&&
   Number.isSafeInteger(p.expected_total_minor)&&p.expected_total_minor>=0&&
   p.expected_total_minor<=9999999999999&&Array.isArray(p.lines)&&p.lines.length>0&&p.lines.length<=100&&
   p.lines.every(line=>line&&typeof line.barcode==="string"&&/^[A-Za-z0-9._-]{4,80}$/.test(line.barcode)&&
      Number.isSafeInteger(line.qty)&&line.qty>0&&line.qty<=100);
}
export async function checkoutLocal(token:string,pending:PilotPending):Promise<PilotResult>{
 if(!validPilotPending(pending))throw new Error("invalid_checkout");
 const data=await request<{ok:true;receipt:{sale_id:string;receipt_no:string|number;total_minor:string|number;replayed:boolean}}>(
  "/api/local/v26/checkout",{method:"POST",body:JSON.stringify(pending)},token
 );
 const rec=data.receipt;
 const total=Number(rec?.total_minor),number=Number(rec?.receipt_no);
 if(!uuid.test(rec?.sale_id||"")||!Number.isSafeInteger(total)||total<0||
   !Number.isSafeInteger(number)||number<1||typeof rec?.replayed!=="boolean")throw new Error("invalid_receipt");
 return {sale_id:rec.sale_id,receipt_no:number,total_minor:total,replayed:rec.replayed};
}
export function makePilotPending(lines:PilotLine[],id:string,expectedTotal:number):PilotPending {
 const next={request_id:id,expected_total_minor:expectedTotal,
   lines:lines.map(l=>({barcode:l.barcode,qty:l.qty}))};
 if(!validPilotPending(next))throw new Error("invalid_checkout");
 return next;
}
