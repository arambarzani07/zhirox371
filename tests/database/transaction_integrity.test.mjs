import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uuid(1),cashier=uuid(2),stranger=uuid(3),manager=uuid(4),store=uuid(10),product=uuid(20),customer=uuid(30),supplier=uuid(40),shift=uuid(50);
const upgrade=readFileSync('db/v19_complete_production_upgrade.sql','utf8');
const migrations=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort().map(n=>readFileSync('supabase/migrations/'+n,'utf8'));
const migration=migrations[0];
let db;
before(async()=>{
 db=new PGlite();await db.exec('create role service_role');
 for(const f of ['tests/integration/fixture.sql','tests/v12/rls_mirror.sql'])await db.exec(readFileSync(f,'utf8'));
 await db.exec("CREATE FUNCTION public.retail_checkout_packs_v16(uuid,uuid,jsonb,bigint) RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION public.retail_update_product_v15(uuid,uuid,bigint,jsonb) RETURNS jsonb LANGUAGE sql AS 'SELECT NULL::jsonb';");
 await db.exec(upgrade);for(const migration of migrations)await db.exec(migration);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec(`TRUNCATE public.retail_stores,auth.users CASCADE;
 INSERT INTO auth.users(id) VALUES('${owner}'),('${cashier}'),('${stranger}'),('${manager}');
 INSERT INTO retail_stores(id,owner_user_id,name) VALUES('${store}','${owner}','QA');
 INSERT INTO retail_memberships(store_id,user_id,role) VALUES('${store}','${cashier}','cashier'),('${store}','${manager}','manager');
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
 await db.exec(upgrade);for(const migration of migrations)await db.exec(migration);
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
 await assert.rejects(()=>as(stranger,'select retail_return_sale_v19($1,$2,$3,$4)',args),/permission required|access denied/i);
 await as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',args);await as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',args);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),10);
 assert.equal(Number(await scalar('select sum(amount_minor) from retail_cash_movements')),1000);
 assert.equal(Number(await scalar("select count(*) from retail_stock_events where reason='sale_return'")),1);
});
test('credit refunds reconcile only outstanding receipt debt and pay the paid cash portion',async()=>{
 const sale=await credit();
 const [r]=await as(owner,'select retail_return_sale_v19($1,$2,$3,$4) as result',[store,sale,shift,uuid(140)]);
 assert.equal(r.result.debt_reduced_minor,800);assert.equal(r.result.cash_refunded_minor,200);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),10);
 assert.equal(await scalar('select refunded from retail_sales'),true);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),2000);
});
test('cashier cannot rewrite balances, ledger rows, settings or clear tables',async()=>{
 for(const sql of ['update retail_customers set balance_minor=0','delete from retail_customer_ledger','truncate retail_customers'])await assert.rejects(()=>as(cashier,sql),/permission denied/i);
 await db.exec(`insert into retail_store_settings(store_id,settings_json) values('${store}','{}')`);
 const rows=await as(cashier,"update retail_store_settings set settings_json='{}' returning store_id");assert.equal(rows.length,0);
 assert.equal((await as(manager,"update retail_store_settings set settings_json='{}' returning store_id")).length,0,'manager must not override owner-only permission settings');
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
async function cashSale(qty=1,discount=0,request=uuid(200)){
 const lines=[{barcode:'UNIT',quantity:qty,expected_price_minor:1000,expected_units:1}];
 return (await as(owner,'select retail_checkout_packs_v16($1,$2,$3::jsonb,$4,$5) as id',[store,request,JSON.stringify(lines),qty*1000-discount,discount]))[0].id;
}
async function itemReturn(sale,quantity,request=uuid(201),line){
 line??=await scalar('select id from retail_sale_items where sale_id=$1 order by id limit 1',[sale]);
 return (await as(owner,'select retail_return_item_v22($1,$2,$3,$4,$5,$6) as result',[store,sale,line,quantity,shift,request]))[0].result;
}
async function report(kind='sales',extra={}){
 const args={p_store:store,p_kind:kind,p_from:null,p_to:null,p_group:'products',p_search:'',p_filter:'all',p_sort:'default',p_offset:0,p_limit:50,...extra};
 return (await as(owner,'select retail_report_v22($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result',Object.values(args)))[0].result;
}
test('partial discount refunds round cumulatively and full return pays only the remainder',async()=>{
 const sale=await cashSale(3,100);const first=await itemReturn(sale,1);assert.equal(first.refunded_minor,967);
 assert.equal((await itemReturn(sale,1)).return_id,first.return_id);
 await assert.rejects(()=>itemReturn(sale,2,uuid(201)),/different actor or payload/);
 const [full]=await as(owner,'select retail_return_sale_v19($1,$2,$3,$4) as result',[store,sale,shift,uuid(202)]);
 assert.equal(full.result.refunded_minor,1933);assert.equal(full.result.fully_refunded,true);
 assert.equal(Number(await scalar('select sum(amount_minor) from retail_cash_movements')),2900);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),10);
 assert.equal(Number(await scalar('select returned_quantity from retail_sale_items')),3);
 await assert.rejects(()=>itemReturn(sale,1,uuid(203)),/fully refunded/i);
 await db.exec("update retail_cash_sessions set status='closed'");assert.equal((await itemReturn(sale,1)).return_id,first.return_id);
});
test('excess, fractional unit and unrelated receipt lines cannot alter cash or stock',async()=>{
 const sale=await cashSale(2);
 await assert.rejects(()=>itemReturn(sale,3),/exceeds remaining/);
 await assert.rejects(()=>itemReturn(sale,0.5,uuid(202)),/invalid units/);
 const other=await cashSale(1,0,uuid(203));const line=await scalar('select id from retail_sale_items where sale_id=$1',[other]);
 await assert.rejects(()=>itemReturn(sale,1,uuid(204),line),/does not belong/);
 assert.equal(Number(await scalar('select count(*) from retail_sale_returns_v22')),0);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),0);
});
test('partial refund cash shortage rolls back line state, stock, journal and refund ledger',async()=>{
 const sale=await cashSale();await db.exec('update retail_cash_sessions set opening_cash_minor=0');
 await as(owner,"select retail_cash_movement($1,$2,$3,'cash_out',1000,'Empty drawer')",[store,shift,uuid(204)]);
 await assert.rejects(()=>itemReturn(sale,1),/insufficient cash/i);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),9);
 assert.equal(Number(await scalar('select returned_quantity from retail_sale_items')),0);
 assert.equal(Number(await scalar('select count(*) from retail_sale_returns_v22')),0);
 assert.equal(Number(await scalar("select count(*) from retail_internal.financial_requests where action='sale.return_v22'")),0);
});
test('paid-off credit receipt refunds cash without reducing unrelated debt',async()=>{
 await db.exec('update retail_customers set balance_minor=0');const sale=await credit();await ledger(uuid(210),800);
 const r=await itemReturn(sale,1);assert.equal(r.debt_reduced_minor,0);assert.equal(r.cash_refunded_minor,1000);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),0);
});
test('FIFO debt allocation distinguishes two receipts and does not refund another sale debt',async()=>{
 await db.exec('update retail_customers set balance_minor=0');const a=await credit(uuid(211));
 // Ensure deterministic chronology, independent of UUID order in a fast transaction test.
 await db.exec("update retail_customer_ledger set created_at=created_at-interval '1 second'");
 const b=await credit(uuid(212));await ledger(uuid(213),800);
 const rb=await itemReturn(b,1,uuid(214));assert.equal(rb.debt_reduced_minor,800);assert.equal(rb.cash_refunded_minor,200);
 const ra=await itemReturn(a,1,uuid(215));assert.equal(ra.debt_reduced_minor,0);assert.equal(ra.cash_refunded_minor,1000);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),0);
});
test('legacy account opening gap is treated as earlier debt rather than payment for a new receipt',async()=>{
 const sale=await credit();await ledger(uuid(216),1000);
 const r=await itemReturn(sale,1);assert.equal(r.debt_reduced_minor,800);assert.equal(r.cash_refunded_minor,200);
 assert.equal(Number(await scalar('select balance_minor from retail_customers')),1000);
});
test('weighted partial returns preserve thousandths and exact cumulative refunds',async()=>{
 await db.exec(`update retail_products set base_unit='kg',plu='00001',price_minor=1250;update retail_barcodes set code='2700001';update retail_stock_balances set quantity=2;`);
 const [s]=await as(owner,'select retail_checkout_weight_v19($1,$2,$3::jsonb,600,0) as id',[store,uuid(220),JSON.stringify([{barcode:'2700001004806',quantity:1,expected_price_minor:600,expected_units:1}])]);
 assert.equal((await itemReturn(s.id,0.1)).refunded_minor,125);
 assert.equal((await itemReturn(s.id,0.38,uuid(221))).refunded_minor,475);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),2);
});
test('report aggregates all 450 receipts and 1800 lines, beyond previous client limits',async()=>{
 await db.exec(`INSERT INTO retail_sales(id,store_id,cashier_id,status,total_minor,receipt_no,request_id) SELECT gen_random_uuid(),'${store}','${owner}','posted',4000,g,gen_random_uuid() FROM generate_series(1000,1449) g;
 INSERT INTO retail_sale_items(store_id,sale_id,product_id,quantity,unit_price_minor,product_name_snapshot,base_units) SELECT '${store}',s.id,'${product}',1,1000,'Bulk line',1 FROM retail_sales s CROSS JOIN generate_series(1,4);`);
 const r=await report();assert.equal(r.summary.sale_count,450);assert.equal(Number(r.summary.net_minor),1800000);assert.equal(Number(r.summary.cost_minor),1260000);assert.equal(Number(r.summary.net_profit_minor),540000);
 const page=await report('sales',{p_group:'receipts',p_offset:400});assert.equal(page.total_count,450);assert.equal(page.items.length,50);
});
test('historical cost snapshots survive later price/cost edits and unknown costs stay unknown',async()=>{
 await cashSale();await db.exec(`update retail_products set price_minor=9000,purchase_price_minor=8500;insert into retail_product_costs(store_id,product_id,unit_cost_minor) values('${store}','${product}',8000);`);
 const known=await report('profit');assert.equal(Number(known.summary.cost_minor),700);assert.equal(Number(known.summary.net_profit_minor),300);
 await db.exec('update retail_sale_items set unit_cost_minor_snapshot=NULL');
 const unknown=await report('profit');assert.equal(unknown.summary.cost_minor,null);assert.equal(unknown.summary.net_profit_minor,null);assert.equal(unknown.summary.unknown_cost_lines,1);
});
test('returns use their event date and are counted once after partial then full returns',async()=>{
 const sale=await cashSale(2);await itemReturn(sale,1);await as(owner,'select retail_return_sale_v19($1,$2,$3,$4)',[store,sale,shift,uuid(230)]);
 const all=await report();assert.equal(Number(all.summary.net_minor),0);assert.equal(Number(all.summary.refund_minor),2000);assert.equal(Number(all.summary.cost_minor),0);
 await db.exec("update retail_sales set created_at='2026-10-14T10:00:00Z';update retail_sale_returns_v22 set created_at='2026-10-15T10:00:00Z';");
 const refundDay=await report('sales',{p_from:'2026-10-15T00:00:00+03:00',p_to:'2026-10-16T00:00:00+03:00'});
 assert.equal(refundDay.summary.sale_count,0);assert.equal(Number(refundDay.summary.net_minor),-2000);assert.equal(Number(refundDay.summary.cost_minor),-1400);
});
test('inventory counts and pages cover all products and expose unknown valuation',async()=>{
 await db.exec(`insert into retail_products(store_id,name,price_minor) select '${store}','Extra '||g,250 from generate_series(1,120) g;`);
 const r=await report('inventory');assert.equal(r.inventory.product_count,121);assert.equal(r.total_count,121);assert.equal(r.items.length,50);
 assert.equal(Number(r.inventory.value_minor),7000);assert.equal(r.inventory.out_count,120);
 await db.exec('update retail_products set purchase_price_minor=NULL');const missing=await report('inventory');assert.equal(missing.inventory.value_minor,null);assert.equal(missing.inventory.unknown_cost_products,1);
 await assert.rejects(()=>as(cashier,'select retail_report_v22($1)',[store]),/Manager permission required/);
});
test('old receipt lookup is not limited to the most recent 100 and barcode ambiguity is explicit',async()=>{
 const first=await cashSale(1);await cashSale(1,0,uuid(250));
 const [found]=await as(owner,'select retail_find_return_receipt_v22($1,$2) as result',[store,'1']);assert.equal(found.result.sale_id,first);
 const [barcode]=await as(owner,'select retail_find_return_receipt_v22($1,$2) as result',[store,'UNIT']);assert.equal(barcode.result.ambiguous,true);
});
test('unrelated cash movement IDs cannot be reused as a return request',async()=>{
 const sale=await cashSale();await as(owner,"select retail_cash_movement($1,$2,$3,'cash_out',1000,'Receipt return #1')",[store,shift,uuid(251)]);
 await assert.rejects(()=>itemReturn(sale,1,uuid(251)),/another cash movement/);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),9);assert.equal(Number(await scalar('select count(*) from retail_sale_returns_v22')),0);
});
test('owner return settings are enforced by the database for cashiers',async()=>{
 const sale=await cashSale();await db.exec(`INSERT INTO retail_store_settings(store_id,settings_json) VALUES('${store}','{"permCashierRefund":"manager_only"}');INSERT INTO retail_cash_sessions(store_id,cashier_id,opening_cash_minor) VALUES('${store}','${cashier}',5000);`);
 const session=await scalar('select id from retail_cash_sessions where cashier_id=$1',[cashier]),line=await scalar('select id from retail_sale_items');
 await assert.rejects(()=>as(cashier,'select retail_return_item_v22($1,$2,$3,1,$4,$5)',[store,sale,line,session,uuid(252)]),/disabled by owner/);
 assert.equal(Number(await scalar('select quantity from retail_stock_balances')),9);
});
test('period reports mark legacy refunds with unknown dates as incomplete',async()=>{
 await cashSale();await db.exec("update retail_sales set refunded=true,refunded_at=NULL,created_at='2026-10-01T12:00:00Z'");
 const period=await report('profit',{p_from:'2026-10-10T00:00:00Z',p_to:'2026-10-11T00:00:00Z'});assert.equal(period.summary.unknown_refund_dates,1);assert.equal(period.summary.net_minor,null);assert.equal(period.summary.net_profit_minor,null);
 const all=await report();assert.equal(Number(all.summary.net_minor),0);
});
test('stock valuation includes inactive products that still carry inventory',async()=>{
 await db.exec('update retail_products set active=false');const inventory=await report('inventory');assert.equal(inventory.inventory.product_count,1);assert.equal(inventory.total_count,1);assert.equal(Number(inventory.inventory.value_minor),7000);
});

const financeEntry=(kind='safe_deposit',amount=1000,wallet='safe')=>({entry_kind:kind,amount_minor:amount,wallet,category:'QA',note:'QA confirmed transaction'});
const finance=async(request,entry,session=null,actor=owner)=>(await as(actor,'select retail_record_finance_v25($1,$2,$3::jsonb,$4) as result',[store,request,JSON.stringify(entry),session]))[0].result;
const financeState=async(session=null)=>(await as(owner,'select retail_finance_state_v25($1,$2) as result',[store,session]))[0].result;
test('finance safe and drawer transfer commits once and replays after shift closure',async()=>{
 await finance(uuid(800),financeEntry());
 const entry=financeEntry('safe_to_drawer',400);
 const result=await finance(uuid(801),entry,shift);
 assert.equal(result.state.safe_balance_minor,600);assert.equal(result.state.drawer_balance_minor,5400);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),1);
 await db.exec(`update retail_cash_sessions set status='closed' where id='${shift}'`);
 assert.deepEqual(await finance(uuid(801),entry,shift),result);
 await assert.rejects(()=>finance(uuid(801),financeEntry('safe_to_drawer',401),shift),/different actor or payload/i);
 assert.equal(Number(await scalar('select count(*) from retail_finance_entries')),2);
});
test('finance rejects overdrafts, fractional amounts and non-manager actors without side effects',async()=>{
 await assert.rejects(()=>finance(uuid(802),financeEntry('safe_withdraw',1)),/Insufficient safe balance/);
 await assert.rejects(()=>finance(uuid(803),financeEntry('drawer_to_safe',5001),shift),/Insufficient cash in drawer/);
 await assert.rejects(()=>finance(uuid(804),financeEntry('safe_deposit',1.5)),/invalid input syntax/);
 for(const actor of [cashier,stranger])await assert.rejects(()=>finance(uuid(805),financeEntry(),null,actor),/Manager permission required/);
 assert.equal(Number(await scalar('select count(*) from retail_finance_entries')),0);
 assert.equal(Number(await scalar('select count(*) from retail_internal.financial_requests')),0);
});
test('finance rollback removes drawer mutation when finance insert fails',async()=>{
 await db.exec("CREATE FUNCTION public.qa_reject_finance() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'QA reject insert';END$$; CREATE TRIGGER qa_reject_finance BEFORE INSERT ON retail_finance_entries FOR EACH ROW EXECUTE FUNCTION public.qa_reject_finance();");
 try{await assert.rejects(()=>finance(uuid(806),financeEntry('drawer_to_safe',100),shift),/QA reject insert/);
 assert.equal(Number(await scalar('select count(*) from retail_cash_movements')),0);
 assert.equal(Number(await scalar('select count(*) from retail_internal.financial_requests')),0);
 assert.equal((await financeState(shift)).drawer_balance_minor,5000);
 }finally{await db.exec('DROP TRIGGER qa_reject_finance ON retail_finance_entries; DROP FUNCTION public.qa_reject_finance();');}
});
test('finance totals cover more than the visible history limit and direct writes are denied',async()=>{
 await db.exec(`INSERT INTO retail_finance_entries(store_id,entry_kind,category,amount_minor,wallet) SELECT '${store}','safe_deposit','QA',1,'safe' FROM generate_series(1,501)`);
 const state=await financeState(shift);assert.equal(state.safe_balance_minor,501);assert.equal(state.customer_receivables_minor,2000);assert.equal(state.supplier_payables_minor,3000);
 await assert.rejects(()=>as(owner,"insert into retail_finance_entries(store_id,entry_kind,category,amount_minor) values($1,'safe_deposit','QA',1)",[store]),/permission denied/);
});
test('finance replay rechecks manager permission after a role downgrade',async()=>{
 const entry=financeEntry();await finance(uuid(807),entry,null,manager);
 await db.exec(`update retail_memberships set role='cashier' where user_id='${manager}'`);
 await assert.rejects(()=>finance(uuid(807),entry,null,manager),/Manager permission required/);
});
test('promotion policies allow cashier reading but deny cashier and outsider changes',async()=>{
 for(const table of ['retail_campaigns','retail_offers','retail_discount_rules','retail_coupons']){
  const policies=(await db.query("select policyname,qual,with_check from pg_policies where tablename=$1",[table])).rows;
  assert.equal(policies.length,2);
  assert.equal(await scalar(`select has_table_privilege('anon','${table}','SELECT')`),false);
  assert.equal(await scalar(`select has_table_privilege('authenticated','${table}','TRUNCATE')`),false);
  await as(cashier,`select id from ${table}`);
 }
 await as(owner,'insert into retail_campaigns(id,store_id,name) values($1,$2,$3)',[uuid(808),store,'QA']);
 await assert.rejects(()=>as(cashier,'insert into retail_campaigns(store_id,name) values($1,$2)',[store,'Forbidden']),/row-level security/);
 assert.equal((await as(stranger,'select id from retail_campaigns')).length,0);
 assert.equal((await as(cashier,"update retail_campaigns set name='Forbidden' returning id")).length,0);
});
