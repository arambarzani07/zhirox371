import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalCashLedgerHandlerV38} from "../local-cash-ledger-v38.mjs";
const store="10000000-0000-0000-0000-000000000038";
const cashier="20000000-0000-0000-0000-000000000038";
const other="20000000-0000-0000-0000-000000000039";
const shift="40000000-0000-0000-0000-000000000038";
const entry="60000000-0000-0000-0000-000000000038";
const secret="v38-isolated-token-secret".repeat(4);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const stranger=codec.issue({store_id:store,user_id:other,role:"cashier"});
const calls=[];
const pool={
 connect:async()=>{throw Error("not an API transaction");},
 query:async(sql,args)=>{
  if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
   return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  assert.match(sql,/^SELECT /);
  calls.push({sql,args});
  if(sql.includes("record_cash_movement_v38")){
   if(args[1]!==cashier)throw Object.assign(Error("other cashier"),{code:"P3801"});
   if(args[5]===9000000)throw Object.assign(Error("overdraw"),{code:"P3802"});
   return {rows:[{entry_id:entry,shift_id:shift,kind:args[4],amount_minor:String(args[5]),reason:args[6]}]};
  }
  if(sql.includes("cash_summary_v38"))
   return {rows:args[1]===cashier?[{shift_id:shift,state:"open",expected_minor:"13000",cash_in_minor:"2000",cash_out_minor:"500",expense_minor:"1000"}]:[]};
  if(sql.includes("FROM zhirox_local.cash_movements_v38"))
   return {rows:args[1]===cashier?[{entry_id:entry,shift_id:shift,kind:"expense",amount_minor:"1000",reason:"کڕینی کاغەز"}]:[]};
  if(sql.includes("close_cash_shift_v38")){
   if(args[1]!==cashier)throw Object.assign(Error("other cashier"),{code:"P3801"});
   return {rows:[{shift_id:shift,state:"closed",opening_minor:"10000",
    cash_sales_minor:"2500",cash_in_minor:"2000",cash_out_minor:"500",expense_minor:"1000",
    expected_minor:"13000",counted_minor:"12800",variance_minor:"-200"}]};
  }
  throw Error("unexpected SQL: "+sql);
 }
};
async function serve(fn){
 calls.length=0;const srv=createServer(createLocalCashLedgerHandlerV38({pool,secret}));
 await new Promise(ok=>srv.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+srv.address().port);}
 finally{await new Promise(ok=>srv.close(ok));}
}
function req(base,path,method="GET",body=null,t=token){
 return fetch(base+path,{method,
  headers:{...(t?{Authorization:"Bearer "+t}:{}),
   ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
}
const movement={shift_id:shift,entry_id:entry,kind:"expense",amount_minor:1000,reason:"کڕینی کاغەز"};
test("verified identity only and server totals, no client cash total input",async()=>{
 await serve(async base=>{
  const endpoint="/api/local/v38/movement";
  assert.equal((await req(base,endpoint,"POST",movement,null)).status,401);
  assert.equal((await req(base,endpoint,"POST",movement,stranger)).status,404);
  assert.equal((await req(base,endpoint,"POST",movement)).status,200);
  const result=await (await req(base,"/api/local/v38/summary?shift_id="+shift)).json();
  assert.equal(result.summary.expected_minor,"13000");
  const history=await (await req(base,"/api/local/v38/movements?shift_id="+shift)).json();
  assert.equal(history.movements.length,1);
  const closed=await (await req(base,"/api/local/v37/shift/close","POST",
   {shift_id:shift,counted_minor:12800})).json();
  assert.equal(closed.shift.variance_minor,"-200");
  assert.deepEqual(calls[0].args.slice(0,2),[store,other]);
  assert.ok(calls.every(c=>c.sql.startsWith("SELECT ")));
 });
});
test("unknown keys, forged actor, invalid amount, mutation and conflict fail closed",async()=>{
 await serve(async base=>{
  const endpoint="/api/local/v38/movement";
  for(const extra of [{store_id:store},{cashier_id:other},{total_minor:1},{reprint:true}]){
   assert.equal((await req(base,endpoint,"POST",{...movement,...extra})).status,400);
  }
  for(const n of [-1,0,12.5,10000000000000]){
   assert.equal((await req(base,endpoint,"POST",{...movement,amount_minor:n})).status,400);
  }
  assert.equal((await req(base,endpoint,"POST",{...movement,reason:"x"})).status,400);
  assert.equal((await req(base,endpoint,"POST",{...movement,kind:"refund"})).status,400);
  assert.equal((await req(base,endpoint,"POST",{...movement,amount_minor:9000000})).status,409);
  assert.equal((await req(base,"/api/local/v38/summary?shift_id="+shift+"&shift_id="+shift)).status,400);
  assert.equal((await req(base,endpoint,"DELETE")).status,405);
  assert.equal((await req(base,"/api/local/v37/shift/close","POST",
    {shift_id:shift,counted_minor:12800,expected_minor:9999})).status,400);
 });
});
