// V50 encrypted HTTPS receiver rehearsal. Loopback + disposable database only.
// Not a public cloud service, not a deployed Supabase function and never a live POS.
import {createServer as createHttpsServer} from "node:https";
import {readFile,lstat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createCloudReceiverV29} from "./cloud-receiver-v29.mjs";
import {parseV28Stores} from "./cloud-receiver-v28.mjs";
import {requireDisposablePostgres} from "./cloud-readiness-v50.mjs";

export function createV50LabHttpsHandler({pool,stores,now=()=>Date.now(),maxPerMinute=120}){
 if(!pool||typeof pool.query!=="function"||!(stores instanceof Map)||
    stores.size<1||!Number.isInteger(maxPerMinute)||maxPerMinute<1||
    maxPerMinute>1000)throw Error("invalid_v50_https_receiver");
 const handler=createCloudReceiverV29({pool,stores,now});
 const bucket=new Map();
 const reject=(res,status,reason)=>{
   res.writeHead(status,{"Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
   res.end(JSON.stringify({error:reason}));
 };
 return (req,res)=>{
   // The listening socket is loopback-only; never trust spoofable forwarded-IP headers.
   const peer=req.socket?.remoteAddress;
   if(!req.socket?.encrypted)return reject(res,426,"https_required");
   if(peer!=="127.0.0.1"&&peer!=="::ffff:127.0.0.1")
     return reject(res,403,"loopback_test_only");
   const t=now();
   const row=bucket.get(peer);
   const next= !row||t>=row.until?{n:0,until:t+60000}:row;
   if(next.n>=maxPerMinute)return reject(res,429,"rate_limited");
   next.n++;bucket.set(peer,next);
   if(req.headers["content-length"]&&(!/^[0-9]+$/.test(req.headers["content-length"])||
      Number(req.headers["content-length"])>65536))
     return reject(res,413,"body_too_large");
   Promise.resolve(handler(req,res)).catch(()=>{if(!res.headersSent)reject(res,503,"receiver_unavailable");else res.destroy();});
 };
}
export function checkV50HttpsLabConfig(env){
 if(env.ZHIROX_V50_HTTPS_LAB_ENABLED!=="true"||
    env.ZHIROX_RELEASE_MODE==="official")throw Error("https_lab_disabled");
 const dbUrl=requireDisposablePostgres(env.ZHIROX_V50_CLOUD_DISPOSABLE_DB_URL);
 const stores=parseV28Stores(env.ZHIROX_V50_LAB_STORES_JSON);
 const certFile=env.ZHIROX_V50_TLS_CERT_FILE,keyFile=env.ZHIROX_V50_TLS_KEY_FILE;
 if(typeof certFile!=="string"||!certFile||typeof keyFile!=="string"||!keyFile)
   throw Error("missing_local_test_tls");
 return {dbUrl,stores,certFile,keyFile};
}
async function readSafePem(file){
 const meta=await lstat(file);
 if(!meta.isFile()||meta.isSymbolicLink()||meta.size>30000||meta.size<100)
   throw Error("unsafe_local_test_pem");
 const body=await readFile(file);
 if(!body.toString("utf8").includes("-----BEGIN "))throw Error("invalid_local_test_pem");
 return body;
}
export async function startV50HttpsLabReceiver({env=process.env}={}){
 const config=checkV50HttpsLabConfig(env);
 const [cert,key]=await Promise.all([readSafePem(config.certFile),readSafePem(config.keyFile)]);
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:config.dbUrl,max:4,connectionTimeoutMillis:2000});
 const server=createHttpsServer({cert,key,minVersion:"TLSv1.2"},
   createV50LabHttpsHandler({pool,stores:config.stores}));
 server.on("close",()=>{void pool.end();});
 try{await new Promise((resolve,reject)=>{
   server.once("error",reject);server.listen(3445,"127.0.0.1",()=>{
     server.off("error",reject);resolve();
   });
 });}catch(error){await pool.end();throw error;}
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 startV50HttpsLabReceiver().then(()=>{
   console.log("v50_https_disposable_loopback_receiver_active");
 }).catch(()=>{console.error("v50_https_lab_receiver_refused");process.exitCode=1;});
}
