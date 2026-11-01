// V102 local-only authentic CSV reader, never a live checkout or inventory feed.
// Source CSV comes from an operator-selected Windows export, NOT GitHub/public web.
// No SQL, Supabase, product mutation or financial side effects.
import {open,constants} from "node:fs/promises";
import {constants as fsConstants} from "node:fs";
import {isAbsolute} from "node:path";
import {createHash} from "node:crypto";

const MAX_BYTES=16*1024*1024;
const MAX_ROWS=100000;
const MAX_CELL=2048;
const BARCODE=/^[0-9A-Za-z._-]{3,40}$/;
const norm=s=>String(s??"").trim().normalize("NFKC");
function parseRows(csv){
 const out=[];let row=[],field="",quoted=false,closed=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(c==='"'){
   if(quoted&&csv[i+1]==='"'){field+='"';i++;continue;}
   if(quoted){quoted=false;closed=true;continue;}
   if(field===""&&!closed){quoted=true;continue;}
   throw Error("v102_invalid_csv_quote");
  }
  if(!quoted&&(c===","||c==="\n"||c==="\r")){
   row.push(field);field="";closed=false;
   if(c!==","){
    if(row.some(x=>x!=="")){out.push(row);if(out.length>MAX_ROWS+1)throw Error("v102_csv_too_many_rows");}
    row=[];
    if(c==="\r"&&csv[i+1]==="\n")i++;
   }
   continue;
  }
  if(closed&&c!==" "&&c!=="\t")throw Error("v102_invalid_csv_after_quote");
  if(!closed){field+=c;if(field.length>MAX_CELL)throw Error("v102_csv_cell_too_long");}
 }
 if(quoted)throw Error("v102_unterminated_csv_quote");
 if(field!==""||row.length){row.push(field);out.push(row);}
 return out;
}
const aliases={
 id:["ItemNameID"],barcode:["ItemCode"],name:["ItemName","Item Name"],
 price:["SalePrice","SalePrice (IQD)"]
};
function tableHeader(row){
 const indices={};const normHeader=row.map(x=>norm(x).replace(/^\uFEFF/,""));
 for(const [key,possibilities] of Object.entries(aliases)){
  const matches=normHeader.flatMap((col,i)=>possibilities.includes(col)?[i]:[]);
  if(matches.length!==1)throw Error("v102_missing_or_ambiguous_required_column_"+key);
  indices[key]=matches[0];
 }
 return indices;
}
function validPrice(v){
 const s=norm(v);
 // IQD cash sales must be nonnegative whole currency units; no guessed decimals.
 if(!/^(?:0|[1-9][0-9]*)(?:\.0+)?$/.test(s))return null;
 const n=Number(s);
 return Number.isSafeInteger(n)?n:null;
}
export function parseMarketCSVV102(csv,{modifiedAt,sha256,filename="selected-file.csv"}={}){
 if(typeof csv!=="string"||Buffer.byteLength(csv,"utf8")>MAX_BYTES)
  throw Error("v102_csv_size_limit");
 const lines=parseRows(csv.replace(/^\uFEFF/,""));
 if(lines.length<2)throw Error("v102_empty_csv");
 const h=tableHeader(lines[0]);
 const items=[];const byBarcode=new Map();let invalid=0,conflicts=0;
 for(const cells of lines.slice(1)){
  if(cells.length!==lines[0].length){invalid++;continue;}
  const item_name_id=norm(cells[h.id]),barcode=norm(cells[h.barcode]);
  const name=norm(cells[h.name]),price_minor=validPrice(cells[h.price]);
  if(!item_name_id||item_name_id.length>80||!name||name.length>400||
    !BARCODE.test(barcode)||price_minor===null){invalid++;continue;}
  const item=Object.freeze({item_name_id,barcode,name,price_minor});
  items.push(item);
  const existing=byBarcode.get(barcode);
  if(existing===undefined)byBarcode.set(barcode,item);
  else if(existing!==null &&
    (existing.item_name_id!==item_name_id||existing.price_minor!==price_minor||
     existing.name!==name)){byBarcode.set(barcode,null);conflicts++;}
 }
 if(items.length===0)throw Error("v102_no_valid_items");
 const mod=typeof modifiedAt==="string"&&Number.isFinite(Date.parse(modifiedAt))?
  new Date(modifiedAt).toISOString():null;
 const status=Object.freeze({
  mode:"READ_ONLY_CSV_SNAPSHOT_NOT_LIVE_DB",write_enabled:false,
  checkout_enabled:false,stock_verified:false,
  source_filename:filename,source_modified_at:mod,
  source_sha256:sha256||createHash("sha256").update(csv).digest("hex"),
  scanned_rows:lines.length-1,valid_rows:items.length,invalid_rows:invalid,
  unique_barcodes:byBarcode.size,ambiguous_barcodes:
   [...byBarcode.values()].filter(v=>v===null).length,
  duplicate_price_or_name_conflicts:conflicts
 });
 return Object.freeze({
  status,
  // Local-only V104 reconciliation; this accessor is NOT exposed by the V102
  // HTTP handler. Never includes wholesale cost, stock or customer records.
  auditRows(){
   return Object.freeze(items.slice());
  },
  scan(code){
   const value=norm(code);
   if(!BARCODE.test(value))return {ok:false,error:"invalid_barcode"};
   if(!byBarcode.has(value))return {ok:false,error:"barcode_not_found"};
   const item=byBarcode.get(value);
   if(!item)return {ok:false,error:"ambiguous_barcode_refused"};
   return {ok:true,item};
  },
  search(q,limit=20){
   const term=norm(q).toLocaleLowerCase();
   if(term.length<2||term.length>80)throw Error("v102_invalid_search");
   if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw Error("v102_invalid_limit");
   const matches=[];
   for(const item of items){
    // Never present a different price for an ambiguous barcode.
    if(byBarcode.get(item.barcode)!==item)continue;
    if(item.name.toLocaleLowerCase().includes(term)||
       item.barcode.includes(term)||item.item_name_id.includes(term)){
      matches.push(item);if(matches.length>=limit)break;
    }
   }
   return matches;
  }
 });
}
export async function openMarketCSVV102(csvPath){
 if(typeof csvPath!=="string"||!isAbsolute(csvPath))
  throw Error("v102_absolute_csv_path_required");
 const flags=fsConstants.O_RDONLY|(fsConstants.O_NOFOLLOW||0);
 const handle=await open(csvPath,flags);
 try{
  const st=await handle.stat();
  if(!st.isFile()||st.size<20||st.size>MAX_BYTES)
   throw Error("v102_unapproved_file_size_or_type");
  const bytes=await handle.readFile();
  if(bytes.length>MAX_BYTES)throw Error("v102_csv_size_limit");
  const csv=bytes.toString("utf8");
  if(csv.includes("\uFFFD"))throw Error("v102_invalid_utf8_csv");
  return parseMarketCSVV102(csv,{
   modifiedAt:st.mtime.toISOString(),
   sha256:createHash("sha256").update(bytes).digest("hex"),
   filename:"market-catalog.csv" // no real Windows filename/path disclosure
  });
 }finally{await handle.close();}
}
