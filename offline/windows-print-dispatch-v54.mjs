// V54: one-shot Windows receipt spool submission, isolated LAB only.
// Does not mean printed: no automatic replay, no unsupervised printing.
// Never run on production, Supabase or an existing real store database.
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {dirname,join,resolve} from "node:path";
import {requireDisposablePostgres} from "./cloud-readiness-v50.mjs";
import {validId} from "./sync-wire-v27.mjs";
const script=resolve(dirname(fileURLToPath(import.meta.url)),"../windows/Spool-ZHIROX-Receipt-V54.ps1");
const numeric=(v,min=0n,max=9999999999999n)=>{
 const s=String(v);
 if(!/^(0|[1-9]\d{0,15})$/.test(s))throw Error("invalid_receipt_integer");
 const b=BigInt(s);if(b<min||b>max)throw Error("invalid_receipt_amount");
 return b;
};
export function validateV54Job(row){
 if(!row||!validId(row.job_id)||!validId(row.sale_id)||
    ![58,80].includes(Number(row.width_mm))||
    typeof row.store_name_snapshot!=="string"||
    row.store_name_snapshot.length<1||row.store_name_snapshot.length>120||
    !Array.isArray(row.lines)||row.lines.length<1||row.lines.length>25)
  throw Error("invalid_print_snapshot");
 const no=numeric(row.receipt_no,1n,9223372036854775807n);
 const total=numeric(row.total_minor);
 let sum=0n;
 const lines=row.lines.map((line,i)=>{
   if(!line||line.line_no!==i+1||
      !["unit","carton","scale"].includes(line.sale_mode)||
      typeof line.name!=="string"||line.name.trim().length===0||
      line.name.length>160||/[\u0000-\u001f\u007f]/.test(line.name))
     throw Error("invalid_receipt_line");
   const price=numeric(line.unit_price_minor);
   const amount=numeric(line.line_total_minor);
   const qty=numeric(line.scan_quantity,1n,100n);
   const stock=numeric(line.quantity_base_units,1n);
   if(line.sale_mode==="scale"&&qty!==1n)throw Error("invalid_weight_quantity");
   sum+=amount;
   if(sum>9999999999999n)throw Error("receipt_overflow");
   const quantity=line.sale_mode==="scale"?
      String(stock/1000n)+"."+String(stock%1000n).padStart(3,"0"):
      String(qty);
   return {
     line_no:i+1,name:line.name,sale_mode:line.sale_mode,
     quantity,price_iqd:String(price),total_iqd:String(amount)
   };
 });
 if(sum!==total)throw Error("receipt_total_mismatch");
 const at=new Date(row.issued_at);
 if(Number.isNaN(at.getTime()))throw Error("invalid_receipt_timestamp");
 return {
   store_name:row.store_name_snapshot,receipt_no:String(no),
   total_iqd:String(total),issued_at:at.toISOString(),
   paper_width_mm:Number(row.width_mm),lines
 };
}
export function checkV54PrinterLabEnv(env){
 if(env.ZHIROX_V54_PRINTER_LAB_ENABLED!=="true"||
   env.ZHIROX_V54_TEST_MODE!=="true"||
   env.ZHIROX_RELEASE_MODE==="official")throw Error("v54_hardware_trial_not_enabled");
 const storeId=env.ZHIROX_V54_STORE_ID,jobId=env.ZHIROX_V54_JOB_ID;
 const printerName=env.ZHIROX_V54_PRINTER_NAME;
 if(!validId(storeId)||!validId(jobId)||typeof printerName!=="string"||
    printerName.length<1||printerName.length>128||/[\u0000-\u001f\u007f]/.test(printerName))
    throw Error("v54_invalid_printer_identity");
 const databaseUrl=requireDisposablePostgres(env.ZHIROX_LOCAL_DB_URL);
 return {storeId,jobId,printerName,databaseUrl};
}
async function launchPowershell({printerName,width,receipt,preflightOnly=false}){
 const args=["-NoLogo","-NoProfile","-NonInteractive","-File",script,
   "-PrinterName",printerName,"-WidthMm",String(width)];
 if(preflightOnly)args.push("-CheckOnly");
 return new Promise((resolve,reject)=>{
   const ps=spawn("powershell.exe",args,{windowsHide:true,stdio:["pipe","pipe","pipe"],shell:false});
   let stdout="",stderr="";
   ps.stdout.on("data",x=>{stdout+=x.toString("utf8").slice(0,4096)});
   ps.stderr.on("data",x=>{stderr+=x.toString("utf8").slice(0,4096)});
   ps.on("error",reject);
   ps.on("close",code=>code===0?resolve():reject(Error("windows_spooler_refused")));
   ps.stdin.end(preflightOnly?"":JSON.stringify(receipt));
 });
}
export async function submitV54TestPrint({pool,storeId,jobId,printerName,spooler,
  platform=process.platform}){
 if(platform!=="win32"||typeof pool?.query!=="function"||
    !validId(storeId)||!validId(jobId)||!printerName||
    !spooler||typeof spooler.preflight!=="function"||typeof spooler.submit!=="function")
    throw Error("v54_unsafe_execution_context");
 // Printer and width checks before durable claim (cannot know width until reading
 // the already-verified, queued DB row); post-claim failures require manual review.
 await spooler.preflight(printerName);
 let claimed;
 const {rows}=await pool.query(
  "SELECT * FROM zhirox_local.claim_print_dispatch_v54($1::uuid,$2::uuid)",
  [storeId,jobId]);
 if(rows.length!==1)throw Error("v54_claim_missing");
 claimed=rows[0];
 let state="manual_review";
 try{
   const receipt=validateV54Job(claimed);
   await spooler.submit(printerName,receipt);
   state="submitted_to_windows";
 }finally{
   await pool.query(
     "SELECT zhirox_local.finish_print_dispatch_v54($1::uuid,$2::uuid,$3::text) AS ok",
     [storeId,jobId,state]);
 }
 return {job_id:jobId,submission_status:state,
   hardware_printed:false,requires_physical_confirmation:true,release_status:"NO_GO"};
}
export async function runV54WindowsPrintTrial({env=process.env}={}){
 const c=checkV54PrinterLabEnv(env);
 if(process.platform!=="win32")throw Error("v54_requires_windows");
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:c.databaseUrl,max:1,connectionTimeoutMillis:2000});
 const spooler={
   preflight:name=>launchPowershell({printerName:name,width:80,preflightOnly:true}),
   submit:(name,receipt)=>launchPowershell({printerName:name,width:receipt.paper_width_mm,receipt})
 };
 try{return await submitV54TestPrint({...c,pool,spooler});}
 finally{await pool.end();}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 runV54WindowsPrintTrial().then(r=>console.log(JSON.stringify(r))).catch(()=>{
   console.error("v54_trial_print_rejected_or_manual_review_required");
   process.exitCode=1;
 });
}
