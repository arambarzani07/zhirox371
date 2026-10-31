// V82: exactly one read-only, store-scoped response for every registered
// test-market submodule. No demo fallback and no financial writes.
const products=new Set(["barcode-scan","add-box","product-list","price-tags","stock-stack","low-stock","stock-chart","price-label","alert-bell"]);
const barcodes=new Set(["barcode-bars","label-barcode"]);
const receipts=new Set(["receipt","payment-notes","income-rise","sales-trend"]);
const stockChanges=new Set(["stock-transfer"]);
const customers=new Set(["single-customer","debt-book"]);
const debtEntries=new Set(["customer-repayment"]);
const settings=new Set(["manage-users","access-key"]);
const verifySale=new Set(["transaction-check"]);
const suppliers=new Set(["supplier-building","purchase-order","receive-goods","supplier-accounts"]);
const managerOnly=new Set(["single-customer","debt-book","customer-repayment","manage-users","access-key","transaction-check","alert-bell",...suppliers]);
const knownKinds=new Set([...products,...barcodes,...receipts,...stockChanges,...customers,...debtEntries,...settings,...verifySale,...suppliers]);
const column=(key,label,format)=>({key,label,...(format?{format}:{})});
const productColumns=[
 column("name","ناوی کاڵا"),column("barcode","بارکۆد"),
 column("price_minor","نرخ","money"),column("stock_base_units","کۆگا","number")
];
const receiptColumns=[column("receipt_no","ژمارەی پسووڵە"),column("total_minor","کۆی فرۆشتن","money"),column("created_at","بەروار","date")];
const stockColumns=[column("product_name","ناوی کاڵا"),column("delta_base_units","گۆڕانی بڕ","number"),column("created_at","بەروار","date"),column("receipt_no","پسووڵە")];
const barcodeColumns=[column("code","بارکۆد"),column("product_name","ناوی کاڵا"),column("quantity_base_units","بڕی بنەڕەتی","number")];
const customerColumns=[column("display_name","کڕیار"),column("balance_minor","قەرزی ماوە","money")];
const debtColumns=[column("display_name","ناوی کڕیار"),column("entry_type","جۆری مامەڵە","debt_kind"),column("amount_minor","بڕ","money"),column("created_at","بەروار","date")];
const userColumns=[column("username","ناوی بەکارهێنەر"),column("role","ڕۆڵ"),column("enabled","چالاک","bool")];
const auditColumns=[column("receipt_no","پسووڵە"),column("line_count","ژمارەی ڕیزەکان","number"),column("lines_total","کۆی ڕیزەکان","money"),column("total_minor","کۆی پسووڵە","money")];
const supplierColumns=[column("display_name","دابینکەر"),column("phone","ژمارەی پەیوەندی"),column("active","چالاک","bool")];
const orderColumns=[column("display_name","دابینکەر"),column("order_id","ناسنامەی داواکاری"),
  column("status","دۆخی وەرگرتن"),column("line_count","ژمارەی کاڵا","number"),
  column("ordered_cost_minor","کۆی تێچووی داواکاری","money")];
const receivingColumns=[column("display_name","دابینکەر"),column("product_name","کاڵا"),
  column("quantity_base_units","بڕی وەرگیراو","number"),
  column("unit_cost_minor","نرخی کڕینی یەکە","money"),column("received_at","بەروار","date")];
const commitmentColumns=[column("display_name","دابینکەر"),column("purchase_orders","ژمارەی داواکاری","number"),
 column("total_ordered_cost_minor","کۆی نرخە تۆمارکراوەکانی داواکاری","money")];
const noopColumns=[column("status","دۆخ")];
const sqlProducts=`SELECT p.id,p.name,p.price_minor,p.stock_base_units,
 b.code AS barcode FROM zhirox_local.products p
 LEFT JOIN LATERAL (
 SELECT code FROM zhirox_local.barcodes
 WHERE store_id=p.store_id AND product_id=p.id AND active
 ORDER BY code LIMIT 1
 ) b ON true WHERE p.store_id=$1::uuid AND p.active
 ORDER BY p.name,p.id LIMIT 100`;
const sqlReceipts=(cashier)=>`SELECT receipt_no,total_minor,created_at
 FROM zhirox_local.sales WHERE store_id=$1::uuid`+
 (cashier?" AND cashier_id=$2::uuid":"")+
 " ORDER BY receipt_no DESC LIMIT 100";
