import test from 'node:test';
import assert from 'node:assert/strict';
import {saleUnitConfig,resolveFixedPackBarcode,validateDemoSaleCart} from '../src/utils/fixedPackSales.js';

const product = () => ({
  id:'water',name:'ئاو',base_unit:'unit',sale_mode:'both',unit_barcode:'UNIT',
  unit_alias_barcodes:[],unit_sale_price_iqd:500,
  carton:{name:'کارتۆنی ئاو',barcode:'CARTON',alias_barcodes:[],units_per_carton:24,sale_price_iqd:9000},
  extra_packs:[
    {kind:'bundle',name:'دەستەی ئاو',barcode:'BUNDLE',alias_barcodes:['BUNDLE-2'],units_per_pack:6,sale_price_iqd:2700},
    {kind:'set',name:'سێتی ئاو',barcode:'SET',alias_barcodes:[],units_per_pack:3,sale_price_iqd:1450}
  ],stock:40
});
const line=(p,mode,qty=1)=>{const s=saleUnitConfig(p,mode);return {id:mode,productId:p.id,
 name:s.name,barcode:s.barcode,mode,price:s.price,qty,units:s.units,isScale:false,available:p.stock};};

test('bundle/set primary and alias resolve without falling back to single unit',()=>{
 const p=product();
 assert.equal(resolveFixedPackBarcode([p],'BUNDLE-2')?.mode,'bundle');
 assert.equal(resolveFixedPackBarcode([p],'SET')?.mode,'set');
 assert.equal(resolveFixedPackBarcode([p],'CARTON'),null);
 assert.equal(saleUnitConfig(p,'bundle')?.units,6);
 assert.equal(saleUnitConfig(p,'set')?.price,1450);
});
test('mixed unit, carton, bundle and set use one cumulative base-unit stock limit',()=>{
 const p=product();
 const cart=[line(p,'unit',1),line(p,'bundle',2),line(p,'set',1),line(p,'carton',1)];
 assert.deepEqual(validateDemoSaleCart(cart,[p]),{ok:true,subtotal:500+5400+1450+9000});
 assert.equal(validateDemoSaleCart([...cart,line(p,'unit',1)],[p]).reason,'insufficient_stock');
});
test('changed pack price, count, barcode and removed definition fail before checkout',()=>{
 const p=product(),sale=line(p,'bundle');
 assert.equal(validateDemoSaleCart([sale],[p]).ok,true);
 const price=product();price.extra_packs[0].sale_price_iqd++;
 assert.equal(validateDemoSaleCart([sale],[price]).reason,'stale_sale_unit');
 const count=product();count.extra_packs[0].units_per_pack=7;
 assert.equal(validateDemoSaleCart([sale],[count]).reason,'stale_sale_unit');
 const barcode=product();barcode.extra_packs[0].barcode='OTHER';
 assert.equal(validateDemoSaleCart([sale],[barcode]).reason,'stale_sale_unit');
 const missing=product();missing.extra_packs=[];
 assert.equal(validateDemoSaleCart([sale],[missing]).reason,'stale_sale_unit');
});
test('malformed quantities, duplicate pack ownership and weighted products are rejected',()=>{
 const p=product();
 assert.equal(resolveFixedPackBarcode([p,p],'BUNDLE')?.conflict,true);
 assert.equal(validateDemoSaleCart([{...line(p,'set'),qty:1.5}],[p]).reason,'invalid_line');
 assert.equal(validateDemoSaleCart([{...line(p,'set'),price:-1}],[p]).reason,'invalid_line');
 const kg=product();kg.base_unit='kg';
 assert.equal(saleUnitConfig(kg,'bundle'),null);
});

test('corrupted cross-mode or cross-product pack barcode ownership always fails closed',()=>{
  const p=product();
  const clash=product(); clash.id='foreign'; clash.unit_barcode='BUNDLE';
  assert.equal(resolveFixedPackBarcode([p,clash],'BUNDLE')?.conflict,true);
  const same=product(); same.carton.alias_barcodes.push('SET');
  assert.equal(resolveFixedPackBarcode([same],'SET')?.conflict,true);
  assert.equal(resolveFixedPackBarcode([p],'UNIT'),null,
    'ordinary unit barcodes continue to be resolved by original cashier logic');
});
