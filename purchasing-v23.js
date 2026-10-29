"use strict";
(() => {
 const requireClient=(db,store)=>{if(!db||!store)throw new Error("پەیوەندیی سێرڤەر بەردەست نییە");};
 async function insertOrders(db,store,orders){
  requireClient(db,store);
  if(!Array.isArray(orders)||!orders.length)throw new Error("داواکاری بەتاڵە");
  const ids=new Set();
  const rows=orders.map(o=>{
   if(o.store_id!==store||!o.id||ids.has(o.id)||!(o.quantity>0)||!Number.isSafeInteger(o.unit_cost_minor)||o.unit_cost_minor<0||!Number.isSafeInteger(o.total_cost_minor)||o.total_cost_minor!==Math.round(o.quantity*o.unit_cost_minor))throw new Error("زانیاری داواکاری کڕین نادروستە");
   ids.add(o.id);
   return {id:o.id,store_id:store,po_no:o.po_no,supplier_id:o.supplier_id,supplier_name:o.supplier_name,product_id:o.product_id,product_name:o.product_name,quantity:o.quantity,unit_cost_minor:o.unit_cost_minor,total_cost_minor:o.total_cost_minor,expected_date:o.expected_date,status:"pending",note:o.note||null,actor_id:o.actor_id};
  });
  // One PostgreSQL statement: a failed batch cannot leave a successful local subset.
  const {data,error}=await db.from("retail_purchase_orders").insert(rows).select("id");
  if(error)throw error;
  if(!Array.isArray(data)||data.length!==ids.size||new Set(data.map(x=>x.id)).size!==ids.size||data.some(x=>!ids.has(x.id)))throw new Error("تۆمارکردن پشتڕاست نەکرایەوە؛ پێش دووبارە ناردن لیستەکە نوێ بکەرەوە");
  return data;
 }
 async function cancelOrder(db,store,id){
  requireClient(db,store);
  const {data,error}=await db.from("retail_purchase_orders").update({status:"cancelled",updated_at:new Date().toISOString()}).eq("store_id",store).eq("id",id).eq("status","pending").select("id").maybeSingle();
  if(error)throw error;
  if(data?.id!==id)throw new Error("داواکاری گۆڕاوە یان مۆڵەتت نییە؛ لیستەکە نوێ بکەرەوە");
  return data;
 }
 globalThis.PurchasingV23=Object.freeze({insertOrders,cancelOrder});
})();
