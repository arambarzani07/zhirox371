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


const newCatalog={
  advanced:true,name:"شیر و تاقیکردنەوە",sku:"MILK-101",plu:"0000020",
  unit_barcode:"6260001112223",unit_purchase_price_iqd:750,unit_sale_price_iqd:1000,
  unit_alias_barcodes:["6260001112247","6260001112254"],
  carton:{name:"کارتۆنی شیر",barcode:"6260001112230",alias_barcodes:["6260001112261","6260001112278"],units_per_carton:12,
          purchase_price_iqd:8500,sale_price_iqd:11000},currency:"IQD"
};
const productCountBefore=Number(localSQL("select count(*) from public.retail_products"));
const v14Id=ok(await owner.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:newCatalog}),
    "owner registers advanced product atomically in LOCAL QA");
assert.ok(v14Id,"Advanced product ID missing");
assert.equal(Number(localSQL("select count(*) from public.retail_products")),productCountBefore+1);
assert.equal(Number(localSQL("select count(*) from public.retail_barcodes where product_id='"+v14Id+"'")),6);
assert.equal(localSQL("select count(*) from public.retail_barcodes where product_id='"+v14Id+"' and unit_type='carton' and units_per_scan=12"),"3");
assert.equal(localSQL("select count(distinct units_per_scan) from public.retail_barcodes where product_id='"+v14Id+"' and unit_type='carton'"),"1");
assert.equal(localSQL("select price_minor||':'||purchase_price_minor from public.retail_products where id='"+v14Id+"'"),"1000:750");
assert.equal(localSQL("select sale_price_minor||':'||purchase_price_minor from public.retail_product_cartons where product_id='"+v14Id+"'"),"11000:8500");
passed("V14 local owner registration: one item, six barcodes (three cartons), true shared pack size and distinct unit/carton costs and prices");

fail(await manager.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:{
  ...newCatalog,unit_barcode:"8299944000011",unit_alias_barcodes:[],carton:null
}}),"manager may not register product");
fail(await cashier.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:{
  ...newCatalog,unit_barcode:"8299944000012",unit_alias_barcodes:[],carton:null
}}),"cashier may not register product");
fail(await outsider.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:{
  ...newCatalog,unit_barcode:"8299944000013",unit_alias_barcodes:[],carton:null
}}),"unrelated owner cannot register on foreign store");
passed("V14 product catalogue management is owner-only; cashier/manager/outsider cannot define barcodes or prices");

const duplicateBarcode={...newCatalog,sku:"MILK-102",unit_barcode:"8299944000020",
 unit_alias_barcodes:["6260001112247"],carton:null};
const duplicate=await owner.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:duplicateBarcode});
fail(duplicate,"cross-product alias collision must abort transaction");
assert.equal(duplicate.error.code,"23505");
assert.equal(Number(localSQL("select count(*) from public.retail_products")),productCountBefore+1,"Duplicate RPC partially created product");
const duplicateCartonAlias={...newCatalog,sku:"MILK-104",unit_barcode:"8299944000023",
  unit_alias_barcodes:[],carton:{...newCatalog.carton,barcode:"8299944000024",
  alias_barcodes:["6260001112278"]}};
const cartonConflict=await owner.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:duplicateCartonAlias});
fail(cartonConflict,"cross-product duplicate carton alias must abort transaction");
assert.equal(cartonConflict.error.code,"23505");
const sameItemDup={...newCatalog,sku:"MILK-105",unit_barcode:"8299944000025",
  unit_alias_barcodes:[],carton:{...newCatalog.carton,barcode:"8299944000026",
  alias_barcodes:["8299944000026"]}};
fail(await owner.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:sameItemDup}),
 "carton alias identical to own primary barcode must abort transaction");
const badAliasType={...newCatalog,sku:"MILK-106",unit_barcode:"8299944000027",
  unit_alias_barcodes:[],carton:{...newCatalog.carton,barcode:"8299944000028",
  alias_barcodes:"not-an-array"}};
