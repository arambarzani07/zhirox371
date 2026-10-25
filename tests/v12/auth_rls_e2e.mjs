import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

// V12 only runs on the ephemeral GitHub Actions Supabase CLI stack.
// This deliberate guard prevents test mistakes from contacting hosted Supabase.
const local=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8"}));
const url=local.API_URL||local.api_url;
const anon=local.ANON_KEY||local.anon_key;
const service=local.SERVICE_ROLE_KEY||local.service_role_key;
assert.match(url||"",/^http:\/\/(?:127\.0\.0\.1|localhost):54321\/?$/,"V12 must only use loopback Supabase");
assert.ok(anon&&service,"CLI must supply disposable local keys");
assert.ok(!process.env.SUPABASE_ACCESS_TOKEN,"Never run V12 while linked to an online Supabase account");
const make=(key=anon)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const administrator=make(service); // Only local QA fixtures and confirming QA email registrations.
const fail=(result,desc)=>assert.ok(result.error,desc+": expected rejection");
const ok=(result,desc)=>{assert.equal(result.error,null,desc+": "+result.error?.message);return result.data};
const tests=[];
function passed(msg){tests.push(msg);console.log("PASS "+tests.length+": "+msg)}
const code=()=>randomUUID();
const login=async role=>{
 const email="v12-"+role+"-"+code().slice(0,8)+"@qa.invalid";
 const password="Qa_V12_" + code() + "_Only!";
 const client=make();
 const signup=await client.auth.signUp({email,password,options:{data:{claimed_role:"owner",role:"owner"}}});
 ok(signup,role+" real GoTrue signup");
 const id=signup.data.user?.id;
 assert.ok(id,"GoTrue user id missing");
 // Confirm test-only email when local dev configuration requires it.
 if(!signup.data.session)ok(await administrator.auth.admin.updateUserById(id,{email_confirm:true}),"QA-only email confirmation");
 const auth=await client.auth.signInWithPassword({email,password});
 ok(auth,role+" real password login");
 assert.equal(auth.data.user?.id,id);
 assert.ok(auth.data.session?.access_token.split(".").length===3,"JWT missing");
 const who=await client.auth.getUser();
 assert.equal(ok(who,"getUser")?.user?.id,id,"GoTrue must verify issued token");
 return {role,id,client};
};
function localSQL(query){
 const args=["-X","-q","-h","127.0.0.1","-p","54322","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-t","-A","-c",query];
 const r=spawnSync("psql",args,{encoding:"utf8",env:{...process.env,PGPASSWORD:"postgres"}});
 if(r.status!==0)throw new Error("Local-only SQL failed: "+r.stderr.slice(0,500));
 return r.stdout.trim();
}

const accounts={};
for(const type of ["owner","manager","cashier","outsider"])accounts[type]=await login(type);
passed("4 independent GoTrue sign-ups, password logins and verified JWT sessions (all local)");

const owner=accounts.owner.client,manager=accounts.manager.client,cashier=accounts.cashier.client,outsider=accounts.outsider.client;
const storeA=ok(await owner.from("retail_stores").insert({id:code(),owner_user_id:accounts.owner.id,name:"A V12 only",currency:"IQD"}).select().single(),"owner creates store A");
const storeB=ok(await outsider.from("retail_stores").insert({id:code(),owner_user_id:accounts.outsider.id,name:"B V12 only",currency:"IQD"}).select().single(),"outsider creates store B");
assert.equal(storeA.owner_user_id,accounts.owner.id);
fail(await cashier.from("retail_stores").insert({id:code(),owner_user_id:accounts.owner.id,name:"Forged store",currency:"IQD"}),"cashier cannot impersonate owner");
passed("only owning authenticated users create stores, forged owner_user_id is rejected");

let rows=ok(await outsider.from("retail_stores").select("id"),"isolated outsider store read");
assert.deepEqual(rows.map(x=>x.id),[storeB.id]);
rows=ok(await owner.from("retail_stores").select("id"),"isolated owner store read");
assert.deepEqual(rows.map(x=>x.id),[storeA.id]);
passed("tenant A/B stores are fully isolated by actual PostgreSQL RLS");

ok(await owner.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.manager.id,p_role:"manager",p_active:true}),"owner assigns manager");
ok(await owner.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.cashier.id,p_role:"cashier",p_active:true}),"owner assigns cashier");
fail(await manager.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.outsider.id,p_role:"manager",p_active:true}),"manager cannot promote users");
fail(await cashier.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.outsider.id,p_role:"manager",p_active:true}),"cashier cannot promote users");
fail(await owner.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.outsider.id,p_role:"owner",p_active:true}),"owner role escalation forbidden");
fail(await owner.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.owner.id,p_role:"manager",p_active:true}),"self-assignment forbidden");
passed("owner-only staff assignment, manager/cashier privilege escalation and self-promotion denied");

assert.deepEqual(ok(await manager.from("retail_stores").select("id"),"manager store read").map(x=>x.id),[storeA.id]);
assert.deepEqual(ok(await cashier.from("retail_stores").select("id"),"cashier store read").map(x=>x.id),[storeA.id]);
const memberships=ok(await cashier.from("retail_memberships").select("user_id"),"cashier memberships");
assert.deepEqual(memberships.map(x=>x.user_id),[accounts.cashier.id]);
passed("role memberships only expose own row to cashier, managers see assigned store");

