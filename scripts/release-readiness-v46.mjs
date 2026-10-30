// V46 read-only release advisory. Never treats green CI or a Vercel URL
// as evidence of real Windows/LAN checkout acceptance.
import {access,readFile} from "node:fs/promises";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

export const labRequirements=Object.freeze([
 ["two_cashiers_cash_only","offline/tests/023_v46_airgap_cash_only_acceptance.sql"],
 ["current_schema_disposable_backup","offline/tests/024_v46_disposable_restore_seed.sql"],
 ["restored_cash_receipts_stock","offline/tests/025_v46_disposable_restore_verify.sql"],
 ["byte_locked_owner_home","tests/owner_locked_home_sha.test.mjs"],
 ["offline_postgres_ci",".github/workflows/offline-foundation.yml"],
 ["explicit_official_build_block","vite.config.ts"],
 ["bank_integrity_audit","offline/migrations/022_financial_integrity_audit_v45.sql"]
]);
export const fieldBlockers=Object.freeze([
 {id:"physical-windows-installer",need:"Signed Windows installer and clean rollback on the target PC"},
 {id:"physical-scanner-scale",need:"Witnessed HID scan, carton, weighed-prefix-27 and real inventory with 2 devices"},
 {id:"physical-printer",need:"Real 58/80mm thermal receipt printing, power-cut recovery and no duplicate print"},
 {id:"lan-isolation",need:"Two registered cashier PCs; no internet and disconnected/cloud-blocked cash sales, inventory and shifts"},
 {id:"live-db-least-privilege",need:"Real local PostgreSQL roles, least-privilege, firewall, audited backup credentials and independent security review"},
 {id:"real-backup-restore",need:"UPS/power-cut trial and a successful encrypted restore onto a different physical PC; owner-accepted RPO/RTO"},
 {id:"auth-and-operations",need:"Owner/cashier login, roles, opening/closing shifts, returns and full stock/price checks physically accepted"},
 {id:"provider-mixed-tender",need:"Verified bank/acquirer settlement and reversal/refund integration before allowing noncash sales"},
 {id:"live-system-go-no-go",need:"Owner-signed field acceptance; rehearsal cannot self-certify GO"}
]);
export async function assessReleaseV46(root){
 const lab=[];
 for(const [id,path] of labRequirements){
  let found=true;
  try{await access(join(root,path));}catch{found=false;}
  lab.push({id,file:path,present:found});
 }
 const [app,vite]=await Promise.all([
   readFile(join(root,"src/App.tsx"),"utf8").catch(()=>""),
   readFile(join(root,"vite.config.ts"),"utf8").catch(()=>"")
 ]);
 return {
  project:"ZHIROX371",phase:"V46",status:"NO_GO",
  mode:"disposable PostgreSQL CI rehearsal; NO actual Windows hardware, bank or live database",
  lab_files:lab,
  repo_configuration:{
   react_demo_still_reachable:/<CashierPos\s*\/>/.test(app),
   official_vite_build_refused:/ZHIROX_RELEASE_MODE/.test(vite)&&
     /official/.test(vite)&&/throw Error/.test(vite),
   missing_lab_artifacts:lab.filter(x=>!x.present).map(x=>x.file)
  },
  blockers:[...fieldBlockers],
  guidance:"Do not run on production. Green CI proves scripted logic, not operational safety. Manual signed evidence and successful physical trials are required before GO_LIVE."
 };
}
const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
 const report=await assessReleaseV46(root);
 if(process.argv.includes("--json"))console.log(JSON.stringify(report,null,2));
 else{
  console.log(report.project+" "+report.phase+" "+report.status);
  report.blockers.forEach(x=>console.log("- "+x.id+": "+x.need));
 }
 if(report.repo_configuration.missing_lab_artifacts.length)process.exitCode=1;
}