fail(await owner.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:badAliasType}),
 "server must reject malformed carton alias data");
assert.equal(Number(localSQL("select count(*) from public.retail_products")),productCountBefore+1,
 "carton collisions/invalid alias payload partially created products");
const badSize={...newCatalog,sku:"MILK-103",unit_barcode:"8299944000021",
  unit_alias_barcodes:[],carton:{...newCatalog.carton,barcode:"8299944000022",units_per_carton:1}};
fail(await owner.rpc("retail_register_product_v14",{p_store_id:storeA.id,p_catalog:badSize}),"invalid carton size must be rejected");
assert.equal(Number(localSQL("select count(*) from public.retail_products")),productCountBefore+1);
passed("V14 duplicate unit/carton aliases, cross-product collisions and malformed carton arrays roll back atomically");

const managerCarton=ok(await manager.from("retail_product_cartons").select("product_id,purchase_price_minor,sale_price_minor"),"manager pack price read");
assert.ok(managerCarton.some(x=>x.product_id===v14Id&&Number(x.purchase_price_minor)===8500));
assert.equal(ok(await cashier.from("retail_product_cartons").select("product_id,purchase_price_minor"),"cashier purchase cost RLS read").length,0);
assert.equal(ok(await outsider.from("retail_product_cartons").select("product_id"),"outsider carton RLS read").length,0);
const scannedCartons=ok(await cashier.from("retail_barcodes").select("code,product_id,unit_type,units_per_scan"),"cashier readonly barcode lookup")
 .filter(x=>["6260001112230","6260001112261","6260001112278"].includes(x.code));
assert.equal(scannedCartons.length,3);
assert.ok(scannedCartons.every(x=>x.product_id===v14Id&&x.unit_type==="carton"&&Number(x.units_per_scan)===12));
passed("V14 manager sees pack purchase costs; cashier can resolve 3 carton barcodes but cannot read costs");
console.log("V14 local QA: 4 security/product registration groups passed with carton multi-barcodes. Carton checkout is still disabled in the existing unit-only cashier contract. No hosted DB modifications.");

const v15Snapshot=ok(await owner.rpc("retail_product_snapshot_v15",{
 p_store_id:storeA.id,p_product_id:v14Id}),"owner reads cost-safe product editor snapshot");
assert.equal(v15Snapshot.version,1);
assert.equal(v15Snapshot.unit_barcode,newCatalog.unit_barcode);
assert.deepEqual(v15Snapshot.carton.alias_barcodes,["6260001112261","6260001112278"]);
fail(await cashier.rpc("retail_product_snapshot_v15",{
 p_store_id:storeA.id,p_product_id:v14Id}),"cashier cannot see confidential product editor snapshot");
fail(await manager.rpc("retail_product_history_v15",{
 p_store_id:storeA.id,p_product_id:v14Id}),"manager cannot retrieve owner-only cost history");
passed("V15 owner-only editor snapshot + cost history, strict cashier and manager denial");
const previousSales=localSQL("select count(*)||':'||coalesce(sum(total_minor),0) from public.retail_sales");
const changedV15={...newCatalog,name:"شیری گۆڕدراو",unit_sale_price_iqd:1250,
 unit_alias_barcodes:["6260001112254","9999000098001"],
 carton:{...newCatalog.carton,sale_price_iqd:11500,
          alias_barcodes:["6260001112278","9999000098002"]}};
const edited=ok(await owner.rpc("retail_update_product_v15",{
 p_store_id:storeA.id,p_product_id:v14Id,p_expected_version:1,p_catalog:changedV15}),
 "owner updates the existing item atomically");
