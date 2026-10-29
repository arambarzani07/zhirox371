import test from 'node:test';import assert from 'node:assert/strict';import '../catalog-import.js';
const {prepare,parseCsv}=globalThis.RetailCatalogImport;
test('CSV headers are mapped, never inserted as products',()=>{
 for(const s of ['name,barcode,price\nشیر,001234,1500','ItemNameID,ItemName,ItemCode,SalePrice,WholeSalePrice\n2,شیر,001234,1500,1200']){
 const r=prepare(s);assert.equal(r.header,true);assert.equal(r.items.length,1);assert.equal(r.items[0].barcode,'001234');assert.equal(r.items[0].price,1500);}
});
test('legacy headerless rows and quoted separators retain data',()=>{
 const r=prepare('\uFEFF"شیر, دانە",0012,1500\r\nئاو,0013,500');assert.equal(r.items[0].name,'شیر, دانە');assert.equal(r.header,false);
 assert.deepEqual(parseCsv('"a""b";c;5'),[['a"b','c','5']]);
});
test('bad CSV and invalid prices never become zero or rounded values',()=>{
 for(const s of ['name,barcode\na,b','a,b,','a,b,12.5','a,b,NaN','a,b,-3','a,b,1000000000','"a,b,3','"a"oops,b,3'])assert.throws(()=>prepare(s));
});
test('stock and advanced fields fail before any rows can be imported',()=>{
 for(const s of ['name,barcode,price,stock_quantity\na,b,500,10000000','name,barcode,price,purchase_price\na,b,500,300','name,barcode,price,sale_mode\na,b,500,both','name,barcode,price,sku\na,b,500,SKU1'])assert.throws(()=>prepare(s));
});
test('duplicate barcode conflict rejects the whole plan; exact duplicates are skipped',()=>{
 assert.throws(()=>prepare('a,b,5\nc,b,6'));const r=prepare('a,b,5\na,b,5');assert.equal(r.items.length,1);assert.equal(r.duplicates,1);
});
test('one bad late row prevents a partial preflight result',()=>{assert.throws(()=>prepare('a,01,5\nb,02,not-a-price'));});
