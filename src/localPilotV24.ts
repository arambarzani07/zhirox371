/* V24 isolated, loopback-only PC pilot. No cloud, browser DB credentials or Supabase.
 * Cashier React demo remains separate and is NOT allowed to copy a pilot receipt.
 */
export interface LocalPilotItem {
  id: string;
  name: string;
  barcode: string;
  price_minor: number;
  stock_base_units: number;
}
export interface PilotLine { product_id: string; qty: number }
export interface PilotPending { request_id: string; lines: PilotLine[] }
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
  if(!response.ok)throw new Error("local_api_"+response.status);
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
  const data=await request<{ok:true;product:{id:string;name:string;barcode:string;price_minor:string;stock_base_units:string}}>(
    "/api/local/v4/barcode?code="+encodeURIComponent(barcode),{},token
  );
  const p=data.product;
  const price=Number(p?.price_minor),stock=Number(p?.stock_base_units);
  if(!uuid.test(p?.id||"")||!p.name||p.barcode!==barcode||
      !Number.isSafeInteger(price)||price<0||!Number.isSafeInteger(stock)||stock<0)
    throw new Error("invalid_product");
  return {id:p.id,name:p.name,barcode,price_minor:price,stock_base_units:stock};
}
export function validPilotPending(value:unknown):value is PilotPending{
 if(!value||typeof value!=="object")return false;
 const p=value as PilotPending;
 return uuid.test(p.request_id||"")&&Array.isArray(p.lines)&&p.lines.length>0&&p.lines.length<=100&&
   p.lines.every(line=>line&&uuid.test(line.product_id||"")&&
      Number.isSafeInteger(line.qty)&&line.qty>0&&line.qty<=100);
}
export async function checkoutLocal(token:string,pending:PilotPending):Promise<PilotResult>{
 if(!validPilotPending(pending))throw new Error("invalid_checkout");
 const data=await request<{ok:true;receipt:{sale_id:string;receipt_no:string|number;total_minor:string|number;replayed:boolean}}>(
  "/api/local/v3/checkout",{method:"POST",body:JSON.stringify(pending)},token
 );
 const rec=data.receipt;
 const total=Number(rec?.total_minor),number=Number(rec?.receipt_no);
 if(!uuid.test(rec?.sale_id||"")||!Number.isSafeInteger(total)||total<0||
   !Number.isSafeInteger(number)||number<1||typeof rec?.replayed!=="boolean")throw new Error("invalid_receipt");
 return {sale_id:rec.sale_id,receipt_no:number,total_minor:total,replayed:rec.replayed};
}
export function makePilotPending(lines:PilotLine[],id:string):PilotPending {
 const next={request_id:id,lines:lines.map(l=>({product_id:l.product_id,qty:l.qty}))};
 if(!validPilotPending(next))throw new Error("invalid_checkout");
 return next;
}
