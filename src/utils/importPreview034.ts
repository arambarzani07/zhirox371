import type { Product } from '../types';

/** Source 034 is a file preview. Nothing in this module writes product records. */
export type ImportStatus034='ready'|'error';
export interface PreviewImportRow034 {
 line:number;
 name:string;
 barcode:string;
 priceIqd:number|null;
 unit:string;
 issues:string[];
 status:ImportStatus034;
}
export interface ImportPreview034 {
 rows:PreviewImportRow034[];
 total:number;
 ready:number;
 errors:number;
 warnings:string[];
}
export const MAX_CSV_CHARACTERS_034=5_000_000;
export const MAX_CSV_ROWS_034=10_000;
type Field034='name'|'barcode'|'price'|'unit';
const fieldNames:Record<Field034,readonly string[]>={
 name:['name','productname','ناو','ناوی کاڵا'],
 barcode:['barcode','بارکۆد'],
 price:['price','saleprice','sale_price_iqd','نرخ','نرخی فرۆشتن'],
 unit:['unit','base_unit','یەکە','جۆری یەکە']
};
const normalizeHeader=(value:string)=>value.trim().replace(/^\uFEFF/,'').toLocaleLowerCase();
function parseCsvCells034(text:string):string[][] {
 const data=text.replace(/^\uFEFF/,'');
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<data.length;i++){
  const ch=data[i];
  if(ch==='"'){
   if(quoted&&data[i+1]==='"'){field+='"';i++;}
   else if(quoted)quoted=false;
   else if(field==='')quoted=true;
   else throw Error('فۆرماتی فایل CSV نادروستە');
  }else if(ch===','&&!quoted){row.push(field);field='';}
  else if((ch==='\n'||ch==='\r')&&!quoted){
   row.push(field);
   if(row.some(cell=>cell.trim()))rows.push(row);
   row=[];field='';
   if(ch==='\r'&&data[i+1]==='\n')i++;
   if(rows.length>MAX_CSV_ROWS_034+1)throw Error('ژمارەی ڕیزەکان لە سنووری پشکنین زیاترە');
  }else field+=ch;
 }
 if(quoted)throw Error('کۆتایی دەقی ناو نیشانەی دەنگدان لە CSV نادروستە');
 row.push(field);
 if(row.some(cell=>cell.trim()))rows.push(row);
 return rows;
}
const makeError=(warning:string):ImportPreview034=>({
 rows:[],total:0,ready:0,errors:0,warnings:[warning]
});
const normalizeBarcode=(s:string)=>s.trim();
export const previewCsvProducts034=(
 text:string,products:readonly Product[]
):ImportPreview034=>{
 if(!text.trim())return makeError('فایلی کاڵاکان هێشتا هەڵنەبژێردراوە');
 if(text.length>MAX_CSV_CHARACTERS_034)
  return makeError('فایلەکە لە سنووری پشکنینی ئەم ڕووکاری تاقیکردنەوەیە گەورەترە');
 let input:string[][];
 try{input=parseCsvCells034(text);}catch(err){
  return makeError(err instanceof Error?err.message:'فایلەکە نەتوانرا بخوێندرێتەوە');
 }
 if(!input.length)return makeError('هیچ ڕیزێکی CSV نەدۆزرایەوە');
 if(input.length>MAX_CSV_ROWS_034+1)return makeError('ژمارەی ڕیزەکان لە سنووری پشکنین زیاترە');
 const first=input[0].map(normalizeHeader);
 const keys:Field034[]=['name','barcode','price','unit'];
 const hasHeader=first.some(v=>keys.some(key=>fieldNames[key].includes(v)));
 let indexes:Record<Field034,number>={name:0,barcode:1,price:2,unit:3};
 let dataStart=0;
 if(hasHeader){
  indexes={name:-1,barcode:-1,price:-1,unit:-1};
  for(const key of keys){indexes[key]=first.findIndex(token=>fieldNames[key].includes(token));}
  dataStart=1;
  if(keys.some(key=>indexes[key]<0))return makeError('سەرپەڕەی CSV دەبێت ناوی کاڵا، بارکۆد، نرخ و جۆری یەکەی هەبێت');
  const indices=keys.map(key=>indexes[key]);
  if(new Set(indices).size!==4)return makeError('ستوونەکانی CSV دووبارە یان نادروستن');
 }
 const inputRows=input.slice(dataStart);
 if(inputRows.length>MAX_CSV_ROWS_034)return makeError('ژمارەی ڕیزەکان لە سنووری پشکنین زیاترە');
 const seenCodes=new Map<string,number>();
 const seenNames=new Map<string,number>();
 const existingCodes=new Set<string>();
 const existingNames=new Map<string,string>();
 for(const p of products){
  const record=(value:string)=>{if(value.trim())existingCodes.add(value.trim());};
  record(p.unit_barcode);for(const v of p.unit_alias_barcodes||[])record(v);
  if(p.carton){record(p.carton.barcode);for(const v of p.carton.alias_barcodes||[])record(v);}
  for(const pack of p.extra_packs||[]){record(pack.barcode);for(const v of pack.alias_barcodes||[])record(v);}
  existingNames.set(p.name.trim().toLocaleLowerCase(),p.unit_barcode);
 }
 const candidate=inputRows.map((cols,i)=>{
  const get=(key:Field034)=>(cols[indexes[key]]||'').trim();
  const name=get('name'),barcode=normalizeBarcode(get('barcode'));
  const rawPrice=get('price'),rawUnit=get('unit').toLocaleLowerCase();
  const unit=rawUnit==='unit'||rawUnit==='دانە'?'دانە'
    :rawUnit==='kg'||rawUnit==='کیلۆ'||rawUnit==='کیلۆگرام'?'کیلۆ':rawUnit;
  if(barcode)seenCodes.set(barcode,(seenCodes.get(barcode)||0)+1);
  if(name)seenNames.set(name.toLocaleLowerCase(),(seenNames.get(name.toLocaleLowerCase())||0)+1);
  return {line:i+dataStart+1,name,barcode,rawPrice,unit,columns:cols.length};
 });
 const rows:PreviewImportRow034[]=candidate.map(c=>{
  const issues:string[]=[];
  if(c.columns!==4)issues.push('ژمارەی ستوونەکان نادروستە');
  if(!c.name||c.name.length>200)issues.push('ناوی کاڵا نادروستە');
  if(!c.barcode||c.barcode.length>60||/[\s,،;]/u.test(c.barcode))
   issues.push('بارکۆدی نادروست');
  if(c.barcode&&(seenCodes.get(c.barcode)||0)>1)issues.push('بارکۆدی دووبارە لە فایل');
  if(c.barcode&&existingCodes.has(c.barcode))issues.push('بارکۆد پێشتر لە کەتەلۆگدا تۆمارکراوە');
  if(c.name&&(seenNames.get(c.name.toLocaleLowerCase())||0)>1)
   issues.push('ناوی دووبارە لە فایل');
  if(c.name&&existingNames.has(c.name.toLocaleLowerCase()))
   issues.push('ناوی کاڵا پێشتر لە کەتەلۆگدا تۆمارکراوە');
  if(c.unit!=='دانە'&&c.unit!=='کیلۆ')
   issues.push('جۆری یەکە دیار نییە یان پشتیوانی ناکرێت');
  const priceIqd=/^\d+$/u.test(c.rawPrice)?Number(c.rawPrice):NaN;
  if(!Number.isSafeInteger(priceIqd)||priceIqd<=0||priceIqd>1_000_000_000)
   issues.push('نرخی نادروست');
  return {
   line:c.line,name:c.name,barcode:c.barcode,priceIqd:Number.isSafeInteger(priceIqd)&&priceIqd>0?priceIqd:null,
   unit:c.unit,issues,status:issues.length?'error':'ready'
  };
 });
 const ready=rows.filter(r=>r.status==='ready').length;
 return {rows,total:rows.length,ready,errors:rows.length-ready,warnings:[]};
};
