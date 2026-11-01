import {isPrivateV101IPv4} from "./private-nic-v101.mjs";
// V99 synthetic cashier client. Preserves the original checkout request ID
// and lines across lost-ACK retries; refuses a mutated request with same ID.
// No Internet, DNS or cloud endpoint is needed in this test-only client.
import {signV99DeviceRequest} from "./device-guard-v99.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createV99TrialClient({origin,deviceId,secretHex,transport=fetch,
 routePrefix="/api/local/v99/"}){
 const url=new URL(origin);
 if(!((url.protocol==="http:"&&routePrefix==="/api/local/v99/")||
   (url.protocol==="https:"&&routePrefix==="/api/local/v100/"&&transport!==fetch)||
   (url.protocol==="https:"&&routePrefix==="/api/local/v101/"&&transport!==fetch))||
  !(routePrefix==="/api/local/v101/"?isPrivateV101IPv4(url.hostname):
    ["localhost","127.0.0.1"].includes(url.hostname))||
  !/^\d+$/.test(url.port)||url.pathname!=="/"||
  url.search||url.hash||typeof transport!=="function")
  throw Error("V99_test_client_loopback_only");
 const sent=new Map();
 let token=null;
 async function call(route,body){
  const path=routePrefix+route;
  const signed=signV99DeviceRequest({
   deviceId,secretHex,method:"POST",path,body
  });
  const result=await transport(origin+path,{
   method:"POST",
   headers:{"Content-Type":"application/json",...signed,
    ...(token?{Authorization:"Bearer "+token}:{})},
   body:JSON.stringify(body)
  });
  return {status:result.status,body:await result.json()};
 }
 return {
  async login(username,password){
   const response=await call("login",{username,password});
   if(response.status===200 && response.body?.token &&
    response.body.device_id===deviceId)token=response.body.token;
   return response;
  },
  async checkout({request_id,lines}={}){
   if(!token)throw Error("V99_login_required");
   if(!UUID.test(request_id||"")||!Array.isArray(lines)||
    lines.length<1||lines.length>30)throw Error("V99_invalid_checkout");
   // Canonical immutable JSON payload stored for the whole lifetime of the
   // trial client. Identical request IDs can only replay identical carts.
   const payload=JSON.stringify({request_id,lines});
   const stored=sent.get(request_id);
   if(stored!==undefined&&stored!==payload)
    throw Error("V99_request_id_cannot_change_basket");
   if(stored===undefined)sent.set(request_id,payload);
   const stable=JSON.parse(sent.get(request_id));
   try{
    const result=await call("checkout",stable);
    if(result.status!==503)return result;
   }catch{
    // Unknown-commit network failure; never make a new UUID or basket.
   }
   try{return await call("checkout",stable);}
   catch{return {status:0,body:{ok:false,error:"unknown_commit_retry_same_request",
    request_id}};}
  }
 };
}
