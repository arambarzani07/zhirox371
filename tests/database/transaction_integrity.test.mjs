import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uuid(1),cashier=uuid(2),stranger=uuid(3),store=uuid(10),product=uuid(20),customer=uuid(30),supplier=uuid(40),shift=uuid(50);
const upgrade=readFileSync('db/v19_complete_production_upgrade.sql','utf8');
const migration=readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(n=>n.endsWith('_transaction_integrity.sql')),'utf8');
let db;
before(async()=>{
 db=new PGlite();await db.exec('create role service_role');
 for(const f of ['tests/integration/fixture.sql','tests/v12/rls_mirror.sql'])await db.exec(readFileSync(f,'utf8'));
 await db.exec("CREATE FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint) RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION public.retail_update_product_v15(uuid,uuid,bigint,jsonb) RETURNS jsonb LANGUAGE sql AS 'SELECT NULL::jsonb';");
 await db.exec(upgrade);await db.exec(migration);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`TRUNCATE public.retail_stores,auth.users CASCADE;
 INSERT INTO auth.users(id) VALUES('${owner}'),('${cashier}'),('${stranger}');
 INSERT INTO retail_stores(id,owner_user_id,name) VALUES('${store}','${owner}','QA');
 INSERT INTO retail_memberships(store_id,user_id,role) VALUES('${store}','${cashier}','cashier');
 INSERT INTO retail_products(id,store_id,name,price_minor,purchase_price_minor) VALUES('${product}','${store}','Unit item',1000,700);
 INSERT INTO retail_barcodes(store_id,code,product_id) VALUES('${store}','UNIT','${product}');
 INSERT INTO retail_stock_balances(store_id,product_id,quantity) VALUES('${store}','${product}',10);
 INSERT INTO retail_cash_sessions(id,store_id,cashier_id,opening_cash_minor) VALUES('${shift}','${store}','${owner}',5000);
 INSERT INTO retail_customers(id,store_id,name,credit_limit_minor,balance_minor) VALUES('${customer}','${store}','Customer',5000,2000);
 INSERT INTO retail_suppliers(id,store_id,name,balance_minor) VALUES('${supplier}','${store}','Supplier',3000);`);
});
async function as(actor,sql,args=[]){
 await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
  const res=await db.query(sql,args);await db.exec('COMMIT');return res.rows;
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const items=[{barcode:'UNIT',quantity:1,expected_price_minor:1000,expected_units:1}];
async function credit(request=uuid(100),paid=200){return (await as(owner,'select retail_checkout_customer_v21($1,$2,$3::jsonb,1000,0,$4,$5) as sale',[store,request,JSON.stringify(items),customer,paid]))[0].sale;}
async function ledger(request=uuid(110),amount=500,note='payment'){
 return as(owner,"select retail_record_customer_ledger_v19($1,$2,'payment_received',$3,$4,NULL,NULL,NULL,'cash_drawer',$5) as result",[store,customer,amount,note,request]);
}
async function purchase(request=uuid(120),method='credit'){
 return as(owner,'select retail_receive_purchase_v21($1,$2,$3::jsonb) as result',[store,request,JSON.stringify({product_id:product,supplier_id:supplier,quantity:2,unit_cost:700,invoice_no:'INV-1',payment_method:method})]);
}
test('corrected production bundle and integrity migration both install twice',async()=>{
 assert.ok(upgrade.includes(migration.replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'').trim()),'Standalone artifact must embed the exact reviewed integrity migration');
 await db.exec(upgrade);await db.exec(migration);
 assert.equal(await scalar("select has_table_privilege('authenticated','retail_customers','TRUNCATE')"),false);
});
test('barcode RPC matches cashier contract, enforces tenant access and omits costs',async()=>{
 const [r]=await as(cashier,'select retail_resolve_barcode_v18($1,$2) as barcode',[store,'UNIT']);
 assert.equal(r.barcode.found,true);assert.equal(r.barcode.stock_quantity,10);assert.equal(r.barcode.base_unit,'unit');assert.equal(r.barcode.currency,'IQD');
 assert.equal('purchase_price_minor' in r.barcode,false);
 await assert.rejects(()=>as(stranger,'select retail_resolve_barcode_v18($1,$2)',[store,'UNIT']),/access denied/i);
 await assert.rejects(()=>as(cashier,'select purchase_price_minor from retail_products'),/permission denied/i);
});
test('customer checkout posts sale, stock, debt and drawer offset exactly once',async()=>{
 const sale=await credit();assert.equal(await credit(),sale);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),9);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),2800);
 assert.equal(Number(await scalar('select sum(amount_minor) from retail_cash_movements')),800);
 assert.equal(Number(await scalar('select count(*) from retail_customer_ledger')),1);
 await assert.rejects(()=>credit(uuid(100),300),/different actor or payload/i);
 await db.exec("update retail_cash_sessions set status='closed'");assert.equal(await credit(),sale);
});
test('credit-limit rejection rolls back sale, stock, receipt counter, journal and cash',async()=>{
 await db.exec('update retail_customers set credit_limit_minor=2100');
 await assert.rejects(()=>credit(),/Credit limit exceeded/);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),10);
 assert.equal(Number(await scalar('select count(*) from retail_sales')),0);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),0);
 assert.equal(Number(await scalar('select count(*) from retail_internal.financial_requests')),0);
 assert.equal(Number(await scalar('select count(*) from retail_receipt_counters')),0);
});
test('customer payment and drawer cash-in are atomic and durable across replay',async()=>{
 await ledger();await ledger();
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),1500);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),1);
 await assert.rejects(()=>ledger(uuid(110),500,'changed'),/different actor or payload/);
 await assert.rejects(()=>ledger(uuid(111),2000),/exceeds outstanding debt/);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),1500);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),1);
});
test('credit purchase posts stock, supplier debt and cost once; changed replay fails',async()=>{
 await purchase();await purchase();
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),12);
 assert.equal(Number(await scalar('select balance_minor from retail_suppliers')),4400);
 assert.equal(Number(await scalar('select count(*) from retail_supplier_ledger')),1);
 assert.equal(Number(await scalar('select unit_cost_minor from retail_product_costs')),700);
 await assert.rejects(()=>purchase(uuid(120),'cash_drawer'),/different actor or payload/);
});
test('purchase cash shortfall rolls back stock, invoice, supplier and cost changes',async()=>{
 await db.exec('update retail_cash_sessions set opening_cash_minor=0');
 await assert.rejects(()=>purchase(uuid(121),'cash_drawer'),/insufficient cash/i);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),10);
 assert.equal(Number(await scalar('select balance_minor from retail_suppliers')),3000);
 assert.equal(Number(await scalar('select count(*) from retail_supplier_ledger')),0);
 assert.equal(Number(await scalar('select count(*) from retail_product_costs')),0);
});
test('full cash refund restores stock, pays cash once and requires membership',async()=>{
 const sale=(await as(owner,'select retail_checkout_packs_v16($1,$2,$3::jsonb,1000,0) as sale',[store,uuid(130),JSON.stringify(items)]))[0].sale;
 const args=[store,sale,shift,uuid(131)];
 await assert.rejects(()=>as(stranger,'select retail_return_sale_v19($1,$2,$3,$4)',args),/permission required/i);
 await as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',args);await as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',args);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),10);
 assert.equal(Number(await scalar('select sum(amount_minor) from retail_cash_movements')),1000);
 assert.equal(Number(await scalar("select count(*) from retail_stock_events where reason='sale_return'")),1);
});
test('credit refunds fail closed and roll back attempted cash and stock writes',async()=>{
 const sale=await credit();
 await assert.rejects(()=>as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',[store,sale,shift,uuid(140)]),/debt reconciliation/i);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),9);
 assert.equal(await scalar('select refunded from retail_sales'),false);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),1);
});
test('cashier cannot rewrite balances, ledger rows, settings or clear tables',async()=>{
 for(const sql of ['update retail_customers set balance_minor=0','delete from retail_customer_ledger','truncate retail_customers'])await assert.rejects(()=>as(cashier,sql),/permission denied/i);
 await db.exec(`insert into retail_store_settings(store_id,settings_json) values('${store}','{}')`);
 const rows=await as(cashier,"update retail_store_settings set settings_json='{}' returning store_id");assert.equal(rows.length,0);
});
test('weighted checkout and refund preserve kilogram and price snapshots',async()=>{
 await db.exec(`update retail_products set base_unit='kg',plu='00001',price_minor=1250 where id='${product}';update retail_barcodes set code='2700001';update retail_stock_balances set quantity=2;`);
 const [r]=await as(owner,'select retail_resolve_barcode_v18($1,$2) as result',[store,'2700001004806']);
 assert.equal(r.result.price_minor,600);assert.equal(r.result.scale_weight_kg,0.48);assert.equal(r.result.base_unit,'kg');
 const weighted=[{barcode:'2700001004806',quantity:1,expected_price_minor:600,expected_units:1}];
 const [sale]=await as(owner,'select retail_checkout_weight_v19($1,$2,$3::jsonb,600,0) as id',[store,uuid(150),JSON.stringify(weighted)]);
 const line=(await db.query('select quantity,unit_price_minor,base_unit_snapshot from retail_sale_items')).rows[0];
 assert.equal(Number(line.quantity),0.48);assert.equal(Number(line.unit_price_minor),1250);assert.equal(line.base_unit_snapshot,'kg');
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),1.52);
 await as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',[store,sale.id,shift,uuid(151)]);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),2);
});
test('account creation and opening debt are atomic and replay-safe',async()=>{
 const body=JSON.stringify({name:'New customer',credit_limit:3000,opening_balance:1000});
 const args=[store,uuid(160),'customer',body];
 const [a]=await as(owner,'select retail_save_party_v21($1,$2,$3,$4::jsonb) as result',args);
 const [b]=await as(owner,'select retail_save_party_v21($1,$2,$3,$4::jsonb) as result',args);
 assert.equal(a.result.id,b.result.id);assert.equal(Number(await scalar('select count(*) from retail_customers')),2);
 assert.equal(Number(await scalar('select count(*) from retail_customer_ledger')),1);
 await assert.rejects(()=>as(owner,'select retail_save_party_v21($1,$2,$3,$4::jsonb)',[store,uuid(161),'customer',JSON.stringify({name:'Rejected',credit_limit:500,opening_balance:1000})]),/Credit limit exceeded/);
 assert.equal(Number(await scalar('select count(*) from retail_customers')),2);
});
test('supplier payment updates debt and cash in one replay-safe transaction',async()=>{
 const sql="select retail_record_supplier_ledger_v21($1,$2,'payment_sent',500,'payment',NULL,NULL,NULL,NULL,NULL,'cash_drawer',$3)";
 const args=[store,supplier,uuid(170)];await as(owner,sql,args);await as(owner,sql,args);
 assert.equal(Number(await scalar('select balance_minor from retail_suppliers')),2500);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),1);
 await assert.rejects(()=>as(cashier,'update retail_suppliers set balance_minor=0'),/permission denied/i);
});
test('PIN values stay outside authenticated SELECT and archive; owner creation RPC still works',async()=>{
 await assert.rejects(()=>as(owner,'select pin_code from retail_staff_profiles'),/permission denied/i);
 const [p]=await as(owner,"select retail_create_product($1,'Created product','NEW',250) as id",[store]);assert.ok(p.id);
 await assert.rejects(()=>as(cashier,"select retail_create_product($1,'Forbidden','BAD',250)",[store]),/not accessible/i);
});
test('a posted ordinary sale cannot be retroactively converted into a new credit transaction',async()=>{
 await as(owner,'select retail_checkout_packs_v16($1,$2,$3::jsonb,1000,0)',[store,uuid(180),JSON.stringify(items)]);
 await assert.rejects(()=>credit(uuid(180)),/cannot be repurposed/i);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),2000);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),0);
});
test('production artifact includes real stock receipt endpoints with idempotent receiving',async()=>{
 const args=[store,uuid(190),'UNIT',2,1,'purchase'];
 await as(owner,'select retail_receive_packs_v17($1,$2,$3,$4,$5,$6)',args);await as(owner,'select retail_receive_packs_v17($1,$2,$3,$4,$5,$6)',args);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),12);
 await db.exec(`update retail_products set base_unit='kg' where id='${product}'`);
 const kg=[store,'UNIT',0.245,'purchase',uuid(191)];
 await as(owner,'select retail_receive_weight_v19($1,$2,$3,$4,$5)',kg);await as(owner,'select retail_receive_weight_v19($1,$2,$3,$4,$5)',kg);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),12.245);
});
