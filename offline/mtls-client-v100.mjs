// V100 disposable test client: HTTPS 127.0.0.1 only, pinned lab CA,
// client certificate + key. Never disables TLS verification and never
// falls back to HTTP/WAN. Request UUID & immutable cart retry from V99.
import https from "node:https";
import {createV99TrialClient} from "./device-client-v99.mjs";
import {isPrivateV101IPv4} from "./private-nic-v101.mjs";

export function createV100MTLSTestClient({
 origin,deviceId,secretHex,ca,cert,key,routePrefix="/api/local/v100/"
}){
 const target=new URL(origin);
 if(target.protocol!=="https:"||
   !((routePrefix==="/api/local/v100/"&&target.hostname==="127.0.0.1")||
     (routePrefix==="/api/local/v101/"&&isPrivateV101IPv4(target.hostname)))||
   !/^\d+$/.test(target.port)||target.pathname!=="/"||
   target.search||target.hash||!ca||!cert||!key)
  throw Error("V100_private_loopback_https_mtls_required");
 const agent=new https.Agent({
  ca,cert,key,rejectUnauthorized:true,minVersion:"TLSv1.3",
  maxVersion:"TLSv1.3",keepAlive:false
 });
 const transport=async(url,options)=>{
  const u=new URL(url);
  if(u.origin!==target.origin||u.protocol!=="https:"||
     !u.pathname.startsWith(routePrefix))
   throw Error("V100_transport_must_stay_pinned_loopback_TLS");
  const bytes=Buffer.from(options.body||"","utf8");
  const response=await new Promise((resolve,reject)=>{
   const req=https.request(u,{
    agent,method:options.method,headers:{
     ...options.headers,"Content-Length":bytes.length
    },timeout:5000
   },res=>{
    const chunks=[];
    let sum=0;
    res.on("data",chunk=>{
     sum+=chunk.length;
     if(sum>16384){res.destroy(new Error("V100_response_too_large"));return;}
     chunks.push(chunk);
    });
    res.on("error",reject);
    res.on("end",()=>resolve({status:res.statusCode,
      body:Buffer.concat(chunks).toString("utf8")}));
   });
   req.on("timeout",()=>req.destroy(new Error("V100_test_TLS_timeout")));
   req.on("error",reject);
   req.end(bytes);
  });
  return {status:response.status,json:async()=>JSON.parse(response.body)};
 };
 return createV99TrialClient({
  origin,deviceId,secretHex,transport,routePrefix
 });
}