const item=ok(await owner.rpc("retail_create_product",{
 p_store_id:storeA.id,p_name:"V12 تاقیکردنەوە",p_barcode:"9999000012345",p_price_minor:1500
}),"owner atomic product RPC");
assert.ok(item);
assert.equal(ok(await cashier.from("retail_products").select("id"),"cashier reads products").length,1);
assert.equal(ok(await manager.from("retail_products").select("id"),"manager reads products").length,1);
assert.equal(ok(await outsider.from("retail_products").select("id"),"outsider reads products").length,0);
fail(await manager.rpc("retail_create_product",{p_store_id:storeA.id,p_name:"Forged",p_barcode:"00000000",p_price_minor:1}),"manager cannot create owner-only product");
fail(await cashier.rpc("retail_create_product",{p_store_id:storeB.id,p_name:"Cross",p_barcode:"01010101",p_price_minor:1}),"cashier cannot write other store");
passed("owner-only atomic product create and cross-store catalogue RLS checks");

const customer=ok(await owner.from("retail_customers").insert({store_id:storeA.id,name:"V12 QA customer",credit_limit_minor:0}).select().single(),"owner creates customer");
assert.ok(customer.id);
assert.equal(ok(await manager.from("retail_customers").select("id"),"manager customer read").length,1);
assert.equal(ok(await cashier.from("retail_customers").select("id"),"cashier customer read").length,0);
assert.equal(ok(await outsider.from("retail_customers").select("id"),"outsider customer read").length,0);
passed("customer details withheld from cashiers and cross-tenant users");

fail(await cashier.rpc("retail_receive_stock",{p_store:storeA.id,p_product:item,p_quantity:2,p_reason:"opening"}),"cashier stock-receive forbidden");
const stock=ok(await manager.rpc("retail_receive_stock",{p_store:storeA.id,p_product:item,p_quantity:3,p_reason:"opening"}),"manager stock-receive allowed");
assert.equal(Number(stock),3);
assert.equal(ok(await outsider.from("retail_stock_balances").select("product_id"),"outsider sees no stock").length,0);
assert.equal(ok(await cashier.from("retail_stock_balances").select("product_id"),"cashier sees own store stock").length,1);
passed("manager can receive stock; cashier/outsider cannot alter protected stock");

const session=ok(await cashier.rpc("retail_shift_open",{p_store:storeA.id,p_opening:100}),"cashier opens shift");
assert.ok(session);
fail(await outsider.rpc("retail_shift_open",{p_store:storeA.id,p_opening:0}),"outsider cannot open store A shift");
const receipt=ok(await cashier.rpc("retail_checkout_cash",{
 p_store:storeA.id,p_request:code(),p_items:[{product_id:item,quantity:1}],p_cash_received:2000
}),"cashier posts cash checkout");
assert.ok(receipt);
assert.equal(ok(await owner.from("retail_sales").select("id"),"owner sees one receipt").length,1);
assert.equal(ok(await outsider.from("retail_sales").select("id"),"outsider sees no store A receipts").length,0);
passed("cashier cash-shift checkout succeeds only within owned store; cross-tenant RPC denied");

const auditMgr=ok(await manager.from("retail_audit_events").select("action"),"manager audit read");
assert.ok(auditMgr.length>=3);
assert.equal(ok(await cashier.from("retail_audit_events").select("action"),"cashier audit read").length,0);
assert.equal(ok(await outsider.from("retail_audit_events").select("action"),"outsider audit read").length,0);
passed("audit entries visible to owner/manager, withheld from cashier and other tenant");

ok(await owner.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.cashier.id,p_role:"cashier",p_active:false}),"owner deactivates cashier");
assert.equal(ok(await cashier.from("retail_products").select("id"),"deactivated cashier product visibility").length,0);
fail(await cashier.rpc("retail_shift_open",{p_store:storeA.id,p_opening:0}),"deactivated cashier cannot open shift");
passed("revoked cashier membership immediately loses RLS and RPC access");

const anonClient=make();
const unauth=await anonClient.from("retail_stores").select("id");
assert.ok(unauth.error||unauth.data?.length===0,"anonymous store read must never reveal rows");
const unauthRpc=await anonClient.rpc("retail_assign_staff",{p_store:storeA.id,p_user:accounts.outsider.id,p_role:"manager",p_active:true});
fail(unauthRpc,"anonymous RPC disallowed");
passed("anonymous clients cannot read protected stores or grant staff roles");

// This is a destructive action only in the DISPOSABLE local database.
// TRUNCATE bypasses RLS; production's TRUNCATE grants were read-only observed.
const dangerousGrant=localSQL("select has_table_privilege('authenticated','public.retail_customers','TRUNCATE')");
assert.equal(dangerousGrant,"t","the local RLS mirror must reproduce observed production TRUNCATE privilege");
const before=localSQL("select count(*) from public.retail_customers");
assert.equal(before,"1");
localSQL("SET ROLE authenticated; TRUNCATE TABLE public.retail_customers");
const after=localSQL("select count(*) from public.retail_customers");
assert.equal(after,"0","local authenticated role can truncate customer table despite RLS!");
console.log("::warning title=V12 SECURITY BLOCKER::Hosted privilege snapshot grants TRUNCATE to authenticated on customer table. Local QA reproduced full-table deletion despite RLS. DO NOT DEPLOY; hosted DB was not changed.");
passed("SECURITY FINDING: authenticated TRUNCATE bypasses RLS (demonstrated LOCAL ONLY)");

console.log("V12 result: "+tests.length+" local real-GoTrue/JWT/PostgREST/PostgreSQL RLS test groups passed. SECURITY RELEASE GATE BLOCKED by TRUNCATE privilege. No hosted project accessed.");