assert.equal(edited.id,v14Id);
assert.equal(edited.version,2);
assert.equal(edited.unit_sale_price_iqd,1250);
assert.equal(edited.carton.sale_price_iqd,11500);
assert.equal(edited.carton.units_per_carton,12);
assert.equal(localSQL("select count(*) from public.retail_products where id='"+v14Id+"'"),"1");
assert.equal(localSQL("select count(*) from public.retail_barcodes where product_id='"+v14Id+"' and active"),"6");
assert.equal(localSQL("select count(*) from public.retail_barcodes where product_id='"+v14Id+"' and not active"),"2");
assert.equal(localSQL("select active::text from public.retail_barcodes where store_id='"+storeA.id+"' and code='6260001112261'"),"false");
assert.equal(localSQL("select active::text from public.retail_barcodes where store_id='"+storeA.id+"' and code='9999000098002'"),"true");
assert.equal(localSQL("select count(distinct units_per_scan) from public.retail_barcodes where product_id='"+v14Id+"' and unit_type='carton' and active"),"1");
assert.equal(localSQL("select sale_price_minor from public.retail_product_cartons where product_id='"+v14Id+"'"),"11500");
assert.equal(localSQL("select count(*)||':'||coalesce(sum(total_minor),0) from public.retail_sales"),previousSales,
 "historical receipts must not change during product price updates");
passed("V15 real local atomic edit: same product id, version 2, 2 retired aliases, 6 current codes and unchanged historical sale");
const auditHistory=ok(await owner.rpc("retail_product_history_v15",{
 p_store_id:storeA.id,p_product_id:v14Id}),"owner reads immutable audit");
const change=auditHistory.find(x=>x.action==="product.update_v15");
assert.ok(change&&change.actor_id===accounts.owner.id);
assert.equal(change.details.before.unit_sale_price_iqd,1000);
assert.equal(change.details.after.unit_sale_price_iqd,1250);
assert.equal(change.details.old_version,1);
assert.equal(change.details.new_version,2);
assert.ok(change.details.before.carton.alias_barcodes.includes("6260001112261"));
assert.ok(!change.details.after.carton.alias_barcodes.includes("6260001112261"));
fail(await owner.rpc("retail_update_product_v15",{
 p_store_id:storeA.id,p_product_id:v14Id,p_expected_version:1,p_catalog:changedV15}),
 "stale revision cannot overwrite newer price");
fail(await cashier.rpc("retail_update_product_v15",{
 p_store_id:storeA.id,p_product_id:v14Id,p_expected_version:2,p_catalog:changedV15}),
 "cashier cannot update product");
fail(await manager.rpc("retail_update_product_v15",{
 p_store_id:storeA.id,p_product_id:v14Id,p_expected_version:2,p_catalog:changedV15}),
 "manager cannot update product");
assert.equal(localSQL("select catalog_version from public.retail_products where id='"+v14Id+"'"),"2");
assert.equal(localSQL("select count(*) from public.retail_audit_events where subject_id='"+v14Id+"' and action='product.update_v15'"),"1");
passed("V15 immutable before/after audit and optimistic stale-version rejection; nonowners blocked");

const otherCode="8299944000911";
const otherProduct=ok(await owner.rpc("retail_create_product",{
 p_store_id:storeA.id,p_name:"Other product conflict fixture",p_barcode:otherCode,p_price_minor:400
}),"owner creates a distinct local product to test inter-product barcode collision");
assert.ok(otherProduct&&otherProduct!==v14Id);
const conflictingEdit={...changedV15,unit_alias_barcodes:[otherCode]};
const badEdit=await owner.rpc("retail_update_product_v15",{
 p_store_id:storeA.id,p_product_id:v14Id,p_expected_version:2,p_catalog:conflictingEdit});
fail(badEdit,"barcode of another product blocked");
assert.equal(badEdit.error.code,"23505");
const ownDuplicate={...changedV15,carton:{...changedV15.carton,alias_barcodes:[changedV15.unit_barcode]}};
fail(await owner.rpc("retail_update_product_v15",{
 p_store_id:storeA.id,p_product_id:v14Id,p_expected_version:2,p_catalog:ownDuplicate}),
 "unit code repeated as carton barcode blocked");
