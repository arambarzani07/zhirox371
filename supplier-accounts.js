/* Verified bounded supplier, purchase-order and account snapshots. */
(() => {
 'use strict';
 const limit=500,integer=value=>window.RetailCustomerAccounts.integer(value);
 const sum=(rows,key)=>integer(String(rows.reduce((n,r)=>n+BigInt(integer(r[key])),0n)));
 function totals(suppliers,orders,ledger){
  return {payable:sum(suppliers.filter(s=>s.balance_minor>0),'balance_minor'),balance:sum(suppliers,'balance_minor'),orders:sum(orders,'total_cost_minor'),purchases:sum(ledger.filter(l=>['purchase_cash','purchase_credit','opening_balance'].includes(l.entry_type)),'amount_minor'),paid:sum(ledger.filter(l=>['payment_sent','return_to_supplier'].includes(l.entry_type)),'amount_minor'),added:sum(ledger.filter(l=>l.delta_minor>0),'delta_minor'),delta:sum(ledger,'delta_minor')};
 }
 function supplier(row,store){if(row?.store_id!==store||!row.id||row.active!==true||typeof row.name!=='string'||!row.name.trim())throw Error('زانیاریی دابینکەر ناتەواوە');return {...row,balance_minor:integer(row.balance_minor)};}
 function order(r,store){if(!r?.id||r.store_id!==store)throw Error('ناسنامەی داواکاری نادروستە');const quantity=Number(r.quantity),unit=integer(r.unit_cost_minor),total=integer(r.total_cost_minor);if(!(quantity>0)||!Number.isFinite(quantity)||quantity>99999999999.999||!r.created_at||!Number.isFinite(Date.parse(r.created_at))||unit<0||total<0||!['pending','ordered','received','cancelled'].includes(r.status))throw Error('داواکاریی کڕین نادروستە');return {...r,quantity,unit_cost_minor:unit,total_cost_minor:total};}
 async function read({db,store}){
  if(!db||!store)throw Error('پەیوەندیی دابینکەران بەردەست نییە');
  const [s,p,l]=await Promise.all([
   db.from('retail_suppliers').select('id,store_id,name,company,phone,address,category,balance_minor,note,active,created_at,updated_at',{count:'exact'}).eq('store_id',store).eq('active',true).order('name',{ascending:true}).order('id',{ascending:true}).limit(limit),
   db.from('retail_purchase_orders').select('id,store_id,po_no,supplier_id,supplier_name,product_id,product_name,quantity,unit_cost_minor,total_cost_minor,expected_date,status,note,actor_id,created_at,updated_at',{count:'exact'}).eq('store_id',store).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit),
   db.from('retail_supplier_ledger').select('id,store_id,supplier_id,supplier_name,entry_type,amount_minor,delta_minor,balance_after_minor,invoice_no,product_id,product_name,quantity,unit_cost_minor,payment_method,note,actor_id,request_id,created_at',{count:'exact'}).eq('store_id',store).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit)
  ]);
  for(const result of [s,p,l]){if(result.error)throw result.error;if(!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count<0||result.data.length!==Math.min(limit,result.count)||result.data.some(r=>!r?.id||r.store_id!==store)||new Set(result.data.map(r=>r.id)).size!==result.data.length)throw Error('داتای دابینکەران یان کڕین ناتەواوە');}
  const suppliers=s.data.map(r=>supplier(r,store));
  const orders=p.data.map(r=>order(r,store));
  const ledger=l.data.map(r=>{const amount=integer(r.amount_minor),delta=integer(r.delta_minor),balance=integer(r.balance_after_minor);if(amount<0||!['opening_balance','purchase_credit','purchase_cash','payment_sent','return_to_supplier','adjustment'].includes(r.entry_type))throw Error('مامەڵەی دابینکەر نادروستە');const unit=r.unit_cost_minor==null?null:integer(r.unit_cost_minor),quantity=r.quantity==null?null:Number(r.quantity);if((unit!=null&&unit<0)||(quantity!=null&&(!(quantity>0)||!Number.isFinite(quantity)||quantity>99999999999.999))||!r.created_at||!Number.isFinite(Date.parse(r.created_at)))throw Error('وردەکاریی کڕین نادروستە');return {...r,amount_minor:amount,delta_minor:delta,balance_after_minor:balance,unit_cost_minor:unit,quantity};});
  totals(suppliers,orders,ledger);return {suppliers,orders,ledger,supplierTotal:s.count,orderTotal:p.count,ledgerTotal:l.count};
 }
 window.RetailSupplierAccounts=Object.freeze({limit,integer,sum,totals,read,normalize:supplier,normalizeOrder:order});
})();
