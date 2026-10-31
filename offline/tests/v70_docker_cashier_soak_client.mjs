// V70: one *physical-like* cash station = one real Docker network namespace.
// No PostgreSQL credentials in clients; only HTTPS over the internal bridge.
// Synthetic 20 rounds x 5 isolated cashiers. Not real Windows PCs.
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {request as httpsRequest} from "node:https";
import {performance} from "node:perf_hooks";
const station=Number(process.argv[3]);
const mode=process.argv[2],round=Number(process.argv[4]||0);
if(process.env.ZHIROX_V70_SOAK_ENABLED!=="true"||
 process.env.ZHIROX_V69_CLIENT_LAN!=="true"||
 !Number.isSafeInteger(station)||station<1||station>5||
 !["login","round","hold","outage","resume","close","health"].includes(mode)||
 (mode==="round"&&(!Number.isSafeInteger(round)||round<1||round>20))||
 process.env.PGHOST||process.env.PGPASSWORD||process.env.PGUSER||
 process.env.ZHIROX_RELEASE_MODE==="official")
 throw Error("V70 fails closed outside isolated container cashier");
const store="10000000-0000-0000-0000-000000000059",pwd="V68_SYNTHETIC_cashier_credential_only";
const ca=readFileSync("/app/market-lab-evidence/v69-cert.pem");
const sessionFile="/tmp/v70-soak-station-"+station+".json";
const id=n=>"50000000-0000-0000-0000-"+String(700000000+station*1000+n).padStart(12,"0");
const shiftId="40000000-0000-0000-0000-"+String(700000000+station).padStart(12,"0");
const jobId=n=>"60000000-0000-0000-0000-"+String(700000000+station*1000+n).padStart(12,"0");
const session=()=>JSON.parse(readFileSync(sessionFile,"utf8"));
const save=s=>writeFileSync(sessionFile,JSON.stringify(s),{mode:0o600});
const output=x=>console.log(JSON.stringify({station,mode,...x}));
async function call(method,path,body,token){
 const payload=body===undefined?undefined:JSON.stringify(body);
 const start=performance.now();
 const result=await new Promise((yes,no)=>{
  const headers={"Accept":"application/json"};
  if(token)headers.Authorization="Bearer "+token;
  if(payload!==undefined){headers["Content-Type"]="application/json";headers["Content-Length"]=Buffer.byteLength(payload);}
  const req=httpsRequest({hostname:"v69-gateway",port:3443,servername:"v69-gateway",
   path,method,headers,ca,rejectUnauthorized:true,timeout:6000},res=>{
   let raw="";res.setEncoding("utf8");res.on("data",part=>raw+=part);
   res.on("end",()=>{try{yes({status:res.statusCode,data:JSON.parse(raw)});}catch(e){no(e);}});
  });
  req.once("error",no);req.once("timeout",()=>req.destroy(Error("V70_TIMEOUT")));
  if(payload!==undefined)req.write(payload);
  req.end();
 });
 return {...result,elapsed_ms:Math.round((performance.now()-start)*100)/100};
}
const post=(path,body,token)=>call("POST",path,body,token);
const get=(path,token)=>call("GET",path,undefined,token);
if(mode==="login"){
 const r=await post("/api/local/v3/login",{store_id:store,username:"v68-cashier-"+station,password:pwd});
 assert.equal(r.status,200);
 const token=r.data.token;assert.ok(token);
 const opened=await post("/api/local/v37/shift/open",{shift_id:shiftId,opening_minor:0},token);
 assert.equal(opened.status,200);
 save({token,completed:0,invoice_total:0});
 output({authenticated:true,shift_open:true,personal_token_not_exposed:true});
}else if(mode==="health"){
 const r=await get("/v33/health");assert.equal(r.status,200);output({health:true,latency_ms:r.elapsed_ms});
}else if(mode==="hold"||mode==="round"){
 const n=mode==="hold"?10:round;
 const s=session();
 const delay=({1:0,2:35,3:70,4:105,5:140})[station];
 await new Promise(r=>setTimeout(r,delay));
 const prepared=await post("/api/local/v31/prepare",{
  request_id:id(n),lines:[{barcode:"V70SOAKUNIT",qty:1}],expected_total_minor:750
 },s.token);
 assert.equal(prepared.status,200,"every synthetic sale must durably prepare");
 assert.equal(prepared.data.intent.state,"prepared");
 if(mode==="hold"){
  output({round:10,intent_durable:true,status:"prepared",latency_ms:prepared.elapsed_ms});
 }else{
  const t=await post("/api/local/v31/commit",{request_id:id(n)},s.token);
  assert.equal(t.status,200,"checkout must never fail under accepted synthetic 5-client load");
  assert.equal(t.data.receipt.total_minor,"750");
  const again=await post("/api/local/v31/commit",{request_id:id(n)},s.token);
  assert.equal(again.status,200);assert.equal(again.data.receipt.replayed,true);
  assert.equal(again.data.receipt.sale_id,t.data.receipt.sale_id);
  const printer=await post("/api/local/v35/print-jobs",{
   sale_id:t.data.receipt.sale_id,job_id:jobId(n),width_mm:n%2?58:80
  },s.token);
  assert.equal(printer.status,202);
  assert.equal(printer.data.hardware_printed,false);
  s.completed++;s.invoice_total+=750;save(s);
  output({round:n,committed:true,latency_ms:Math.round((prepared.elapsed_ms+t.elapsed_ms)*100)/100,
   prepare_ms:prepared.elapsed_ms,commit_ms:t.elapsed_ms,replay:true,print_queued:true});
 }
}else if(mode==="outage"){
 await assert.rejects(get("/v33/health"),
  e=>["ENETUNREACH","EHOSTUNREACH","EAI_AGAIN","ENOTFOUND","ETIMEDOUT","ECONNREFUSED"].includes(e.code)||
  /V70_TIMEOUT/.test(e.message));
 output({network_cable_virtual_detached:true});
}else if(mode==="resume"){
 const s=session();
 const intent=await get("/api/local/v31/recover",s.token);
 assert.equal(intent.status,200);
 assert.equal(intent.data.intent.request_id,id(10));
 assert.equal(intent.data.intent.state,"prepared");
 const result=await post("/api/local/v31/commit",{request_id:id(10)},s.token);
 assert.equal(result.status,200);
 assert.equal(result.data.receipt.total_minor,"750");
 const replay=await post("/api/local/v31/commit",{request_id:id(10)},s.token);
 assert.equal(replay.status,200);assert.equal(replay.data.receipt.replayed,true);
 const printed=await post("/api/local/v35/print-jobs",{
  sale_id:result.data.receipt.sale_id,job_id:jobId(10),width_mm:80
 },s.token);
 assert.equal(printed.status,202);assert.equal(printed.data.hardware_printed,false);
 s.completed++;s.invoice_total+=750;save(s);
 output({round:10,resumed:true,replay:true,print_queued:true,
  latency_ms:Math.round((intent.elapsed_ms+result.elapsed_ms)*100)/100});
}else if(mode==="close"){
 const s=session();
 assert.equal(s.completed,20,"every cashier must complete all 20 accepted real SQL sales");
 assert.equal(s.invoice_total,15000);
 const closed=await post("/api/local/v37/shift/close",{
  shift_id:shiftId,counted_minor:15000
 },s.token);
 assert.equal(closed.status,200);
 assert.equal(String(closed.data.shift.variance_minor),"0");
 output({20_sales_confirmed:true,shift_closed:true,variance_iqd:0,
  total_iqd:15000});
}
