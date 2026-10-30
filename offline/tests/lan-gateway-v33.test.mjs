import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createServer as httpsServer,request as tlsRequest} from "node:https";
import {createServer as httpServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {normalizePeer,privateIPv4,parseV33Peers,
 createV33LanHandler,createV33ClientLimiter,startV33LanTrial}
 from "../lan-gateway-v33.mjs";
const secret="v33-test-only-local-application-secret-".repeat(3);
const store="10000000-0000-0000-0000-000000000033";
const cashier1="20000000-0000-0000-0000-000000000033";
const cashier2="20000000-0000-0000-0000-000000000034";
const code=makeLocalSessionCodec(secret);
const token1=code.issue({store_id:store,user_id:cashier1,role:"cashier"});
const token2=code.issue({store_id:store,user_id:cashier2,role:"cashier"});
const pool={query:async(sql,args)=>{
 if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
  return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
 if(sql.includes("FROM zhirox_local.sales WHERE store_id=$1::uuid AND cashier_id=$2::uuid")){
  assert.equal(args[0],store);
  return {rows:[{sale_id:args[1]==cashier1?
   "40000000-0000-0000-0000-000000000033":"40000000-0000-0000-0000-000000000034",
   receipt_no:args[1]==cashier1?"1":"2",total_minor:"1250",
   created_at:"2026-10-30T07:00:00.000Z"}]};
 }
 throw Error("unexpected SQL");
},connect:async()=>{throw Error("not a write test");}};
async function trial(fn,opts={}){
 const dir=await mkdtemp(join(tmpdir(),"zhirox-v33-lan-"));
 try{
  const key=join(dir,"key.pem"),cert=join(dir,"cert.pem");
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes",
   "-keyout",key,"-out",cert,"-days","1","-subj","/CN=127.0.0.1",
   "-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
  const ca=await readFile(cert);
  const gate=createV33LanHandler({pool,secret,peers:opts.peers||new Set(["127.0.0.1"]),
    allowedOrigin:opts.origin||null,
    limiter:opts.limiter||createV33ClientLimiter({limit:30})});
  const server=httpsServer({cert:ca,key:await readFile(key),minVersion:"TLSv1.2"},gate);
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const port=server.address().port;
  const call=({path="/api/local/v32/receipts",token=token1,origin,
               xff,trustCa=ca,method="GET"}={})=>new Promise((resolve,reject)=>{
    const req=tlsRequest({hostname:"127.0.0.1",port,path,method,
      rejectUnauthorized:true,ca:trustCa,headers:{
       ...(token?{Authorization:"Bearer "+token}:{}),
       ...(origin?{Origin:origin}:{}),...(xff?{"X-Forwarded-For":xff}:{})
      }},resp=>{let raw="";resp.on("data",c=>raw+=c);resp.on("end",()=>resolve({
       status:resp.statusCode,headers:resp.headers,body:JSON.parse(raw)
      }));});
    req.on("error",reject);req.end();
  });
  try{await fn({call,ca,port,gate});}
  finally{await new Promise(ok=>server.close(ok));}
 }finally{await rm(dir,{recursive:true,force:true});}
}
test("Private LAN hosts and exact enrolled peer allowlist are validated",()=>{
 assert.equal(normalizePeer("::ffff:192.168.1.50"),"192.168.1.50");
 assert.equal(normalizePeer("192.168.1.999"),null);
 assert.equal(privateIPv4("192.168.1.15"),true);
 assert.equal(privateIPv4("172.25.1.2"),true);
 assert.equal(privateIPv4("8.8.8.8"),false);
 assert.deepEqual([...parseV33Peers("127.0.0.1,192.168.1.50")],
   ["127.0.0.1","192.168.1.50"]);
 assert.throws(()=>parseV33Peers("0.0.0.0"));
 assert.throws(()=>parseV33Peers("127.0.0.1,127.0.0.1"));
});
test("Two independently signed cashier sessions see only their own receipts over verified TLS",async()=>{
 await trial(async({call})=>{
  const one=await call({token:token1}),two=await call({token:token2});
  assert.equal(one.status,200);assert.equal(two.status,200);
  assert.equal(one.body.receipts[0].sale_id,
   "40000000-0000-0000-0000-000000000033");
  assert.equal(two.body.receipts[0].sale_id,
   "40000000-0000-0000-0000-000000000034");
  assert.equal((await call({token:null})).status,401);
  assert.equal((await call({token:"fake"})).status,401);
  assert.match(one.headers["cache-control"],/no-store/);
 });
});
test("Unknown LAN socket rejected even if attacker spoofs forwarding headers",async()=>{
 await trial(async({call})=>{
  const res=await call({xff:"192.168.1.50"});
  assert.equal(res.status,403);
  assert.equal(res.body.error,"unregistered_lan_peer");
 },{peers:new Set(["192.168.1.50"])});
});
test("HTTP and unapproved browser origin fail closed; CA pin required",async()=>{
 await trial(async({call,gate})=>{
  assert.equal((await call({origin:"https://other.example"})).status,403);
  await assert.rejects(call({trustCa:"not-the-issuer"}));
  const http=httpServer(gate);
  await new Promise(ok=>http.listen(0,"127.0.0.1",ok));
  try{
   const res=await fetch("http://127.0.0.1:"+http.address().port+"/api/local/v32/receipts");
   assert.equal(res.status,426);
   assert.equal((await res.json()).error,"https_required");
  }finally{await new Promise(ok=>http.close(ok));}
 });
});
test("Socket rate limiter cannot be bypassed with spoofed XFF",async()=>{
 await trial(async({call})=>{
  assert.equal((await call({xff:"203.0.113.1"})).status,200);
  assert.equal((await call({xff:"203.0.113.2"})).status,200);
  const res=await call({xff:"203.0.113.3"});
  assert.equal(res.status,429);
  assert.equal(res.body.error,"too_many_requests");
 },{limiter:createV33ClientLimiter({limit:2})});
});
test("V33 cannot run without deliberate opt-in or a private bind address",async()=>{
 const prev=process.env.ZHIROX_V33_LAN_TRIAL_ENABLED;
 delete process.env.ZHIROX_V33_LAN_TRIAL_ENABLED;
 try{await assert.rejects(startV33LanTrial(),/lan_trial_disabled/);}
 finally{if(prev===undefined)delete process.env.ZHIROX_V33_LAN_TRIAL_ENABLED;
 else process.env.ZHIROX_V33_LAN_TRIAL_ENABLED=prev;}
});