const withAccess=(kind)=>!managerOnly.has(kind);
export const TEST_SECTION_DATA_MODES=Object.freeze({
 real_data:[...knownKinds],manager_only:[...managerOnly]
});
export async function getTestSectionV82({pool,store,actor,role,sectionId}){
 // Database registry comes from V78: 48 authored sections and their labels.
 // Never trust a client-supplied title, store ID, user role or SQL table name.
 const meta=await pool.query(
  "SELECT section_id,module_id,slot,module_title,title,ui_state FROM zhirox_local.section_registry_v78 WHERE section_id=$1::text",
  [sectionId]
 );
 const section=meta.rows?.[0];
 if(!section)return {status:404,body:{error:"unknown_test_section"}};
 const base={ok:true,section:{id:section.section_id,module_id:section.module_id,
   title:section.title,module_title:section.module_title},source:"isolated_postgresql",write_enabled:false};
 if(!withAccess(sectionId)&&role==="cashier")
   return {status:403,body:{error:"manager_required",section:base.section}};
 const cashier=role==="cashier",p=cashier?[store,actor]:[store];
 let result,columns,note="";
 if(products.has(sectionId)){
  result=await pool.query(sqlProducts,[store]);columns=productColumns;
  if(sectionId==="low-stock"||sectionId==="alert-bell"){
   // Explicit demo-only quantity threshold; not an authentic configured min_stock.
   result={rows:result.rows.filter(row=>Number(row.stock_base_units)<=10)};
   note="تەنها ئەو کاڵایانەی بڕیان 10 یان کەمترە؛ سنووری تاقیکردنەوەییە.";
  }
  if(sectionId==="barcode-scan")note="سکانی ڕاستەقینە و فرۆشتن لەم ڕووکاری تەنها-خوێندنەوە ناچالاکە.";
  if(sectionId==="add-box")note="لیستی کاڵای تۆمارکراو؛ زیادکردنی کاڵای نوێ هێشتا بە API پەیوەست نییە.";
  if(sectionId==="price-label")note="پیشاندانی نرخ؛ چاپی فیزیکی هێشتا ناچالاکە.";
 }else if(barcodes.has(sectionId)){
  result=await pool.query(`SELECT b.code,p.name AS product_name,b.quantity_base_units
  FROM zhirox_local.barcodes b JOIN zhirox_local.products p
   ON p.store_id=b.store_id AND p.id=b.product_id
  WHERE b.store_id=$1::uuid AND b.active ORDER BY b.code LIMIT 100`,[store]);
  columns=barcodeColumns;
 }else if(receipts.has(sectionId)){
  result=await pool.query(sqlReceipts(cashier),p);columns=receiptColumns;
  if(sectionId==="payment-notes")note="ئەمە فرۆشتنە نەختینەییەکانی SQL ـە؛ جۆرەکانی پارەدان و هاوکاتکردنی بانک چالاک نین.";
  if(sectionId==="income-rise")note="کۆی فرۆشتن، نەک قازانج یان پارەی بانکە.";
 }else if(stockChanges.has(sectionId)){
  result=await pool.query(`SELECT p.name AS product_name,l.delta_base_units,l.created_at,s.receipt_no
   FROM zhirox_local.stock_ledger l JOIN zhirox_local.products p
   ON p.store_id=l.store_id AND p.id=l.product_id
   LEFT JOIN zhirox_local.sales s ON s.store_id=l.store_id AND s.id=l.sale_id
   WHERE l.store_id=$1::uuid ORDER BY l.created_at DESC,l.id DESC LIMIT 100`,[store]);
  columns=stockColumns;note="تۆماری هاتووچۆی کۆگا؛ لە داتای تاقیکردنەوەدا تەنها کەمبوونەوە لە فرۆشتن تۆمار کراوە.";
 }else if(customers.has(sectionId)){
  result=await pool.query(`SELECT customer_id,display_name,balance_minor
  FROM zhirox_local.customer_debt_balances_v79
  WHERE store_id=$1::uuid ORDER BY display_name,customer_id LIMIT 100`,[store]);
  columns=customerColumns;
 }else if(debtEntries.has(sectionId)){
  result=await pool.query(`SELECT c.display_name,l.entry_type,l.amount_minor,l.created_at
   FROM zhirox_local.customer_debt_ledger_v79 l JOIN zhirox_local.customers_v79 c
   ON l.store_id=c.store_id AND l.customer_id=c.customer_id
   WHERE l.store_id=$1::uuid ORDER BY l.created_at DESC,l.entry_id DESC LIMIT 100`,[store]);
  columns=debtColumns;note="پارەدانی قەرز تەنها تۆماری ژمێریاریی تاقیکردنەوەیە، نەک وەرگرتنی نەختینە.";
 }else if(settings.has(sectionId)){
  result=await pool.query(`SELECT username,role,enabled FROM zhirox_local.local_users
   WHERE store_id=$1::uuid ORDER BY username LIMIT 100`,[store]);
  columns=userColumns;note="هەژمارەکان لە PostgreSQL نیشان دەدرێن؛ گۆڕینی دەسەڵات لێرە ناچالاکە.";
 }else if(suppliers.has(sectionId)){
  if(sectionId==="supplier-building"){
   result=await pool.query(`SELECT display_name,phone,active FROM zhirox_local.suppliers_v83
   WHERE store_id=$1::uuid ORDER BY display_name,supplier_id LIMIT 100`,[store]);
   columns=supplierColumns;
  }else if(sectionId==="purchase-order"){
   result=await pool.query(`SELECT s.display_name,o.order_id,o.status,
    count(l.line_no)::integer AS line_count,
    coalesce(sum(l.quantity_base_units::numeric*l.unit_cost_minor),0)::bigint AS ordered_cost_minor
    FROM zhirox_local.purchase_orders_v83 o
    JOIN zhirox_local.suppliers_v83 s ON s.store_id=o.store_id AND s.supplier_id=o.supplier_id
    JOIN zhirox_local.purchase_order_lines_v83 l ON l.store_id=o.store_id AND l.order_id=o.order_id
    WHERE o.store_id=$1::uuid GROUP BY o.store_id,o.order_id,o.status,s.display_name,o.ordered_at
    ORDER BY o.ordered_at DESC,o.order_id DESC LIMIT 100`,[store]);
   columns=orderColumns;note="داواکارییەکی تۆمارکراوی کڕین؛ بەڵگەی پارەدانی دابینکەر نییە.";
  }else if(sectionId==="receive-goods"){
   result=await pool.query(`SELECT s.display_name,p.name AS product_name,l.quantity_base_units,
    l.unit_cost_minor,g.received_at
    FROM zhirox_local.goods_receipts_v83 g
    JOIN zhirox_local.purchase_orders_v83 o ON o.store_id=g.store_id AND o.order_id=g.order_id
    JOIN zhirox_local.suppliers_v83 s ON s.store_id=o.store_id AND s.supplier_id=o.supplier_id
    JOIN zhirox_local.goods_receipt_lines_v83 l ON l.store_id=g.store_id AND l.receipt_id=g.receipt_id
    JOIN zhirox_local.products p ON p.store_id=l.store_id AND p.id=l.product_id
    WHERE g.store_id=$1::uuid ORDER BY g.received_at DESC,g.receipt_id DESC,l.line_no LIMIT 100`,[store]);
   columns=receivingColumns;note="وەرگرتنی کاڵا لە PostgreSQL تۆمار کراوە و کۆگا زیاد کراوە؛ ئەم پەڕەیە تەنها بۆ خوێندنەوەیە.";
  }else{
   result=await pool.query(`SELECT s.display_name,count(o.order_id)::integer AS purchase_orders,
    coalesce(sum(l.quantity_base_units::numeric*l.unit_cost_minor),0)::bigint AS total_ordered_cost_minor
    FROM zhirox_local.suppliers_v83 s
    LEFT JOIN zhirox_local.purchase_orders_v83 o
      ON o.store_id=s.store_id AND o.supplier_id=s.supplier_id
    LEFT JOIN zhirox_local.purchase_order_lines_v83 l
      ON l.store_id=o.store_id AND l.order_id=o.order_id
    WHERE s.store_id=$1::uuid GROUP BY s.store_id,s.supplier_id,s.display_name
    ORDER BY s.display_name LIMIT 100`,[store]);
   columns=commitmentColumns;
   note="ئەم بڕانە تێچووی داواکاریی کڕینن؛ قەرز، وەرگرتنی نەختینە یان پارەدانی ڕاستەقینەی دابینکەر نین.";
  }
 }else if(verifySale.has(sectionId)){
  result=await pool.query(`SELECT s.receipt_no,count(l.line_no)::integer AS line_count,
    coalesce(sum(l.line_total_minor),0)::bigint AS lines_total,s.total_minor
    FROM zhirox_local.sales s JOIN zhirox_local.sale_lines l
    ON l.store_id=s.store_id AND l.sale_id=s.id
    WHERE s.store_id=$1::uuid GROUP BY s.id,s.store_id,s.receipt_no,s.total_minor
    ORDER BY s.receipt_no DESC LIMIT 100`,[store]);
  columns=auditColumns;note="پشکنینی کۆی ڕیزەکانی پسووڵە؛ پشتڕاستکردنەوەی فیزیکیی پارە نییە.";
 }else{
  // Exposing a dedicated screen does not authorize missing business actions.
  return {status:200,body:{...base,status:"planned",columns:noopColumns,rows:[],
    note:"پەڕەکە بەردەستە، بەڵام داتابەیس و کردارە تایبەتییەکەی هێشتا جێبەجێ نەکراوە؛ هیچ داتای ساختە نیشان نادرێت."}};
 }
 return {status:200,body:{...base,status:"read_only",columns,rows:result.rows,note}};
}
