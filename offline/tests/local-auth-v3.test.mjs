import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { hashLocalPassword } from "../local-password.mjs";
import { createLocalAuthV3 } from "../local-auth-v3.mjs";
import { createLocalPosHandlerV3 } from "../local-pos-api-v3.mjs";

const store="10000000-0000-0000-0000-000000000001";
const userId="20000000-0000-0000-0000-000000000002";
const product="30000000-0000-0000-0000-000000000003";
const request="40000000-0000-0000-0000-000000000004";
const secret="v3-test-secret-".repeat(3);
const password="secure local password #123";
async function mockDb() {
  const row={id:userId,store_id:store,username:"cashier1",role:"cashier",enabled:true,
    session_version:1,failed_attempts:0,locked_until:null,password_hash:await hashLocalPassword(password)};
  const checkoutCalls=[];
  const query=async (sql,args=[])=>{
    if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK")return {rows:[]};
    if(sql.includes("FROM zhirox_local.local_users") && sql.includes("username=$2"))
      return {rows:args[1]===row.username?[{...row}]:[]};
    if(sql.includes("FROM zhirox_local.local_users") && sql.includes("id=$2"))
      return {rows:args[1]===row.id?[{...row}]:[]};
    if(sql.includes("SET failed_attempts=failed_attempts+1")) {
      row.failed_attempts++;
      if(row.failed_attempts>=5)row.locked_until=new Date(Date.now()+900000).toISOString();
      return {rows:[]};
    }
    if(sql.includes("SET failed_attempts=0,locked_until=NULL")){
      row.failed_attempts=0;row.locked_until=null;return {rows:[]};
    }
    if(sql.includes("checkout_cash_v1")){
      checkoutCalls.push(args);
      return {rows:[{sale_id:"test-sale",receipt_no:"7",replayed:false}]};
    }
    throw Error("unexpected test query: "+sql);
  };
  return {row,checkoutCalls,pool:{connect:async()=>({query,release(){}}),query}};
}
async function withServer(pool,callback){
  const server=createServer(createLocalPosHandlerV3({pool,secret}));
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  try{await callback("http://127.0.0.1:"+server.address().port)}
  finally{await new Promise(done=>server.close(done))}
}
function post(base,path,body,token){
  return fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",
    ...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});
}
test("local login needs correct credentials and denies invalid name",async()=>{
  const {pool}=await mockDb();
  const auth=createLocalAuthV3({pool,secret});
  assert.equal(await auth.login({store_id:store,username:"cashier1",password:"not the password"}),null);
  assert.equal(await auth.login({store_id:store,username:"missing",password}),null);
  assert.equal((await auth.login({store_id:store,username:"cashier1",password})).role,"cashier");
});
test("five login failures lock the local account",async()=>{
  const {row,pool}=await mockDb();
  const auth=createLocalAuthV3({pool,secret});
  for(let i=0;i<5;i++) assert.equal(await auth.login({store_id:store,username:"cashier1",password:"incorrect-long-password"}),null);
  assert.equal(row.failed_attempts,5);
  assert.equal(await auth.login({store_id:store,username:"cashier1",password}),null);
});
test("local checkout binds DB identity to session, blocks caller impersonation",async()=>{
  const {pool,checkoutCalls}=await mockDb();
  await withServer(pool,async base=>{
    const loginRes=await post(base,"/api/local/v3/login",{store_id:store,username:"cashier1",password});
    assert.equal(loginRes.status,200);
    const {token}=await loginRes.json();
    assert.ok(token);
    const lines=[{product_id:product,qty:1}];
    const ok=await post(base,"/api/local/v3/checkout",{request_id:request,lines},token);
    assert.equal(ok.status,200);
    assert.equal(checkoutCalls[0][0],store);
    assert.equal(checkoutCalls[0][1],userId);
    const invalid=await post(base,"/api/local/v3/checkout",
      {request_id:request,lines,cashier_id:"99999999-9999-9999-9999-999999999999"},token);
    assert.equal(invalid.status,400);
    assert.equal(checkoutCalls.length,1);
    const anonymous=await post(base,"/api/local/v3/checkout",{request_id:request,lines});
    assert.equal(anonymous.status,401);
  });
});
test("disable or bump session version revokes checkout access",async()=>{
  const {pool,row}=await mockDb();
  const auth=createLocalAuthV3({pool,secret});
  const login=await auth.login({store_id:store,username:"cashier1",password});
  assert.ok(await auth.authorize(login.token));
  row.session_version+=1;
  assert.equal(await auth.authorize(login.token),null);
  const newer=await auth.login({store_id:store,username:"cashier1",password});
  row.enabled=false;
  assert.equal(await auth.authorize(newer.token),null);
});
