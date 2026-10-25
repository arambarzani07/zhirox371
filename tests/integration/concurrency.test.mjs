import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";

const STORE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER="11111111-1111-4111-8111-111111111111";
const A="22222222-2222-4222-8222-222222222222";
const B="33333333-3333-4333-8333-333333333333";
const STRANGER="44444444-4444-4444-8444-444444444444";
const SHIFT_A="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SHIFT_B="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const uuid=n=>"99999999-9999-4999-8999-"+String(n).padStart(12,"0");
function sql(q){return execFileSync("psql",["-X","-At","-v","ON_ERROR_STOP=1","-c",q],{encoding:"utf8",timeout:20000}).trim()}
function json(q){return JSON.parse(sql(q).split("\n").filter(Boolean).at(-1))}
function seed(qty=2){
 sql([
 "truncate table auth.users,public.retail_stores cascade;",
 "insert into auth.users(id) values ('"+OWNER+"'),('"+A+"'),('"+B+"'),('"+STRANGER+"');",
 "insert into public.retail_stores(id,owner_user_id,name,currency) values ('"+STORE+"','"+OWNER+"','QA Store','IQD');",
 "insert into public.retail_memberships(store_id,user_id,role,active) values ('"+STORE+"','"+A+"','cashier',true),('"+STORE+"','"+B+"','cashier',true);",
 "insert into public.retail_products(id,store_id,name,price_minor,currency,active) values ('"+PRODUCT+"','"+STORE+"','QA Item',1000,'IQD',true);",
 "insert into public.retail_stock_balances(store_id,product_id,quantity) values ('"+STORE+"','"+PRODUCT+"',"+qty+");",
 "insert into public.retail_cash_sessions(id,store_id,cashier_id,opening_cash_minor) values ('"+SHIFT_A+"','"+STORE+"','"+A+"',200),('"+SHIFT_B+"','"+STORE+"','"+B+"',200);"
 ].join("\n"));
}
function asUser(user,statement){
 return "begin; set local role authenticated; select set_config('request.jwt.claim.sub','"+user+"',true); "+statement+"; commit;";
}
function checkout(user,request,qty=1,cash=1000){
 const json=JSON.stringify([{product_id:PRODUCT,quantity:qty}]);
 return asUser(user,"select public.retail_checkout_cash('"+STORE+"'::uuid,'"+request+"'::uuid,'"+json+"'::jsonb,"+cash+"::bigint)");
}
function closeShift(user,shift,counted){
 return asUser(user,"select (public.retail_shift_close('"+STORE+"'::uuid,'"+shift+"'::uuid,"+counted+"::bigint))::text");
}
function movement(user,request,amount=500){
 return asUser(user,"select public.retail_cash_movement('"+STORE+"'::uuid,'"+SHIFT_A+"'::uuid,'"+request+"'::uuid,'cash_in',"+amount+"::bigint,'QA intake')");
}
function run(q){
 return new Promise(resolve=>{
   const child=spawn("psql",["-X","-At","-v","ON_ERROR_STOP=1","-c",q],{env:process.env});
   let stdout="",stderr="";
   child.stdout.on("data",b=>stdout+=b.toString());
   child.stderr.on("data",b=>stderr+=b.toString());
   child.on("error",e=>resolve({success:false,stderr:String(e),stdout}));
   child.on("close",code=>{
     const found=stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig)||[];
     resolve({success:code===0,uuid:found.at(-1),stdout,stderr,code});
   });
 });
}
function state(){
 return json("select json_build_object("+
 "'sales',(select count(*) from public.retail_sales where status='posted'),"+
 "'all_sales',(select count(*) from public.retail_sales),"+
 "'stock',(select quantity from public.retail_stock_balances where product_id='"+PRODUCT+"'),"+
 "'events',(select count(*) from public.retail_stock_events where reason='sale'),"+
 "'receipts',(select count(*) from public.retail_receipt_counters),"+
 "'cash_movements',(select count(*) from public.retail_cash_movements))::text");
}
test("two cashiers racing the final unit cannot oversell",async()=>{
 seed(1);
 const [x,y]=await Promise.all([run(checkout(A,uuid(1))),run(checkout(B,uuid(2)))]);
 assert.equal([x,y].filter(z=>z.success).length,1,JSON.stringify([x,y]));
 assert.match([x,y].find(z=>!z.success).stderr,/Insufficient stock/i);
 const s=state();assert.equal(s.sales,1);assert.equal(s.stock,0);assert.equal(s.events,1);assert.equal(s.receipts,1);
});
test("simultaneous identical checkout retries return the same sale",async()=>{
 seed(2);
 const q=checkout(A,uuid(3));
 const [x,y]=await Promise.all([run(q),run(q)]);
 assert.equal(x.success,true,x.stderr);assert.equal(y.success,true,y.stderr);assert.equal(x.uuid,y.uuid);
 const s=state();assert.equal(s.sales,1);assert.equal(s.all_sales,1);assert.equal(s.stock,1);assert.equal(s.events,1);
});
test("reusing checkout UUID with changed cash amount is denied",async()=>{
 seed(2);
 assert.equal((await run(checkout(A,uuid(4)))).success,true);
 const x=await run(checkout(A,uuid(4),1,1100));
 assert.equal(x.success,false);assert.match(x.stderr,/different actor or payload/i);assert.equal(state().sales,1);
});
test("different cashier cannot replay another cashier's request",async()=>{
 seed(2);
 assert.equal((await run(checkout(A,uuid(5)))).success,true);
 const x=await run(checkout(B,uuid(5)));
 assert.equal(x.success,false);assert.match(x.stderr,/different actor or payload/i);assert.equal(state().sales,1);
});
test("close shift racing checkout preserves closing ledger totals",async()=>{
 seed(2);
 const [sale,close]=await Promise.all([run(checkout(A,uuid(6))),run(closeShift(A,SHIFT_A,1200))]);
 assert.equal(close.success,true,close.stderr);
 if(!sale.success)assert.match(sale.stderr,/No open cash shift/i);
 const balance=json("select json_build_object('status',status,'opening',opening_cash_minor,"+
  "'sales',sales_total_minor,'moves',movements_net_minor,'expected',expected_cash_minor,"+
  "'posted',(select coalesce(sum(total_minor),0) from public.retail_sales where cash_session_id='"+SHIFT_A+"' and status='posted'))::text from public.retail_cash_sessions where id='"+SHIFT_A+"'");
 assert.equal(balance.status,"closed");assert.equal(balance.sales,balance.posted);
 assert.equal(balance.expected,balance.opening+balance.sales+balance.moves);
 assert.equal(state().sales,sale.success?1:0);
});
test("concurrent same-ID cash movements count only once",async()=>{
 seed(2);
 const q=movement(A,uuid(7));
 const [x,y]=await Promise.all([run(q),run(q)]);
 assert.equal(x.success,true,x.stderr);assert.equal(y.success,true,y.stderr);assert.equal(x.uuid,y.uuid);
 assert.equal(state().cash_movements,1);
});
test("checkout with no open shift rolls back all sale effects",async()=>{
 seed(1);
 sql("delete from public.retail_cash_sessions where id='"+SHIFT_A+"'");
 const x=await run(checkout(A,uuid(8)));
 assert.equal(x.success,false);assert.match(x.stderr,/No open cash shift/i);
 const s=state();assert.equal(s.all_sales,0);assert.equal(s.stock,1);assert.equal(s.receipts,0);
});
test("user without membership cannot make a sale",async()=>{
 seed(1);
 const x=await run(checkout(STRANGER,uuid(9)));
 assert.equal(x.success,false);assert.match(x.stderr,/Cashier permission required/i);
 assert.equal(state().sales,0);
});
test("identical posted checkout replay works after shift closure",async()=>{
 seed(2);
 const x=await run(checkout(A,uuid(10)));
 assert.equal(x.success,true,x.stderr);
 const close=await run(closeShift(A,SHIFT_A,1200));
 assert.equal(close.success,true,close.stderr);
 const y=await run(checkout(A,uuid(10)));
 assert.equal(y.success,true,y.stderr);assert.equal(x.uuid,y.uuid);
 assert.equal(state().sales,1);assert.equal(state().stock,1);
});

test("twelve concurrent checkout calls selling three units commit exactly three times",async()=>{
 seed(3);
 const results=await Promise.all(Array.from({length:12},(_,i)=>run(
  checkout(i%2===0?A:B,uuid(20+i))
 )));
 const passed=results.filter(x=>x.success);
 const failed=results.filter(x=>!x.success);
 assert.equal(passed.length,3,JSON.stringify(results));
 assert.equal(failed.length,9);
 assert.ok(failed.every(x=>/Insufficient stock/i.test(x.stderr)),JSON.stringify(failed));
 const s=state();
 assert.equal(s.stock,0);
 assert.equal(s.sales,3);
 assert.equal(s.events,3);
 const receiptNumbers=sql("select string_agg(receipt_no::text,',' order by receipt_no) from public.retail_sales where status='posted'");
 assert.equal(receiptNumbers,"1,2,3");
});
