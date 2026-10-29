/* UI-only V22 fixture. Database arithmetic is tested separately against real SQL. */
(() => {
 const base=window.supabase.createClient,q=window.__retailQA;
 const original=base();
 window.supabase.createClient=(...args)=>{const client=base(...args);return {...client,rpc:async(name,args)=>{
  if(!['retail_find_return_receipt_v22','retail_return_state_v22','retail_return_item_v22','retail_report_v22'].includes(name))return client.rpc(name,args);
  q.called.push({name,args});
  if(q.v22Error){const error=q.v22Error;q.v22Error=null;return {data:null,error};}
  if(name==='retail_find_return_receipt_v22'){
   const raw=String(args.p_query||'').trim().replace(/^#/,'');
   const sales=q.sales.filter(s=>s.store_id===args.p_store&&s.status==='posted');
   let sale=sales.find(s=>s.id===raw||(/^\d+$/.test(raw)&&BigInt(String(s.receipt_no))===BigInt(raw)));
   if(sale)return {data:{found:true,sale_id:sale.id,receipt_no:sale.receipt_no},error:null};
   const ids=[...new Set(q.saleItems.filter(i=>i.store_id===args.p_store&&i.package_barcode===raw&&sales.some(s=>s.id===i.sale_id)).map(i=>i.sale_id))];
   return {data:ids.length===1?{found:true,sale_id:ids[0]}:{found:false,ambiguous:ids.length>1},error:null};
  }
  if(name==='retail_return_state_v22'){
   const sale=q.sales.find(s=>s.id===args.p_sale&&s.store_id===args.p_store&&s.status==='posted');if(!sale)return {data:null,error:{code:'22023',message:'Receipt not found'}};
   const result={data:{sale,items:q.saleItems.filter(l=>l.sale_id===sale.id).map(l=>({...l,base_unit_snapshot:l.base_unit_snapshot||'unit',net_minor:l.net_minor??Math.round(l.quantity*l.unit_price_minor),returned_quantity:l.returned_quantity||0,returned_minor:l.returned_minor||0,remaining_quantity:l.quantity-(l.returned_quantity||0)}))},error:null};
   if(q.pauseReturnDetail){q.pauseReturnDetail=false;const snapshot=structuredClone(result);return new Promise(resolve=>{q.completeReturnDetail=()=>{q.completeReturnDetail=null;resolve(snapshot);};});}
   return result;
  }
  if(name==='retail_return_item_v22'){
   const line=q.saleItems.find(l=>l.id===args.p_line&&l.sale_id===args.p_sale);if(!line||!(args.p_quantity>0)||args.p_quantity>line.quantity-(line.returned_quantity||0))return {data:null,error:{code:'22023',message:'Return exceeds remaining sold quantity'}};
   const refund=Math.round((line.net_minor??line.quantity*line.unit_price_minor)*((line.returned_quantity||0)+args.p_quantity)/line.quantity)-(line.returned_minor||0);
   line.returned_quantity=(line.returned_quantity||0)+args.p_quantity;line.returned_minor=(line.returned_minor||0)+refund;
   const sale=q.sales.find(s=>s.id===args.p_sale);sale.returned_minor_total=(sale.returned_minor_total||0)+refund;sale.refunded=line.returned_quantity===line.quantity;
   return {data:{sale_id:sale.id,receipt_no:sale.receipt_no,refunded_minor:refund,cash_refunded_minor:refund,debt_reduced_minor:0,request_id:args.p_request},error:null};
  }
  // Server-sized totals intentionally differ from the page, to catch client recalc regressions.
  const items=args.p_offset===50?[{id:q.products[0].id,name:'پەڕەی دووەم',base_unit:'unit',net_quantity:1,net_revenue_minor:1000,cost_minor:700,profit_minor:300,current_unit_cost:700,stock_quantity:2,inventory_value_minor:1400,min_stock:5,abc:'C'}]:[{id:q.products[0].id,name:q.products[0].name,base_unit:'unit',net_quantity:3,net_revenue_minor:2900,cost_minor:2100,profit_minor:800,current_unit_cost:700,stock_quantity:7,inventory_value_minor:4900,min_stock:5,abc:'A'}];
  return {data:{summary:{sales_minor:900000,discount_minor:100,net_minor:897100,sale_count:450,refund_minor:2900,refund_count:1,cash_sales_minor:897100,credit_sales_minor:0,cost_minor:630000,unknown_cost_lines:0,unknown_refund_dates:0,other_revenue_minor:0,expense_minor:0,gross_profit_minor:267100,net_profit_minor:267100},inventory:{product_count:121,low_count:120,out_count:120,expiry_count:0,unknown_cost_products:0,value_minor:4900,sale_value_minor:7000,overdue_customer_debt_minor:0},abc:{class_a:1,class_b:0,class_c:120},items,total_count:121,offset:args.p_offset||0,limit:50,generated_at:new Date().toISOString(),timezone:'Asia/Baghdad'},error:null};
 }};};
})();
