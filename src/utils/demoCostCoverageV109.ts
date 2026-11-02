// V109: Browser DEMO cost coverage. Missing purchase prices are UNKNOWN,
// never invented as a % of selling price or silently treated as zero profit.
import type {Product,Receipt} from "../types";

const knownPrice=(v:unknown):v is number=>typeof v==="number"&&
 Number.isSafeInteger(v)&&v>0;
export function demoCostCoverageV109(products:Product[],receipts:Receipt[]){
 const productsById=new Map(products.map(p=>[p.id,p]));
 let knownCost=0,unknownLines=0,verifiedLines=0;
 for(const receipt of receipts)for(const line of receipt.items){
  const p=productsById.get(line.productId);
  let packageCost:number|null=null;
  if(p&&!line.isScale){
   if(line.mode==="carton"){
    if(knownPrice(p.carton?.purchase_price_iqd))
     packageCost=p.carton!.purchase_price_iqd;
   }else if(knownPrice(p.unit_purchase_price_iqd)&&
    typeof line.units==="number"&&Number.isFinite(line.units)&&line.units>0){
    packageCost=p.unit_purchase_price_iqd*line.units;
   }
  }
  if(packageCost===null||!Number.isSafeInteger(packageCost)||packageCost<=0||
   typeof line.qty!=="number"||!Number.isFinite(line.qty)||line.qty<=0){
    unknownLines++;
  }else{
    knownCost+=packageCost*line.qty;
    verifiedLines++;
  }
 }
 return {knownCost,unknownLines,verifiedLines,
  complete:unknownLines===0&&Number.isSafeInteger(knownCost)};
}
export function demoInventoryCostCoverageV109(products:Product[]){
 let knownCost=0,unknownProducts=0;
 for(const p of products){
  if(typeof p.stock!=="number"||!Number.isFinite(p.stock)||p.stock<0){
   unknownProducts++;continue;
  }
  if(p.stock===0)continue;
  if(!knownPrice(p.unit_purchase_price_iqd)){
   unknownProducts++;continue;
  }
  knownCost+=p.stock*p.unit_purchase_price_iqd;
 }
 return {knownCost,unknownProducts,complete:unknownProducts===0&&Number.isSafeInteger(knownCost)};
}