assert.equal(localSQL("select catalog_version from public.retail_products where id='"+v14Id+"'"),"2");
assert.equal(localSQL("select count(*) from public.retail_audit_events where subject_id='"+v14Id+"' and action='product.update_v15'"),"1");
assert.equal(localSQL("select count(*) from public.retail_barcodes where product_id='"+v14Id+"' and active"),"6");
passed("V15 cross-item and cross-unit/carton duplicates roll back all edits and audit");

console.log("V15 local QA: 4 product-edit groups passed; older sale receipts remain immutable. No hosted DB modifications.");



const milkV16={...newCatalog,sale_mode:"both",name:"Milk full carton and unit",
  unit_barcode:"8394000011010",unit_alias_barcodes:["8394000011011"],
  unit_purchase_price_iqd:750,unit_sale_price_iqd:1000,
  carton:{...newCatalog.carton,barcode:"8394000012010",alias_barcodes:["8394000012011"],
    units_per_carton:12,purchase_price_iqd:9000,sale_price_iqd:11000}};
const milkId=ok(await owner.rpc("retail_register_product_v14",{
 p_store_id:storeA.id,p_catalog:milkV16
}),"owner registers BOTH unit and carton one-item catalog");
assert.ok(milkId);
assert.equal(localSQL("select count(*) from public.retail_products where id='"+milkId+"'"),"1");
assert.equal(localSQL("select count(*) from public.retail_barcodes where product_id='"+milkId+"'"),"4");
const cartonOnly={...milkV16,name:"Carton-only registered item",sale_mode:"carton",
 unit_barcode:"",unit_alias_barcodes:[],unit_purchase_price_iqd:null,unit_sale_price_iqd:null,
 carton:{...milkV16.carton,barcode:"8394000022010",alias_barcodes:["8394000022011"]}};
const cartonOnlyId=ok(await owner.rpc("retail_register_product_v14",{
 p_store_id:storeA.id,p_catalog:cartonOnly
}),"owner registers carton-only item with NO phantom unit barcode");
assert.ok(cartonOnlyId);
assert.equal(localSQL("select count(*) from public.retail_barcodes where product_id='"+cartonOnlyId+"' and unit_type='unit'"),"0");
assert.equal(localSQL("select price_minor from public.retail_products where id='"+cartonOnlyId+"'"),"0");
const cartonOnlySnapshot=ok(await owner.rpc("retail_product_snapshot_v15",{
 p_store_id:storeA.id,p_product_id:cartonOnlyId
}),"owner loads carton-only item");
assert.equal(cartonOnlySnapshot.sale_mode,"carton");
assert.equal(cartonOnlySnapshot.unit_sale_price_iqd,null);
passed("V16 registers both or carton-only as one product, without counterfeit unit barcodes");

const exposedCost=await cashier.from("retail_products").select("purchase_price_minor").eq("store_id",storeA.id);
fail(exposedCost,"cashier must never read confidential unit acquisition cost");
assert.equal(ok(await owner.rpc("retail_product_snapshot_v15",{
 p_store_id:storeA.id,p_product_id:milkId
}),"owner reads cost via protected snapshot").unit_purchase_price_iqd,750);
const scanCatalog=ok(await cashier.rpc("retail_scan_catalog_v16",{p_store:storeA.id}),
 "cashier reads server-priced scan catalog without purchase costs");
