import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalReceiptHandlerV34,renderReceiptV34} from "../local-receipts-v34.mjs";

const store="10000000-0000-0000-0000-000000000034";
const cashier="20000000-0000-0000-0000-000000000034";
const otherCashier="20000000-0000-0000-0000-000000000035";
const sale="40000000-0000-0000-0000-000000000034";
const secret="v34-test-only-session-secret-".repeat(4);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const stranger=codec.issue({store_id:store,user_id:otherCashier,role:"cashier"});
const makeReceipt=()=>({
 sale_id:sale,receipt_no:"19",total_minor:"2800",
 store_name_snapshot:"سوپەرمارکێتی کانی چنار",
 issued_at:"2026-10-30T09:00:00.000Z",lines:[
  {line_no:1,name:"گۆجە <script>alert(1)</script> & تاقیکردنەوە",
   sale_mode:"unit",scan_quantity:2,quantity_base_units:2,
   unit_price_minor:1400,line_total_minor:2800}
 ]});
function mockPool(receipt=makeReceipt()){
 const calls=[];
 return {calls,query:async(sql,args)=>{
  if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
   return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  calls.push({sql,args});
  assert.match(sql,/^SELECT /);
  assert.match(sql,/receipt_snapshots_v34/);
  return {rows:args[0]===store&&args[1]===cashier&&args[2]===sale?[receipt]:[]};
 },connect:async()=>{throw Error("receipt read must not open write transaction");}};
}
async function serve(pool,callback){
 const server=createServer(createLocalReceiptHandlerV34({pool,secret}));
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 try{await callback("http://127.0.0.1:"+server.address().port);}
 finally{await new Promise(done=>server.close(done));}
}
const get=(base,path,t=token)=>fetch(base+path,{headers:t?{Authorization:"Bearer "+t}:{}});
test("only signed cashier can read server-committed snapshot for exact store/cashier/sale",async()=>{
 const db=mockPool();
 await serve(db,async base=>{
  const path="/api/local/v34/receipt?sale_id="+sale;
  assert.equal((await get(base,path,null)).status,401);
  assert.equal((await get(base,path,"bad")).status,401);
  assert.equal((await get(base,path,stranger)).status,404);
  const result=await get(base,path);
  assert.equal(result.status,200);
  const json=await result.json();
  assert.equal(json.receipt.total_minor,"2800");
  assert.equal(json.receipt.lines[0].name,makeReceipt().lines[0].name);
  assert.equal(result.headers.get("cache-control"),"no-store, private");
  assert.deepEqual(db.calls.at(-1).args,[store,cashier,sale]);
  assert.ok(db.calls.every(x=>x.sql.startsWith("SELECT ")));
 });
});
test("print preview is Sorani RTL and HTML-escaped without scripts or browser prices",async()=>{
 const db=mockPool();
 await serve(db,async base=>{
  const res=await get(base,"/api/local/v34/print-preview?sale_id="+sale+"&width=58");
  assert.equal(res.status,200);
  assert.match(res.headers.get("content-security-policy"),/default-src 'none'/);
  const text=await res.text();
  assert.match(text,/lang="ckb" dir="rtl"/);
  assert.match(text,/width:54mm/);
  assert.match(text,/ژمارە.*ناوی کاڵا.*یەکە.*نرخ.*بڕ.*کۆ/);
  assert.match(text,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(text,/<script>/);
  assert.match(text,/2,800 IQD/);
 });
 assert.throws(()=>renderReceiptV34(makeReceipt(),72),/invalid_paper_width/);
});
test("untrusted totals, bad URL and mutation fail closed",async()=>{
 const wrong=makeReceipt();wrong.total_minor="1";
 const db=mockPool(wrong);
 await serve(db,async base=>{
  const path="/api/local/v34/receipt?sale_id="+sale;
  assert.equal((await get(base,path)).status,503);
  assert.equal((await get(base,path+"&sale_id="+sale)).status,400);
  assert.equal((await get(base,path+"&width=80")).status,400);
  assert.equal((await get(base,"/api/local/v34/print-preview?sale_id="+sale+"&width=99")).status,400);
  assert.equal((await get(base,"/api/local/v34/receipt?sale_id=bad")).status,400);
  assert.equal((await fetch(base+path,{method:"POST",headers:{Authorization:"Bearer "+token,
    "Content-Type":"application/json"},body:JSON.stringify({lines:[{name:"forge",price:1}]})})).status,405);
  assert.equal((await get(base,"/api/local/v34/receipt?sale_id="+
   "40000000-0000-0000-0000-000000000099")).status,404);
 });
});
