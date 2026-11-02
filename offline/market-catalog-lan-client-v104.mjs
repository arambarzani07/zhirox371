// V104 disposable test client: HTTPS TLS 1.3 mutual-cert GET-only client for
// the read-only CSV catalog watcher (supports 127.0.0.1 or RFC1918 private NIC).
// Never disables TLS verification, never sends write methods, and never falls
// back to HTTP or public WAN.
import https from "node:https";
import {isPrivateV101IPv4} from "./private-nic-v101.mjs";
import {V104_BASE} from "./market-catalog-lan-v104.mjs";

const DEVICE=/^trial-pc-0[12]$/;
export function createV104CatalogLANClient({
 origin,deviceId,token,ca,cert,key,routePrefix=V104_BASE
}={}){
 const target=new URL(origin);
 if(target.protocol!=="https:"||
  routePrefix!==V104_BASE||
  !(target.hostname==="127.0.0.1"||isPrivateV101IPv4(target.hostname))||
  !/^\d+$/.test(target.port)||target.pathname!=="/"||
  target.search||target.hash||!DEVICE.test(deviceId||"")||
  typeof token!=="string"||token.length<32||token.length>2048||
  !ca||!cert||!key)
  throw Error("v104_private_nic_https_mtls_catalog_client_required");
 const agent=new https.Agent({
  ca,cert,key,rejectUnauthorized:true,minVersion:"TLSv1.3",
  maxVersion:"TLSv1.3",keepAlive:false
 });
 async function get(subpath){
  const u=new URL(routePrefix+subpath,target.origin);
  if(u.origin!==target.origin||u.protocol!=="https:"||
   !u.pathname.startsWith(routePrefix))
   throw Error("v104_client_must_stay_pinned_to_private_nic_origin");
  const response=await new Promise((resolve,reject)=>{
   const req=https.request(u,{
    agent,method:"GET",headers:{
     "Accept":"application/json",
     "Authorization":"Bearer "+token,
     "x-zhirox-device-id":deviceId
    },timeout:5000
   },res=>{
    const chunks=[];
    let sum=0;
    res.on("data",chunk=>{
     sum+=chunk.length;
     if(sum>65536){res.destroy(new Error("v104_response_too_large"));return;}
     chunks.push(chunk);
    });
    res.on("error",reject);
    res.on("end",()=>resolve({
     status:res.statusCode,
     headers:res.headers,
     body:Buffer.concat(chunks).toString("utf8")
    }));
   });
   req.on("timeout",()=>req.destroy(new Error("v104_test_tls_timeout")));
   req.on("error",reject);
   req.end();
  });
  return {
   status:response.status,
   headers:response.headers,
   body:JSON.parse(response.body)
  };
 }
 return Object.freeze({
  status:()=>get("status"),
  scan:code=>get("scan?code="+encodeURIComponent(String(code??""))),
  search:(q,limit)=>{
   const params="q="+encodeURIComponent(String(q??""))+
    (limit===undefined?"":"&limit="+encodeURIComponent(String(limit)));
   return get("products?"+params);
  }
 });
}
