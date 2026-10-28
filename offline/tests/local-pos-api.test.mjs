import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createLocalPosHandler } from "../local-pos-api.mjs";
const token="a".repeat(40);
const id=n=>n.toString(16).padStart(8,"0")+"-0000-0000-0000-000000000001";
async function withServer(pool,fn) {
  const server=createServer(createLocalPosHandler({pool,token}));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try {await fn("http://127.0.0.1:"+server.address().port);}
  finally {await new Promise(resolve=>server.close(resolve));}
}
test("unauthorized checkout never reaches database",async()=>{
  let calls=0;
  await withServer({connect:async()=>{calls++;throw Error("unexpected");}},async url=>{
    const res=await fetch(url+"/api/local/v1/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
    assert.equal(res.status,401);assert.equal(calls,0);
  });
});
test("checkout invokes the local database function",async()=>{
  const calls=[];
  const pool={connect:async()=>({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{receipt_no:"1",replayed:false}]};},release:()=>{}})};
  await withServer(pool,async url=>{
    const res=await fetch(url+"/api/local/v1/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:JSON.stringify({store_id:id(1),cashier_id:id(2),request_id:id(3),lines:[{product_id:id(4),qty:1}]})});
    assert.equal(res.status,200); assert.equal((await res.json()).receipt.receipt_no,"1");
    assert.match(calls[0][0],/checkout_cash_v1/);
  });
});
test("rejects invalid quantities before touching database",async()=>{
  let touched=false;
  await withServer({connect:async()=>{touched=true;throw Error("unexpected");}},async url=>{
    const res=await fetch(url+"/api/local/v1/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:JSON.stringify({store_id:id(1),cashier_id:id(2),request_id:id(3),lines:[{product_id:id(4),qty:-1}]})});
    assert.equal(res.status,400);assert.equal(touched,false);
  });
});
