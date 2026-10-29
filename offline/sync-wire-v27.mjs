import {createHmac,timingSafeEqual,createHash} from "node:crypto";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validId=value=>typeof value==="string"&&UUID.test(value);
export const digest=raw=>createHash("sha256").update(raw).digest("hex");
export function validateEnvelope(event){
 if(!event||typeof event!=="object"||Array.isArray(event))return false;
 return validId(event.store_id)&&validId(event.event_id)&&
   validId(event.aggregate_id)&&event.event_type==="sale.completed"&&
   typeof event.created_at==="string"&&!Number.isNaN(Date.parse(event.created_at))&&
   event.payload!==null&&typeof event.payload==="object"&&!Array.isArray(event.payload)&&
   validId(event.payload.sale_id)&&event.payload.sale_id===event.aggregate_id&&
   Number.isSafeInteger(Number(event.payload.receipt_no))&&
   Number(event.payload.receipt_no)>0&&
   Number.isSafeInteger(Number(event.payload.total_minor))&&Number(event.payload.total_minor)>=0;
}
export function signEvent(rawBody,secret,timestamp){
 if(typeof secret!=="string"||Buffer.byteLength(secret)<32)throw Error("invalid_sync_secret");
 if(typeof timestamp!=="string"||!/^[0-9]{13}$/.test(timestamp))throw Error("invalid_timestamp");
 return "sha256="+createHmac("sha256",secret).update(timestamp+"\n"+rawBody).digest("hex");
}
export function verifyEventSignature(rawBody,secret,timestamp,signature,now=Date.now()){
 if(typeof rawBody!=="string"||Buffer.byteLength(rawBody)>65536||
    typeof signature!=="string"||!/sha256=[0-9a-f]{64}/.test(signature)||
    typeof timestamp!=="string"||!/^[0-9]{13}$/.test(timestamp)||
    !Number.isSafeInteger(Number(timestamp))||
    Math.abs(now-Number(timestamp))>300000)return false;
 let expected;
 try{expected=signEvent(rawBody,secret,timestamp);}catch{return false;}
 return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
export function createEventEnvelope(row){
 const event={
  store_id:row.store_id,event_id:row.event_id,aggregate_id:row.aggregate_id,
  event_type:row.event_type,created_at:new Date(row.created_at).toISOString(),
  payload:row.payload
 };
 if(!validateEnvelope(event))throw Error("invalid_outbox_event");
 return event;
}
