// V69 multi-device client test: each invocation executes inside ONE Docker
// namespace (separate simulated cashier PC with its own ephemeral local state).
// Never has direct DB credentials. No real Windows hardware or production data.
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {request as httpsRequest} from "node:https";
const store="10000000-0000-0000-0000-000000000059";
const pw="V68_SYNTHETIC_cashier_credential_only";
const phase=process.argv[2];
const i=Number(process.argv[3]);
const validPhases=new Set(["login","prepare","commit","finalize","recovery-prepare",
 "offline","recovery-commit","close","untrusted","health"]);
if(process.env.ZHIROX_V69_CLIENT_LAN!=="true"||
 !validPhases.has(phase)||!(i>=1&&i<=6)||
 process.env.PGHOST||process.env.PGPASSWORD||process.env.PGUSER||
 process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V69 client environment invalid: DB credentials forbidden");
const file="/tmp/v69-cashier-"+i+".json";
const ca=readFileSync("/app/market-lab-evidence/v69-cert.pem");
const uuid=(prefix,n)=>prefix+String(n).padStart(12,"0");
const session=()=>JSON.parse(readFileSync(file,"utf8"));
const result=(payload)=>{console.log(JSON.stringify({phase,cashier:i,...payload}));};
async function request(method,path,body,token,extras={}){
 const payload=body===undefined?undefined:JSON.stringify(body);
 return await new Promise((yes,no)=>{
  const headers={"Accept":"application/json",...extras};
  if(token)headers.Authorization="Bearer "+token;
  if(payload!==undefined){
   headers["Content-Type"]="application/json";
   headers["Content-Length"]=Buffer.byteLength(payload);
  }
  const req=httpsRequest({hostname:"v69-gateway",port:3443,
   servername:"v69-gateway",path,method,headers,ca,
   rejectUnauthorized:true,timeout:5000},res=>{
    let raw="";res.setEncoding("utf8");res.on("data",x=>raw+=x);
    res.on("end",()=>{try{yes({status:res.statusCode,data:JSON.parse(raw)});}catch(e){no(e);}});
   });
  req.on("error",no);req.on("timeout",()=>req.destroy(Error("V69_HTTPS_TIMEOUT")));
  if(payload!==undefined)req.write(payload);
  req.end();
 });
}
const post=(path,body,token)=>request("POST",path,body,token);
const get=(path,token)=>request("GET",path,undefined,token);
const fail=x=>{throw Error("V69 unexpected HTTP "+x.status+" "+JSON.stringify(x.data).slice(0,240));};
if(phase==="untrusted"){
 const denial=await get("/v33/health");
 assert.equal(denial.status,403,"unregistered container IP must be denied");
 const forged=await request("GET","/v33/health",undefined,undefined,
  {"X-Forwarded-For":"172.28.69.11"});
 assert.equal(forged.status,403,"proxy-spoof header must never override real network identity");
 result({unregistered_peer_denied:true,forged_forwarded_ip_denied:true});
}else if(phase==="health"){
 const r=await get("/v33/health");if(r.status!==200)fail(r);
 result({ready:true});
}else if(phase==="login"){
 const r=await post("/api/local/v3/login",
  {store_id:store,username:"v68-cashier-"+i,password:pw});
 if(r.status!==200)fail(r);
 const token=r.data.token;
 assert.equal(typeof token,"string");
 assert.ok(token.length>64);
 writeFileSync(file,JSON.stringify({token}),{mode:0o600});
 const opened=await post("/api/local/v37/shift/open",
  {shift_id:uuid("40000000-0000-0000-0000-",90+i),opening_minor:0},token);
 if(opened.status!==200)fail(opened);
 result({logged_in:true,shift_open:true,token_exposed:false});
}else if(phase==="prepare"){
 const r=await post("/api/local/v31/prepare",{
  request_id:uuid("50000000-0000-0000-0000-",90+i),
  lines:[{barcode:"V69LANMULTI",qty:2}],expected_total_minor:3000
 },session().token);
 if(r.status!==200)fail(r);
 assert.equal(r.data.intent.state,"prepared");
 result({prepared:true,request_id:r.data.intent.request_id});
}else if(phase==="commit"){
 const r=await post("/api/local/v31/commit",
  {request_id:uuid("50000000-0000-0000-0000-",90+i)},session().token);
 assert.ok([200,409].includes(r.status),JSON.stringify(r.data));
 const state=session();state.status=r.status;
 if(r.status===200){
  assert.equal(r.data.receipt.total_minor,"3000");
  state.sale_id=r.data.receipt.sale_id;
 }else assert.ok(["checkout_conflict","price_changed","open_shift_required"].includes(r.data.error)||
  r.data.error==="checkout_conflict");
 writeFileSync(file,JSON.stringify(state),{mode:0o600});
 result({status:r.status,committed:r.status===200,conflict:r.status===409});
}else if(phase==="finalize"){
 const state=session();
 if(state.status===200){
  const again=await post("/api/local/v31/commit",
   {request_id:uuid("50000000-0000-0000-0000-",90+i)},state.token);
  assert.equal(again.status,200);
  assert.equal(again.data.receipt.replayed,true);
  assert.equal(again.data.receipt.sale_id,state.sale_id);
  const receipt=await get("/api/local/v34/receipt?sale_id="+state.sale_id,state.token);
  assert.equal(receipt.status,200);
  const queue=await post("/api/local/v35/print-jobs",{
   sale_id:state.sale_id,job_id:uuid("60000000-0000-0000-0000-",90+i),width_mm:80
  },state.token);
  assert.equal(queue.status,202);
  assert.equal(queue.data.hardware_printed,false);
  result({winner:true,receipt_immutable:true,queued_not_printed:true,replay:true});
 }else{
  const cancelled=await post("/api/local/v31/cancel",
   {request_id:uuid("50000000-0000-0000-0000-",90+i)},state.token);
  assert.equal(cancelled.status,200);
  assert.equal(cancelled.data.state,"cancelled");
  result({winner:false,conflicting_intent_cancelled:true});
 }
}else if(phase==="recovery-prepare"){
 const p=await post("/api/local/v31/prepare",{
  request_id:uuid("50000000-0000-0000-0000-",101),
  lines:[{barcode:"6260053183998",qty:1}],expected_total_minor:400
 },session().token);
 assert.equal(p.status,200);
 const rec=await get("/api/local/v31/recover",session().token);
 assert.equal(rec.status,200);assert.equal(rec.data.intent.state,"prepared");
 result({prepared_pending_intent:true,request_id:rec.data.intent.request_id});
}else if(phase==="offline"){
 await assert.rejects(get("/v33/health"),e=>[
  "ENETUNREACH","EHOSTUNREACH","EAI_AGAIN","ENOTFOUND","ETIMEDOUT","ECONNREFUSED"
 ].includes(e.code)||/V69_HTTPS_TIMEOUT/.test(e.message));
 result({client_network_disconnected:true});
}else if(phase==="recovery-commit"){
 const token=session().token;
 const found=await get("/api/local/v31/recover",token);
 assert.equal(found.status,200);
 assert.equal(found.data.intent.request_id,uuid("50000000-0000-0000-0000-",101));
 const sale=await post("/api/local/v31/commit",{
  request_id:uuid("50000000-0000-0000-0000-",101)
 },token);
 assert.equal(sale.status,200);
 assert.equal(sale.data.receipt.total_minor,"400");
 const replay=await post("/api/local/v31/commit",{
  request_id:uuid("50000000-0000-0000-0000-",101)
 },token);
 assert.equal(replay.status,200);assert.equal(replay.data.receipt.replayed,true);
 assert.equal((await get("/api/local/v31/recover",token)).data.intent,null);
 const print=await post("/api/local/v35/print-jobs",{
  sale_id:sale.data.receipt.sale_id,
  job_id:uuid("60000000-0000-0000-0000-",101),width_mm:58
 },token);
 assert.equal(print.status,202);assert.equal(print.data.hardware_printed,false);
 const st=session();st.recovered400=true;writeFileSync(file,JSON.stringify(st),{mode:0o600});
 result({recovered:true,committed_once:true,total_iqd:400,queued_not_printed:true});
}else if(phase==="close"){
 const state=session();
 const counted=(state.status===200?3000:0)+(state.recovered400?400:0);
 const closed=await post("/api/local/v37/shift/close",{
  shift_id:uuid("40000000-0000-0000-0000-",90+i),counted_minor:counted
 },state.token);
 assert.equal(closed.status,200);
 assert.equal(String(closed.data.shift.variance_minor),"0");
 result({shift_closed:true,cash_iqd:counted,variance_iqd:0});
}
