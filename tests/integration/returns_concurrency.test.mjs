// Genuine concurrent PostgreSQL clients; this suite cannot target a hosted database.
import {test,beforeEach} from 'node:test';import assert from 'node:assert/strict';import{execFileSync,spawn}from'node:child_process';
assert.equal(process.env.PGDATABASE,'retail_qa');assert.match(process.env.PGHOST||'',/^(127\.0\.0\.1|localhost)$/);
const u=n=>'88888888-8888-4888-8888-'+String(n).padStart(12,'0'),store=u(1),owner=u(2),a=u(3),b=u(4),product=u(5),customer=u(6),sa=u(7),sb=u(8),so=u(9);
const sql=q=>execFileSync('psql',['-X','-Atq','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8',timeout:20000}).trim();
const json=q=>JSON.parse(sql(q).split('\n').filter(Boolean).at(-1));
const as=(actor,q)=>`BEGIN; SET LOCAL statement_timeout='8s'; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',true); ${q}; COMMIT;`;
const run=q=>new Promise(resolve=>{const p=spawn('psql',['-X','-Atq','-v','ON_ERROR_STOP=1','-c',q]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',e=>resolve({success:false,err:String(e)}));p.on('close',code=>resolve({success:code===0,out,err}));});
beforeEach(()=>sql(`TRUNCATE auth.users,retail_stores CASCADE;INSERT INTO auth.users(id) VALUES('${owner}'),('${a}'),('${b}');
 INSERT INTO retail_stores(id,owner_user_id,name) VALUES('${store}','${owner}','Return concurrency QA');
 INSERT INTO retail_memberships(store_id,user_id,role) VALUES('${store}','${a}','cashier'),('${store}','${b}','cashier');
 INSERT INTO retail_products(id,store_id,name,price_minor,purchase_price_minor) VALUES('${product}','${store}','Item',1000,700);
 INSERT INTO retail_barcodes(store_id,code,product_id) VALUES('${store}','ITEM','${product}');
 INSERT INTO retail_stock_balances VALUES('${store}','${product}',10,now());
 INSERT INTO retail_cash_sessions(id,store_id,cashier_id,opening_cash_minor) VALUES('${sa}','${store}','${a}',5000),('${sb}','${store}','${b}',5000),('${so}','${store}','${owner}',5000);
 INSERT INTO retail_customers(id,store_id,name,credit_limit_minor,balance_minor) VALUES('${customer}','${store}','Customer',5000,0);`));
function sale(qty=1,credit=false){const items=JSON.stringify([{barcode:'ITEM',quantity:qty,expected_price_minor:1000,expected_units:1}]);
 const call=credit?`retail_checkout_customer_v21('${store}','${u(10)}','${items}'::jsonb,1000,0,'${customer}',200)`:`retail_checkout_packs_v16('${store}','${u(10)}','${items}'::jsonb,${qty*1000},0)`;
 const id=sql(as(owner,`SELECT ${call}`)).split('\n').filter(Boolean).at(-1);
 const line=sql(`SELECT id FROM retail_sale_items WHERE sale_id='${id}'`);return{id,line};}
function ret(sale,actor,session,request,qty=1){return as(actor,`SELECT retail_return_item_v22('${store}','${sale.id}','${sale.line}',${qty},'${session}','${request}')::text`);}
function state(){return json(`SELECT json_build_object('stock',(SELECT quantity FROM retail_stock_balances),'returns',(SELECT count(*) FROM retail_sale_returns_v22),'refund',(SELECT coalesce(sum(refund_minor),0) FROM retail_sale_returns_v22),'debt',(SELECT balance_minor FROM retail_customers),'drawer',(SELECT opening_cash_minor FROM retail_cash_sessions WHERE id='${so}')+(SELECT coalesce(sum(total_minor),0) FROM retail_sales WHERE cash_session_id='${so}')+(SELECT coalesce(sum(CASE WHEN kind='cash_in' THEN amount_minor ELSE -amount_minor END),0) FROM retail_cash_movements WHERE session_id='${so}'))::text`);}
test('12 concurrent identical return retries pay and restock exactly once',async()=>{const s=sale();const q=ret(s,a,sa,u(20));const r=await Promise.all(Array.from({length:12},()=>run(q)));assert.ok(r.every(x=>x.success),JSON.stringify(r));assert.equal(state().stock,10);assert.equal(state().returns,1);assert.equal(state().refund,1000);});
test('two cashiers cannot each return the same last sold unit',async()=>{const s=sale();const r=await Promise.all([run(ret(s,a,sa,u(21))),run(ret(s,b,sb,u(22)))]);assert.equal(r.filter(x=>x.success).length,1,JSON.stringify(r));assert.equal(state().stock,10);assert.equal(state().refund,1000);});
test('full return racing a partial return refunds only the original receipt total',async()=>{const s=sale(2);const results=await Promise.all([run(ret(s,a,sa,u(23))),run(as(b,`SELECT retail_return_sale_v19('${store}','${s.id}','${sb}','${u(24)}')`))]);assert.ok(results[1].success,JSON.stringify(results));assert.equal(state().stock,10);assert.equal(state().refund,2000);});
test('debt payment racing credit refund never creates negative debt or extra drawer cash',async()=>{const s=sale(1,true);const payment=as(owner,`SELECT retail_record_customer_ledger_v19('${store}','${customer}','payment_received',800,'QA',NULL,NULL,NULL,'cash_drawer','${u(25)}')`);const r=await Promise.all([run(payment),run(ret(s,owner,so,u(26)))]);assert.ok(r[1].success,JSON.stringify(r));assert.equal(state().debt,0);assert.equal(state().stock,10);assert.equal(state().drawer,5000);assert.equal(state().refund,1000);});
