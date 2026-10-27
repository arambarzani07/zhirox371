/* Catalog ownership lives in Products; checkout never creates or edits barcode definitions. */
"use strict";
(function(root){
 function fail(message){throw new Error(message);}
 function text(v){return String(v??"").trim();}
 function price(v,required=false,label="نرخ"){
  if(text(v)===""){if(required)fail(label+" پێویستە");return null;}
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<0||n>999999999)fail(label+" نادروستە");
  return n;
 }
 function barcode(v,required=false){
  const s=text(v);
  if(!s){if(required)fail("بارکۆدی دانە پێویستە");return "";}
  if(s.length>60||/[\s,،;]/u.test(s))fail("بارکۆد نادروستە");
  return s;
 }
 function fromForm(form){
  const f=form instanceof Map?form:form;
  const get=name=>f.get(name);
  const name=text(get("name"));
  if(!name||name.length>160)fail("ناوی کاڵا نادروستە");
  const incoming=text(get("sale_mode"));
  const requestedMode=incoming||(text(get("carton_barcode"))||text(get("extra_carton_barcodes"))||text(get("units_per_carton"))||text(get("carton_price"))?"both":"unit");
  if(!["unit","carton","both"].includes(requestedMode))fail("شێوازی فرۆشتن نادروستە");
  const unitEnabled=requestedMode!=="carton",cartonEnabled=requestedMode!=="unit";
  const rawPlu=text(get("plu"));
  const rawUnit=text(get("barcode"));
  const scaleOnly=unitEnabled&&!rawUnit;
  // A scale-only item uses its 5-digit PLU; it has no permanent unit barcode.
  // A 7-digit 27+PLU fragment is never a scannable product barcode.
  if(scaleOnly&&!rawPlu)fail("بارکۆدی دانە پێویستە یان PLU بۆ کاڵای تەرازوویی");
  if(scaleOnly&&(requestedMode!=="unit"||!/^[0-9]{1,5}$/.test(rawPlu)||
     Number(rawPlu)===0))fail("بۆ کاڵای تەرازوویی کۆدی PLU ـی 5 ژمارەیی پێویستە");
  const unit=barcode(get("barcode"),unitEnabled&&!scaleOnly);
  if(/^27[0-9]{5}$/.test(unit))fail("27+PLU بارکۆدی تەواو نییە؛ تەنها PLU تۆمار بکە");
  if(!unitEnabled&&unit)fail("بارکۆدی دانە لەم شێوازەدا چالاک نییە");
  const unitPrice=price(get("price"),unitEnabled,"نرخی فرۆشتنی دانە");
  const unitCost=price(get("purchase_price"),false,"نرخی کڕینی دانە");
  const cartonCost=price(get("carton_purchase_price"),false,"نرخی کڕینی کارتۆن");
  const cartonPrice=price(get("carton_price"),false,"نرخی فرۆشتنی کارتۆن");
  const sku=text(get("sku")),plu=scaleOnly?rawPlu.padStart(5,"0"):rawPlu,cartonName=text(get("carton_name"));
  if(sku.length>80||plu.length>30||cartonName.length>100)fail("زانیارییەکانی کاڵا زۆر درێژن");
  const cartonCode=barcode(get("carton_barcode"));
  const rawExtra=text(get("extra_barcodes"));
  const unitAliases=rawExtra?rawExtra.split(/[\n,،;]+/u).map(x=>barcode(x)).filter(Boolean):[];
  const rawCartonExtra=text(get("extra_carton_barcodes"));
  const cartonAliases=rawCartonExtra?rawCartonExtra.split(/[\n,،;]+/u).map(x=>barcode(x)).filter(Boolean):[];
  if(scaleOnly&&unitAliases.length)fail("فرەبارکۆدی دانە بەبێ بارکۆدی سەرەکی ڕێگەپێدراو نییە");
  if(!unitEnabled&&(unitAliases.length||unitCost!==null))fail("خانەکانی دانە لەم شێوازەدا چالاک نین");
  if(!cartonEnabled&&(cartonAliases.length||cartonCode||cartonName||text(get("units_per_carton"))||cartonCost!==null||cartonPrice!==null))fail("خانەکانی کارتۆن لەم شێوازەدا چالاک نین");
  if(unitAliases.length>30||cartonAliases.length>30)fail("ژمارەی بارکۆدەکان لە سنوور زیاترە");
  const codes=[...(unit?[unit]:[]),...unitAliases,...(cartonCode?[cartonCode]:[]),...cartonAliases];
  if(new Set(codes).size!==codes.length)fail("بارکۆدی دووبارە لە هەمان کاڵا هەیە");
  const rawUnits=text(get("units_per_carton"));
  const cartonRequested=cartonEnabled;
  let units=null;
  if(cartonRequested){
   if(!cartonCode||!rawUnits||cartonPrice===null)fail("بارکۆد، بڕی دانە و نرخی فرۆشتنی کارتۆن پێویستن");
   units=Number(rawUnits);
   if(!Number.isSafeInteger(units)||units<2||units>100000)fail("ژمارەی دانەی کارتۆن نادروستە");
  }
  const advanced=Boolean(requestedMode!=="unit"||unitAliases.length||cartonRequested||unitCost!==null||sku||plu);
  return Object.freeze({
   advanced, sale_mode:requestedMode,
   name, sku:sku||null, plu:plu||null,
   unit_barcode:unit,
   unit_purchase_price_iqd:unitCost,
   unit_sale_price_iqd:unitPrice,
   unit_alias_barcodes:unitAliases,
   carton:cartonRequested?{
    name:cartonName||null,barcode:cartonCode,alias_barcodes:cartonAliases,units_per_carton:units,
    purchase_price_iqd:cartonCost,sale_price_iqd:cartonPrice
   }:null,
   currency:"IQD"
  });
 }
 root.RetailCatalog=Object.freeze({fromForm});
})(typeof window!=="undefined"?window:globalThis);
