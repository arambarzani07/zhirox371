// V35 release-readiness report. Read-only: no live PostgreSQL, printer,
// network or Supabase connection. A green CI is NOT a physical acceptance.
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,dirname,join} from "node:path";
export function evaluateReleaseV35({app,localMode,vite,printApi}){
 const blockers=[];
 const add=(id,reason,file)=>blockers.push({id,reason,file});
 if(/<CashierPos\s*\/>/.test(app))
  add("react-demo-route","Production React still renders the simulated cashier","src/App.tsx");
 if(/import\.meta\.env\.DEV/.test(localMode))
  add("local-cashier-dev-only","Authenticated local cashier is restricted to dev/test","src/localCashierModeV32.ts");
 if(/VITE_ZHIROX_RELEASE_MODE==='official'/.test(vite))
  add("official-build-blocked","Explicit official build is intentionally blocked","vite.config.ts");
 if(/not installed/.test(printApi)||!/createLocalPrintQueueHandlerV35/.test(printApi))
  add("print-queue-only","Durable jobs exist but no verified hardware printing worker exists","offline/local-print-queue-v35.mjs");
 // These physical and operational checks cannot be established by repository CI.
 add("windows-device-certification","No independently verified Windows + barcode scanner + 58/80mm printer acceptance",null);
 add("multi-pc-outage-test","No physically witnessed two-cashier LAN / Internet / power-cut acceptance",null);
 add("recovery-drill","No approved real-PC UPS, WAL durability, disk backup retention and restore/RPO-RTO evidence",null);
 add("finance-permissions","Returns, debt, split tenders, shifts and role permissions need production backend acceptance",null);
 add("local-security-review","Least-privilege SQL, device enrollment, firewall and key lifecycle need rollout approval",null);
 return {project:"ZHIROX371",phase:"V35",status:blockers.length?"NO_GO":"GO",
  explanation:"Read-only advisory audit; manual device certification remains mandatory",
  blockers};
}
export async function assessReleaseV35(root){
 const paths={app:"src/App.tsx",localMode:"src/localCashierModeV32.ts",
  vite:"vite.config.ts",printApi:"offline/local-print-queue-v35.mjs"};
 const data={};
 for(const [key,path] of Object.entries(paths)){
  try{data[key]=await readFile(join(root,path),"utf8");}
  catch{data[key]=""; }
 }
 return evaluateReleaseV35(data);
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 const report=await assessReleaseV35(root);
 if(process.argv.includes("--json"))console.log(JSON.stringify(report,null,2));
 else{
  console.log("ZHIROX371 "+report.phase+": "+report.status+" — NOT APPROVED FOR REAL SALES");
  report.blockers.forEach((p,i)=>console.log((i+1)+". "+p.id+": "+p.reason));
 }
 // No-Go is the correct result for an unfinished project, not a CI error.
 // A future release pipeline MUST require an independent acceptance decision.
}