assert.ok(scanCatalog.some(x=>x.code==="8394000011011"&&x.unit_type==="unit"&&x.price_minor===1000&&x.units_per_scan===1));
assert.ok(scanCatalog.some(x=>x.code==="8394000012011"&&x.unit_type==="carton"&&x.price_minor===11000&&x.units_per_scan===12));
assert.ok(scanCatalog.some(x=>x.code==="8394000022011"&&x.unit_type==="carton"&&x.units_per_scan===12));
assert.ok(scanCatalog.every(x=>!Object.hasOwn(x,"purchase_price_minor")));
assert.ok(!scanCatalog.some(x=>x.code==="6260001112261"),"Retired V15 carton alias must never scan");
fail(await outsider.rpc("retail_scan_catalog_v16",{p_store:storeA.id}),
 "other store may not access scan prices");
const unauthScan=await anonClient.rpc("retail_scan_catalog_v16",{p_store:storeA.id});
fail(unauthScan,"anonymous may not access barcode prices");
passed("V16 cashier scans primary and extra carton/unit codes with server prices; retired and outside access denied");

const qtyAfterLoad=ok(await manager.rpc("retail_receive_stock",{
 p_store:storeA.id,p_product:milkId,p_quantity:60,p_reason:"opening"
}),"manager receives five cartons as 60 base units");
assert.equal(Number(qtyAfterLoad),60);
const orderV16=[
 {barcode:"8394000012011",quantity:2,expected_price_minor:11000,expected_units:12},
 {barcode:"8394000011011",quantity:3,expected_price_minor:1000,expected_units:1}
];
const checkoutKey=code();
const packSale=ok(await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:checkoutKey,p_items:orderV16,p_cash_received:30000
}),"cashier checks out 2 cartons and 3 units in same receipt");
assert.ok(packSale);
assert.equal(localSQL("select total_minor||':'||change_due_minor from public.retail_sales where id='"+packSale+"'"),"25000:5000");
assert.equal(localSQL("select quantity from public.retail_stock_balances where product_id='"+milkId+"'"),"33.000");
assert.equal(localSQL("select count(*) from public.retail_sale_items where sale_id='"+packSale+"'"),"2");
assert.equal(localSQL("select string_agg(package_type||':'||quantity||':'||units_per_package||':'||base_units||':'||unit_price_minor,',' order by package_type) from public.retail_sale_items where sale_id='"+packSale+"'"),"carton:2.000:12:24.000:11000,unit:3.000:1:3.000:1000");
assert.equal(localSQL("select count(*) from public.retail_stock_events where sale_id='"+packSale+"' and delta=-27"),"1");
const saleCountAfter=localSQL("select count(*) from public.retail_sales where store_id='"+storeA.id+"'");
const again=ok(await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:checkoutKey,p_items:orderV16,p_cash_received:30000
}),"retry identical payment payload");
assert.equal(again,packSale);
assert.equal(localSQL("select count(*) from public.retail_sales where store_id='"+storeA.id+"'"),saleCountAfter);
assert.equal(localSQL("select quantity from public.retail_stock_balances where product_id='"+milkId+"'"),"33.000");
passed("V16 posts 2 cartons + 3 units at 25000 IQD and decrements 27 base units exactly once");

const wrongPrice=await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:code(),p_items:[{...orderV16[0],expected_price_minor:1000}],p_cash_received:11000
});
fail(wrongPrice,"cannot forge price from client");
const wrongPack=await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:code(),p_items:[{...orderV16[0],expected_units:1}],p_cash_received:11000
});
fail(wrongPack,"cannot forge carton as one base unit");
const unavailable=await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:code(),p_items:[{...orderV16[0],quantity:3}],p_cash_received:50000
});
fail(unavailable,"insufficient 33 base units for 36 required");
fail(await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:checkoutKey,p_items:[{...orderV16[0],quantity:1}],p_cash_received:30000
}),"request ID reused with different payload must be rejected");
assert.equal(localSQL("select quantity from public.retail_stock_balances where product_id='"+milkId+"'"),"33.000");
assert.equal(localSQL("select count(*) from public.retail_sales where store_id='"+storeA.id+"'"),saleCountAfter);
passed("V16 forged price, forged carton size, insufficient combined stock and mismatched retry all roll back");

