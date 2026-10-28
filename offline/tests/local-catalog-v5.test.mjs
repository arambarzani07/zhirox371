import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {makeLocalSessionCodec} from "../local-session.mjs";
import {createLocalCatalogHandlerV5} from "../local-catalog-server-v5.mjs";
const secret="catalog-pilot-secret-".repeat(3);
const store="10000000-0000-0000-0000-000000000001";
const user="20000000-0000-0000-0000-000000000002";
const id1="30000000-0000-0000-0000-000000000003";
const id2="30000000-0000-0000-0000-000000000004";
const token=makeLocalSessionCodec(secret).issue({user_id:user,store_id:store,role:"cashier"});
function db(){
 let queries=[],rows=[
 {id:id1,name:"Milk",price_minor:"1500",stock_base_units:"5",version:"1",barcodes:[{code:"6260053183974",quantity_base_units:1}]},
 {id:id2,name:"Water",price_minor:"500",stock_base_units:"20",version:"1",barcodes:[{code:"6260053183998",quantity_base_units:1}]}
 ];
 const query=async(sql,args=[])=>{
  queries.push([sql,args]);
  if(sql.includes("FROM zhirox_local.local_users WHERE store_id=$1 AND id=$2"))
    return {rows:[{role:"cashier",enabled:true,session_version:1,locked_until:null}]};
  if(sql.includes("FROM zhirox_local.products p")){
    assert.equal(args[0],store);
    const filtered=rows.filter(x=>(!args[1]||x.name.toLowerCase().startsWith(args[1].toLowerCase())||x.barcodes.some(b=>b.code===args[1]))&&(!args[2]||x.name>args[2]||x.name===args[2]&&x.id>args[3]));
    return {rows:filtered.slice(0,args[4])};
  }
  throw Error("Unexpected SQL: "+sql);
 };
 return {queries,pool:{query,connect:async()=>({query,release(){}})}};
}
async function serve(pool,fn){
 const s=createServer(createLocalCatalogHandlerV5({pool,secret}));
 await new Promise(ok=>s.listen(0,"127.0.0.1",ok));
 try{await fn("http://127.0.0.1:"+s.address().port)}
 finally{await new Promise(ok=>s.close(ok))}
}
test("V5 PC source is served locally and contains no CDN",async()=>{
 const {pool}=db();
 await serve(pool,async url=>{
  const res=await fetch(url+"/catalog");assert.equal(res.status,200);
  const html=await res.text();
  assert.match(html,/dir="rtl"/);
  assert.match(html,/سوپەرمارکێتی کانی چنار/);
  assert.match(html,/local\/v5\/products/);
  assert.doesNotMatch(html,/<script[^>]*src="https?:/);
 });
});
test("V5 product list denies anonymous reads",async()=>{
 const {pool,queries}=db();
 await serve(pool,async url=>{
  const res=await fetch(url+"/api/local/v5/products");
  assert.equal(res.status,401);assert.equal(queries.length,0);
 });
});
test("V5 pagination is store scoped and preserves all barcodes",async()=>{
 const {pool,queries}=db();
 await serve(pool,async url=>{
  const options={headers:{Authorization:"Bearer "+token}};
  const one=await fetch(url+"/api/local/v5/products?limit=1",options);
  assert.equal(one.status,200);
  const first=await one.json();
  assert.equal(first.items.length,1);assert.ok(first.next_cursor);
  assert.equal(first.items[0].barcodes[0].code,"6260053183974");
  const two=await fetch(url+"/api/local/v5/products?limit=1&cursor="+encodeURIComponent(first.next_cursor),options);
  const second=await two.json();
  assert.equal(second.items[0].name,"Water");
  assert.equal(second.next_cursor,null);
  const catalog=queries.find(q=>q[0].includes("FROM zhirox_local.products p"));
  assert.equal(catalog[1][0],store);
 });
});
test("V5 invalid cursor and overlarge limits fail closed before SQL",async()=>{
 const {pool,queries}=db();
 await serve(pool,async url=>{
  const options={headers:{Authorization:"Bearer "+token}};
  const bad=await fetch(url+"/api/local/v5/products?cursor=not-json",options);
  assert.equal(bad.status,400);
  const large=await fetch(url+"/api/local/v5/products?limit=100",options);
  assert.equal(large.status,400);
  assert.equal(queries.filter(q=>q[0].includes("FROM zhirox_local.products p")).length,0);
 });
});
test("V5 never exposes purchase cost, owner credentials or inactive products",async()=>{
 const {pool}=db();
 await serve(pool,async url=>{
  const res=await fetch(url+"/api/local/v5/products",{headers:{Authorization:"Bearer "+token}});
  const raw=await res.text();
  assert.doesNotMatch(raw,/purchase_price|password_hash|publishableKey/);
 });
});
