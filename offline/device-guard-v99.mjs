// V99 disposable lab only. Two independent device-shared secrets authenticate
// HTTP requests *in addition* to the locally verified cashier account session.
// Not production device enrollment: no TLS certificates, no LAN binding.
// Replay nonce cache is process-local and not persistent across restarts.
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";

const DEVICE=/^trial-pc-0[12]$/;
const NONCE=/^[a-f0-9]{32}$/;
const MAC=/^[a-f0-9]{64}$/;
const secretOk=value=>typeof value==="string"&&MAC.test(value);
const signingText=({deviceId,timestamp,nonce,method,path,body})=>
 [deviceId,timestamp,nonce,method,path,JSON.stringify(body)].join("\n");

export function signV99DeviceRequest({deviceId,secretHex,method,path,body,now=Date.now()}){
 if(!DEVICE.test(deviceId)||!secretOk(secretHex)||
  !["POST"].includes(method)||path===undefined||!body||
  typeof body!=="object"||Array.isArray(body))
  throw Error("V99_device_request_shape_required");
 const timestamp=Math.floor(now/1000);
 const nonce=randomBytes(16).toString("hex");
 const mac=createHmac("sha256",Buffer.from(secretHex,"hex"))
  .update(signingText({deviceId,timestamp,nonce,method,path,body}),"utf8").digest("hex");
 return {
  "x-zhirox-device-id":deviceId,
  "x-zhirox-device-timestamp":String(timestamp),
  "x-zhirox-device-nonce":nonce,
  "x-zhirox-device-mac":mac
 };
}

export function createV99DeviceGuard({deviceKeys,now=Date.now,ttlSeconds=30}){
 if(!deviceKeys||Object.keys(deviceKeys).length!==2||
  !["trial-pc-01","trial-pc-02"].every(id=>secretOk(deviceKeys[id]))||
  deviceKeys["trial-pc-01"]===deviceKeys["trial-pc-02"]||
  !Number.isInteger(ttlSeconds)||ttlSeconds<10||ttlSeconds>90)
  throw Error("V99_two_independent_test_device_keys_required");
 const seen=new Map();
 return async function authorizeDevice({headers,method,path,body}){
  const id=headers["x-zhirox-device-id"];
  const ts=headers["x-zhirox-device-timestamp"];
  const nonce=headers["x-zhirox-device-nonce"];
  const mac=headers["x-zhirox-device-mac"];
  if(typeof id!=="string"||!DEVICE.test(id)||
    typeof ts!=="string"||!/^\d{10}$/.test(ts)||
    typeof nonce!=="string"||!NONCE.test(nonce)||
    typeof mac!=="string"||!MAC.test(mac)||
    method!=="POST"||typeof path!=="string"||
    !body||typeof body!=="object"||Array.isArray(body))return null;
  const second=Math.floor(now()/1000);
  const issued=Number(ts);
  if(Math.abs(second-issued)>ttlSeconds)return null;
  const expected=createHmac("sha256",Buffer.from(deviceKeys[id],"hex"))
   .update(signingText({deviceId:id,timestamp:issued,nonce,method,path,body}),"utf8")
   .digest("hex");
  if(!timingSafeEqual(Buffer.from(mac,"hex"),Buffer.from(expected,"hex")))return null;
  // Bounded nonce check: replays are refused even when user auth still valid.
  for(const [key,expiry] of seen){
   if(expiry<=second)seen.delete(key);
  }
  if(seen.size>=2048)return null;
  const key=id+":"+nonce;
  if(seen.has(key))return null;
  seen.set(key,Math.max(second,issued)+ttlSeconds+1);
  return id;
 };
}