const cartonOnlyStock=ok(await manager.rpc("retail_receive_stock",{
 p_store:storeA.id,p_product:cartonOnlyId,p_quantity:24,p_reason:"opening"
}),"receive two cartons of carton-only product as 24 base units");
assert.equal(Number(cartonOnlyStock),24);
const blockedLegacy=await cashier.rpc("retail_checkout_cash",{
 p_store:storeA.id,p_request:code(),
 p_items:[{product_id:cartonOnlyId,quantity:1}],p_cash_received:0
});
fail(blockedLegacy,"legacy unit-only RPC must reject carton-only product at zero IQD");
assert.equal(blockedLegacy.error.code,"22023");
assert.equal(localSQL("select quantity from public.retail_stock_balances where product_id='"+cartonOnlyId+"'"),"24.000");
const oneCarton=ok(await cashier.rpc("retail_checkout_packs_v16",{
 p_store:storeA.id,p_request:code(),p_items:[
  {barcode:"8394000022011",quantity:1,expected_price_minor:11000,expected_units:12}
 ],p_cash_received:11000
}),"cashier sells carton-only code");
assert.ok(oneCarton);
assert.equal(localSQL("select quantity from public.retail_stock_balances where product_id='"+cartonOnlyId+"'"),"12.000");
passed("V16 carton-only product sells a real carton at independent price, stock decremented by 12");

const raceCatalog={...milkV16,name:"Concurrent last carton",sale_mode:"carton",
 unit_barcode:"",unit_alias_barcodes:[],unit_sale_price_iqd:null,unit_purchase_price_iqd:null,
 carton:{...milkV16.carton,barcode:"8394000033010",alias_barcodes:[]}};
const raceId=ok(await owner.rpc("retail_register_product_v14",{
 p_store_id:storeA.id,p_catalog:raceCatalog
}),"owner creates carton-only last-box concurrency case");
ok(await manager.rpc("retail_receive_stock",{
 p_store:storeA.id,p_product:raceId,p_quantity:12,p_reason:"opening"
}),"stock exactly one carton");
ok(await manager.rpc("retail_shift_open",{p_store:storeA.id,p_opening:0}),
 "manager opens independent local cash shift");
const raceLine=[{barcode:"8394000033010",quantity:1,
 expected_price_minor:11000,expected_units:12}];
const concurrent=await Promise.all([
 cashier.rpc("retail_checkout_packs_v16",{p_store:storeA.id,p_request:code(),p_items:raceLine,p_cash_received:11000}),
 manager.rpc("retail_checkout_packs_v16",{p_store:storeA.id,p_request:code(),p_items:raceLine,p_cash_received:11000})
]);
assert.equal(concurrent.filter(r=>!r.error).length,1,"Only one concurrent cashier may buy the last carton");
assert.equal(concurrent.filter(r=>r.error?.code==="22023").length,1);
assert.equal(localSQL("select quantity from public.retail_stock_balances where product_id='"+raceId+"'"),"0.000");
assert.equal(localSQL("select count(*) from public.retail_sale_items where product_id='"+raceId+"'"),"1");
assert.equal(localSQL("select count(*) from public.retail_stock_events where product_id='"+raceId+"' and delta=-12"),"1");
passed("V16 concurrent cashier/manager last-carton race posts exactly one receipt and never overdrafts stock");

console.log("V16 local QA: six mode, scan and checkout groups passed; no hosted DB modifications.");

console.log("V13 LOCAL-only permission regression: all three added checks passed; hosted Supabase remains UNCHANGED. Release still BLOCKED pending separate approved hosted remediation.");

console.log("V12/V13 result: "+tests.length+" local real-GoTrue/JWT/PostgREST/PostgreSQL RLS test groups passed. SECURITY RELEASE GATE BLOCKED by TRUNCATE privilege. No hosted project accessed.");
