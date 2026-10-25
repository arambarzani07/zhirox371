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
 const jwt=auth.data.session.access_token;
 const claims=JSON.parse(Buffer.from(jwt.split(".")[1],"base64url").toString("utf8"));
 assert.equal(claims.sub,id,"real GoTrue JWT user ID");
 assert.equal(claims.role,"authenticated","JWT database role must be authenticated");
 // The test runs without browser storage. Forward the just-issued REAL JWT
 // explicitly through PostgREST; never let a forgotten in-memory session
 // downgrade calls to the anon key during isolated Node integration tests.
 const api=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
   global:{headers:{Authorization:"Bearer "+jwt}}});
 return {role,id,client:api};
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
const ownerContext=ok(await owner.rpc("retail_v12_auth_context"),"signed GoTrue JWT reaches local PostgREST");
assert.equal(ownerContext.sub,accounts.owner.id,"PostgreSQL auth.uid must equal real JWT sub");
assert.equal(ownerContext.db_role,"authenticated","PostgREST must execute under authenticated role");
passed("GoTrue bearer token verified in real PostgreSQL auth.uid(), not just client session");
const storeAId=code(),storeBId=code();
ok(await owner.from("retail_stores").insert({id:storeAId,owner_user_id:accounts.owner.id,name:"A V12 only",currency:"IQD"}),"owner creates store A without RETURNING");
ok(await outsider.from("retail_stores").insert({id:storeBId,owner_user_id:accounts.outsider.id,name:"B V12 only",currency:"IQD"}),"outsider creates store B without RETURNING");
const storeA=ok(await owner.from("retail_stores").select("id,owner_user_id").eq("id",storeAId).single(),"owner sees inserted store A");
const storeB=ok(await outsider.from("retail_stores").select("id,owner_user_id").eq("id",storeBId).single(),"outsider sees inserted store B");
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

// V13: verify the least-privilege repair on THIS EPHEMERAL DATABASE ONLY.
// It must deny TRUNCATE for all retail tables while normal authorized work survives.
const repairArgs=["-X","-q","-h","127.0.0.1","-p","54322","-U","postgres","-d","postgres",
  "-v","ON_ERROR_STOP=1","-f","tests/v12/least_privilege_revoke.local.sql"];
const repaired=spawnSync("psql",repairArgs,{encoding:"utf8",env:{...process.env,PGPASSWORD:"postgres"}});
assert.equal(repaired.status,0,"LOCAL TRUNCATE revoke failed: "+repaired.stderr.slice(0,600));
const stillGranted=localSQL(
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "+
  "where n.nspname='public' and c.relkind='r' and c.relname like 'retail_%' "+
  "and (has_table_privilege('authenticated',c.oid,'TRUNCATE') "+
  "or has_table_privilege('anon',c.oid,'TRUNCATE'))");
assert.equal(stillGranted,"0","No retail table may retain TRUNCATE for anon/authenticated");
passed("LOCAL least-privilege fix revokes TRUNCATE across all 13 retail tables, not other data");

// Using a real SQL-capable authenticated role proves revocation closes the
// exact RLS bypass demonstrated in V12. No table data may be removed.
const customerBefore=localSQL("select count(*) from public.retail_customers");
const denyArgs=["-X","-q","-h","127.0.0.1","-p","54322","-U","postgres","-d","postgres",
  "-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose",
  "-c","SET ROLE authenticated; TRUNCATE TABLE public.retail_customers"];
const blocked=spawnSync("psql",denyArgs,{encoding:"utf8",env:{...process.env,PGPASSWORD:"postgres"}});
assert.notEqual(blocked.status,0,"Security failure: authenticated still TRUNCATEs retail_customers");
assert.match(blocked.stderr,/42501|permission denied for table/,"Denial must be caused by SQL privilege restriction");
assert.equal(localSQL("select count(*) from public.retail_customers"),customerBefore,"Blocked action altered table data");
passed("SQL-level authenticated TRUNCATE denied with no data loss after LOCAL repair");

// Existing workflows and RLS must survive the privilege-only change.
const secondProduct=ok(await owner.rpc("retail_create_product",{
  p_store_id:storeA.id,p_name:"V13 normal product",p_barcode:"9999000012346",p_price_minor:1300
}),"owner still creates catalogue items after REVOKE");
ok(await manager.rpc("retail_receive_stock",{
  p_store:storeA.id,p_product:secondProduct,p_quantity:2,p_reason:"opening"
}),"manager still receives stock after REVOKE");
ok(await owner.rpc("retail_assign_staff",{
  p_store:storeA.id,p_user:accounts.cashier.id,p_role:"cashier",p_active:true
}),"owner reactivates cashier after REVOKE");
const authorizedCheckout=ok(await cashier.rpc("retail_checkout_cash",{
  p_store:storeA.id,p_request:code(),p_items:[{product_id:secondProduct,quantity:1}],p_cash_received:1500
}),"cashier checkout unaffected after REVOKE");
assert.ok(authorizedCheckout,"Cashier receipt missing after local revoke");
assert.equal(ok(await outsider.from("retail_sales").select("id"),"tenant isolation after REVOKE").length,0);
assert.equal(ok(await cashier.from("retail_audit_events").select("id"),"cashier audit remains denied").length,0);
passed("LOCAL repair preserves owner/manager/cashier RPC flows and tenant isolation");

console.log("V13 LOCAL-only permission regression: all three added checks passed; hosted Supabase remains UNCHANGED. Release still BLOCKED pending separate approved hosted remediation.");

console.log("V12/V13 result: "+tests.length+" local real-GoTrue/JWT/PostgREST/PostgreSQL RLS test groups passed. SECURITY RELEASE GATE BLOCKED by TRUNCATE privilege. No hosted project accessed.");
