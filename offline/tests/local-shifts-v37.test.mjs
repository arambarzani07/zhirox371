import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalShiftHandlerV37} from "../local-shifts-v37.mjs";
const store="10000000-0000-0000-0000-000000000037";
const cashier="20000000-0000-0000-0000-000000000037";
const other="20000000-0000-0000-0000-000000000038";
const shift="40000000-0000-0000-0000-000000000037";
const secret="v37-isolated-test-only-secret".repeat(3);
const codec=makeLocalSessionCodec(secret);
const token=codec.issue({store_id:store,user_id:cashier,role:"cashier"});
const wrong=codec.issue({store_id:store,user_id:other,role:"cashier"});
function fixture(){
 const calls=[],db={state:null};
 return {calls,db,pool:{
  connect:async()=>{throw Error("not a connection test");},
  query:async(sql,args)=>{
   if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
    return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
   calls.push({sql,args});assert.match(sql,/^SELECT /);
   if(sql.includes("open_cash_shift_v37")){
    if(args[1]!==cashier)throw Object.assign(Error("cashier"),{code:"P3701"});
    if(db.state)throw Object.assign(Error("duplicate"),{code:"P3702"});
    db.state={shift_id:shift,state:"open",opening_minor:"10000"};
    return {rows:[db.state]};
   }
   if(sql.includes("close_cash_shift_v37")){
    if(args[1]!==cashier)throw Object.assign(Error("cashier"),{code:"P3701"});
    if(!db.state)throw Object.assign(Error("not found"),{code:"P3701"});
    db.state={...db.state,state:"closed",cash_sales_minor:"2500",
     expected_minor:"12500",counted_minor:"12900",variance_minor:"400"};
    return {rows:[db.state]};
   }
   if(sql.includes("FROM zhirox_local.cash_shifts_v37"))
    return {rows:args[1]===cashier&&db.state?.state==="open"?[db.state]:[]};
   throw Error("unexpected SQL: "+sql);
  }
 }};
}
async function serve(pool,fn){
 const srv=createServer(createLocalShiftHandlerV37({pool,secret}));
 await new Promise(ok=>srv.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+srv.address().port);}
 finally{await new Promise(ok=>srv.close(ok));}
}
const request=(base,path,method="GET",payload=null,t=token)=>fetch(base+"/api/local/v37/shift"+path,{
 method,headers:{...(t?{Authorization:"Bearer "+t}:{}),...(payload?{"Content-Type":"application/json"}:{})},
 ...(payload?{body:JSON.stringify(payload)}:{})
});
test("only verified cashiers can open/close and query their own shift",async()=>{
 const f=fixture();
 await serve(f.pool,async base=>{
  assert.equal((await request(base,"", "GET",null,null)).status,401);
  assert.equal((await request(base,"", "GET",null,"fake")).status,401);
  assert.equal((await request(base,"/open","POST",{shift_id:shift,opening_minor:10000},wrong)).status,404);
  const open=await request(base,"/open","POST",{shift_id:shift,opening_minor:10000});
  assert.equal(open.status,200);
  assert.equal((await open.json()).shift.state,"open");
  const active=await (await request(base,"")).json();
  assert.equal(active.shift.shift_id,shift);
  const closed=await (await request(base,"/close","POST",{shift_id:shift,counted_minor:12900})).json();
  assert.equal(closed.shift.variance_minor,"400");
  assert.equal((await (await request(base,"")).json()).shift,null);
  assert.ok(f.calls.every(x=>x.sql.startsWith("SELECT ")));
  assert.deepEqual(f.calls.filter(x=>x.sql.includes("close_cash_shift_v37"))[0].args,
   [store,cashier,shift,12900]);
 });
});
test("rejects browser-supplied store/cashier, invalid cash and duplicate values",async()=>{
 const f=fixture();
 await serve(f.pool,async base=>{
  const valid={shift_id:shift,opening_minor:10000};
  assert.equal((await request(base,"/open","POST",{...valid,cashier_id:other})).status,400);
  assert.equal((await request(base,"/open","POST",{...valid,store_id:store})).status,400);
  assert.equal((await request(base,"/open","POST",{...valid,opening_minor:-5})).status,400);
  assert.equal((await request(base,"/open","POST",{...valid,opening_minor:2.5})).status,400);
  assert.equal((await request(base,"/open","POST",{...valid,opening_minor:1e15})).status,400);
  assert.equal((await request(base,"/open","POST",{...valid,shift_id:"fake"})).status,400);
  assert.equal((await request(base,"?store_id="+store)).status,400);
  assert.equal((await request(base,"/close","GET")).status,405);
  assert.equal((await request(base,"/open","POST",valid)).status,200);
  assert.equal((await request(base,"/open","POST",valid)).status,409);
  assert.equal(f.calls.filter(x=>x.sql.includes("open_cash_shift_v37")).length,2);
 });
});
