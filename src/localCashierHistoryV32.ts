import {pilotEnabled} from "./localPilotV24";
export interface LocalReceiptV32 {
 sale_id:string;receipt_no:number;total_minor:number;created_at:string;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function read<T>(path:string,token:string):Promise<T>{
 if(!pilotEnabled||!token)throw Error("pilot_disabled");
 const res=await fetch(path,{method:"GET",cache:"no-store",credentials:"omit",
  redirect:"error",headers:{Authorization:"Bearer "+token}});
 if(!res.ok)throw Error("local_receipts_http_"+res.status);
 const data=await res.json() as {ok?:boolean};
 if(data?.ok!==true)throw Error("invalid_local_receipts");
 return data as T;
}
export async function getLocalReceiptsV32(token:string):Promise<LocalReceiptV32[]>{
 const data=await read<{ok:true;receipts:unknown}>("/api/local/v32/receipts?limit=20",token);
 if(!Array.isArray(data.receipts)||data.receipts.length>20)
  throw Error("invalid_local_receipts");
 return data.receipts.map((r:unknown)=>{
  const x=r as Record<string,unknown>,no=Number(x?.receipt_no),total=Number(x?.total_minor);
  const created=String(x?.created_at||"");
  if(!UUID.test(String(x?.sale_id||""))||!Number.isSafeInteger(no)||no<1||
     !Number.isSafeInteger(total)||total<0||!created||Number.isNaN(Date.parse(created)))
   throw Error("invalid_local_receipt_row");
  return {sale_id:String(x.sale_id),receipt_no:no,total_minor:total,created_at:created};
 });
}
export interface LocalIntentStatusV32 {
 request_id:string;state:"prepared"|"committed"|"cancelled";lines:{barcode:string;qty:number}[];
 expected_total_minor:number;sale_id:string|null;receipt_no:number|null;total_minor:number|null;
}
// Explicit query for a browser hint whose server's open-intent list is empty.
// A committed/cancelled hint must never be prepared and re-sold as a new intent.
export async function getLocalIntentStatusV32(token:string,id:string):Promise<LocalIntentStatusV32|null>{
 if(!UUID.test(id))throw Error("invalid_request_id");
 const data=await read<{ok:true;intent:unknown|null}>(
  "/api/local/v32/intent?request_id="+encodeURIComponent(id),token);
 if(data.intent===null)return null;
 const x=data.intent as Record<string,unknown>;
 if(!x||x.request_id!==id||!["prepared","committed","cancelled"].includes(String(x.state))||
    !Array.isArray(x.lines)||x.lines.length===0||x.lines.length>100||
    !x.lines.every((l:unknown)=>{
      const line=l as Record<string,unknown>;
      return typeof line?.barcode==="string"&&/^[A-Za-z0-9._-]{4,80}$/.test(line.barcode)&&
        Number.isSafeInteger(line.qty)&&Number(line.qty)>=1&&Number(line.qty)<=100;
    })||!Number.isSafeInteger(Number(x.expected_total_minor))||
    Number(x.expected_total_minor)<0||Number(x.expected_total_minor)>9999999999999)
    throw Error("invalid_local_intent");
 if(x.state==="committed"){
  if(!UUID.test(String(x.sale_id||""))||!Number.isSafeInteger(Number(x.receipt_no))||
     Number(x.receipt_no)<1||!Number.isSafeInteger(Number(x.total_minor))||
     Number(x.total_minor)<0)throw Error("invalid_local_intent");
 }else if(x.sale_id!==null||x.receipt_no!==null||x.total_minor!==null)
    throw Error("invalid_local_intent");
 return {...x,request_id:id,state:x.state,lines:x.lines,
   expected_total_minor:Number(x.expected_total_minor),
   sale_id:x.sale_id===null?null:String(x.sale_id),
   receipt_no:x.receipt_no===null?null:Number(x.receipt_no),
   total_minor:x.total_minor===null?null:Number(x.total_minor)} as LocalIntentStatusV32;
}
