/* V20 deterministic, side-effect-free basket rules.
 * No database calls here; the server remains the authority for price, stock,
 * barcode ownership and checkout transaction/idempotency.
 */
"use strict";
(function(root){
 const fail=(reason)=>({ok:false,reason});
 const grams=n=>Math.round(Number(n)*1000);
 const fixedKg=n=>Number((Number(n)||0).toFixed(3));
 function used(cart,productId,exclude=-1){
   return fixedKg(cart.reduce((sum,line,i)=>sum+(i===exclude||line.id!==productId?0:Number(line.qty)*Number(line.units)),0));
 }
 function validLine(line){
   return Boolean(line&&line.id&&line.barcode&&["unit","carton"].includes(line.mode)&&
     Number.isSafeInteger(line.qty)&&line.qty>=1&&line.qty<=100&&
     Number.isSafeInteger(line.price)&&line.price>=0&&line.price<=9999999999999&&
     Number.isFinite(line.units)&&grams(line.units)>0&&
     Math.abs(Number(line.units)*1000-grams(line.units))<0.000001&&
     (!line.isScale||(line.mode==="unit"&&line.qty===1&&
       /^27[0-9]{11}$/.test(line.barcode)&&
       Number.isSafeInteger(Number(line.scaleGrams))&&
       Number(line.scaleGrams)===grams(line.units))));
 }
 function add(cart,line,available){
   if(!Array.isArray(cart)||cart.length>100||!validLine(line)||line.qty!==1)return fail("invalid");
   if(!Number.isFinite(available)||available<0)return fail("stock");
   // Same 13-digit code on a second scan cannot prove a second physical package.
   // An operator must never accidentally charge a weighed label twice.
   if(line.isScale&&cart.some(x=>x.isScale&&x.barcode===line.barcode))return fail("duplicate_scale");
   const at=line.isScale?-1:cart.findIndex(x=>!x.isScale&&x.id===line.id&&
      x.mode===line.mode&&x.price===line.price&&x.units===line.units&&
      // Preserve distinct pricing and packaging for unrelated alias codes.
      x.barcode===line.barcode);
   const previous=at<0?0:cart[at].qty;
   const quantity=previous+1;
   if(quantity>100)return fail("limit");
   const need=fixedKg(used(cart,line.id)+(Number(line.units)));
   if(need>available+0.0000001)return fail("stock");
   if(at<0&&cart.length>=100)return fail("limit");
   const next=cart.map(x=>({...x}));
   if(at>=0)next[at].qty=quantity;
   else next.push({...line,qty:1,available});
   return {ok:true,cart:next,merged:at>=0};
 }
 function edit(cart,index,nextQuantity,available){
   if(!Array.isArray(cart)||!Number.isSafeInteger(index)||index<0||index>=cart.length)return fail("invalid");
   if(!Number.isFinite(available)||available<0)return fail("stock");
   const line=cart[index];
   if(!Number.isSafeInteger(nextQuantity)||nextQuantity<0||nextQuantity>100)return fail("quantity");
   if(line.isScale&&nextQuantity>1)return fail("scale_immutable");
   const newUsed=fixedKg(used(cart,line.id,index)+nextQuantity*Number(line.units));
   if(newUsed>available+0.0000001)return fail("stock");
   const next=cart.map(x=>({...x}));
   if(nextQuantity===0)next.splice(index,1);
   else next[index].qty=nextQuantity;
   return {ok:true,cart:next};
 }
 function validate(cart,getStock){
   if(!Array.isArray(cart)||cart.length===0||cart.length>100)return fail("invalid");
   const seen=new Set();
   let subtotal=0;
   for(const line of cart){
     if(!validLine(line))return fail("invalid");
     if(line.isScale){
       if(seen.has(line.barcode))return fail("duplicate_scale");
       seen.add(line.barcode);
     }
     const stock=Number(getStock(line.id));
     if(!Number.isFinite(stock)||used(cart,line.id)>stock+0.0000001)return fail("stock");
     subtotal+=line.qty*line.price;
     if(!Number.isSafeInteger(subtotal)||subtotal>9999999999999)return fail("price");
   }
   return {ok:true,subtotal};
 }
 root.CashierV20=Object.freeze({add,edit,validate,used,validLine});
})(typeof window!=="undefined"?window:globalThis);
