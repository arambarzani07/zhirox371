import test from "node:test";
import assert from "node:assert/strict";
import {validateV54Job,checkV54PrinterLabEnv,submitV54TestPrint} from "../windows-print-dispatch-v54.mjs";

const store="10000000-0000-0000-0000-000000000054";
const job="50000000-0000-0000-0000-000000000054";
const sale="40000000-0000-0000-0000-000000000054";
const receipt={
  job_id:job,sale_id:sale,width_mm:80,receipt_no:"41",total_minor:"22000",
  store_name_snapshot:"سوپەرمارکێتی کانی چنار",issued_at:"2026-10-30T14:12:00.000Z",
  lines:[{line_no:1,name:"تەماتە",sale_mode:"scale",scan_quantity:1,
    quantity_base_units:2000,unit_price_minor:11000,line_total_minor:22000}]
};
const cfg={ZHIROX_V54_PRINTER_LAB_ENABLED:"true",ZHIROX_V54_TEST_MODE:"true",
 ZHIROX_V54_STORE_ID:store,ZHIROX_V54_JOB_ID:job,ZHIROX_V54_PRINTER_NAME:"TEST_80MM",
 ZHIROX_LOCAL_DB_URL:"postgresql://demo:demo@127.0.0.1:5432/zhirox_disposable_test"};
test("V54 verifies original PostgreSQL receipt totals, Arabic shaping source and scale grams",()=>{
 const printable=validateV54Job(receipt);
 assert.equal(printable.total_iqd,"22000");
 assert.equal(printable.lines[0].quantity,"2.000");
 assert.match(printable.store_name,/کانی چنار/);
 assert.equal(printable.paper_width_mm,80);
 for(const bad of [
  {...receipt,total_minor:"21000"},
  {...receipt,lines:[{...receipt.lines[0],name:"FAIL\ninjection"}]},
  {...receipt,lines:[{...receipt.lines[0],unit_price_minor:-1}]},
  {...receipt,width_mm:99},
  {...receipt,lines:[]}
 ])assert.throws(()=>validateV54Job(bad));
});
test("V54 blocks production databases, wrong printers, opt-out and live official release",()=>{
 assert.equal(checkV54PrinterLabEnv(cfg).printerName,"TEST_80MM");
 for(const bad of [
  {ZHIROX_V54_PRINTER_LAB_ENABLED:"false"},
  {ZHIROX_V54_TEST_MODE:"false"},{ZHIROX_RELEASE_MODE:"official"},
  {ZHIROX_LOCAL_DB_URL:"postgres://prod:pw@live.supabase.co:5432/zhirox_disposable_test"},
  {ZHIROX_LOCAL_DB_URL:"postgres://demo:pw@127.0.0.1:5432/zhirox_market"},
  {ZHIROX_V54_PRINTER_NAME:"bad\ncommand"},
  {ZHIROX_V54_JOB_ID:"not-a-uuid"}
 ])assert.throws(()=>checkV54PrinterLabEnv({...cfg,...bad}));
});
function mockDB(data=receipt){
 const log=[];
 return {
  log,
  query:async(sql,args)=>{
   log.push({sql,args});
   if(sql.includes("claim_print_dispatch_v54"))return {rows:[data]};
   if(sql.includes("finish_print_dispatch_v54"))return {rows:[{ok:true}]};
   throw Error("unexpected_sql");
  }
 };
}
test("V54 submits once to spooler but NEVER asserts hardware printed",async()=>{
 const db=mockDB(),events=[];
 const r=await submitV54TestPrint({pool:db,storeId:store,jobId:job,printerName:"TEST_80MM",
  platform:"win32",spooler:{
   preflight:async()=>events.push("preflight"),
   submit:async(name,receipt)=>{events.push("submitted");assert.equal(receipt.total_iqd,"22000");}
  }});
 assert.deepEqual(events,["preflight","submitted"]);
 assert.deepEqual(db.log.map(x=>x.sql.includes("claim_print_dispatch_v54")?"claim":"finish"),["claim","finish"]);
 assert.equal(db.log[1].args[2],"submitted_to_windows");
 assert.equal(r.hardware_printed,false);
 assert.equal(r.requires_physical_confirmation,true);
 assert.equal(r.release_status,"NO_GO");
});
test("V54 printer offline before claim never marks job or touches PostgreSQL",async()=>{
 const db=mockDB();
 await assert.rejects(submitV54TestPrint({pool:db,storeId:store,jobId:job,
  printerName:"unavailable",platform:"win32",spooler:{
   preflight:async()=>{throw Error("printer_unavailable")},submit:async()=>{}}
 }));
 assert.equal(db.log.length,0);
});
test("V54 ambiguous driver failure after claim fences sale for MANUAL REVIEW and never retries",async()=>{
 const db=mockDB();
 await assert.rejects(submitV54TestPrint({pool:db,storeId:store,jobId:job,
   printerName:"TEST_80MM",platform:"win32",spooler:{
    preflight:async()=>{},submit:async()=>{throw Error("ambiguous_spool_ack")}}}));
 assert.equal(db.log.length,2);
 assert.equal(db.log[1].args[2],"manual_review");
});
test("V54 malformed receipt is fenced without being sent to Windows",async()=>{
 const db=mockDB({...receipt,total_minor:"1"});let submitted=false;
 await assert.rejects(submitV54TestPrint({pool:db,storeId:store,jobId:job,
  printerName:"TEST_80MM",platform:"win32",
  spooler:{preflight:async()=>{},submit:async()=>{submitted=true}}}));
 assert.equal(submitted,false);
 assert.equal(db.log[1].args[2],"manual_review");
});
test("V54 prevents print on non-Windows and refuses an unconfirmed final DB acknowledgement",async()=>{
 const db=mockDB();
 await assert.rejects(submitV54TestPrint({pool:db,storeId:store,jobId:job,
  printerName:"TEST_80MM",platform:"linux",spooler:{preflight:async()=>{},submit:async()=>{}}}));
 assert.equal(db.log.length,0);
 db.query=async sql=>sql.includes("finish_print_dispatch_v54")?{rows:[{ok:false}]}:{rows:[receipt]};
 await assert.rejects(submitV54TestPrint({pool:db,storeId:store,jobId:job,
  printerName:"TEST_80MM",platform:"win32",spooler:{preflight:async()=>{},submit:async()=>{}}}),
 /v54_dispatch_state_not_committed/);
});
