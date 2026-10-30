// V47 PUBLIC PREVIEW CHECK: read-only. No password, login, payment, DB or printer operations.
// A green website is NOT evidence that the store's offline cashier can be used for sales.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const PUBLIC_ORIGIN = "https://zhirox371-source-preview.vercel.app";
export const routes = Object.freeze([
 {path:"/",need:["سوپەرمارکێتی کانی چنار","card-icons.js","ui-fixed-pc.css","const specs=["]},
 {path:"/operations.html",need:['id="login-form"',"auth-recovery.js"]},
 {path:"/workspace.html",need:['id="login-form"',"auth-recovery.js"]},
 {path:"/reset-password.html",need:['id="new-password-form"']},
 {path:"/ui-fixed-pc.css",need:["min-width: 1020px"]},
 {path:"/card-icons.js",need:["RetailCardIcons","cash-register"]},
 {path:"/config.js",need:["qcfmlyyzfykzszvtllrw","publishableKey"]}
]);

export function inspectRoute(path,status,body,location="") {
 if(status>=300&&status<400) return {path,ok:false,reason:"redirect_not_allowed"};
 if(status!==200) return {path,ok:false,reason:"http_"+String(status)};
 if(typeof body!=="string") return {path,ok:false,reason:"not_text"};
 const route=routes.find(r=>r.path===path);
 if(!route) return {path,ok:false,reason:"unknown_route"};
 if(!route.need.every(s=>body.includes(s))) return {path,ok:false,reason:"source_mismatch"};
 if(path==="/config.js" && (/sb_secret_/i.test(body)||/service_role\\s*[:=]\\s*['"]/i.test(body)))
   return {path,ok:false,reason:"forbidden_secret_material"};
 if(/http:\/\/localhost:3000(?:\/|['"]|$)/.test(location))
   return {path,ok:false,reason:"localhost_redirect"};
 return {path,ok:true,reason:"source_verified"};
}

export async function auditPublicPreview({origin=PUBLIC_ORIGIN,request=fetch}={}) {
 const url=new URL(origin);
 if(url.origin!==PUBLIC_ORIGIN || url.pathname!=="/" || url.search || url.hash)
   throw new Error("Refusing to probe any non-approved external or internal origin");
 const checks=[];
 for(const route of routes) {
   const target=new URL(route.path,url);
   try {
     const response=await request(target.href,{
       method:"GET",redirect:"manual",cache:"no-store",
       credentials:"omit",signal:AbortSignal.timeout(12000)
     });
     const body=response.status===200?await response.text():"";
     checks.push(inspectRoute(route.path,response.status,body,response.headers?.get("location")||""));
   }catch(error){
     checks.push({path:route.path,ok:false,reason:"unreachable"});
   }
 }
 return {
   project:"ZHIROX371",phase:"V47",release_status:"NO_GO",
   online_preview:checks.every(x=>x.ok)?"PASS":"FAIL",
   checked_origin:PUBLIC_ORIGIN,checks,
   not_verified:["Supabase Auth Site URL and redirect allowlist","actual user password recovery",
      "Windows installer signature and rollback","isolated LAN PostgreSQL cash checkout",
      "two physical registers and real scan/print","UPS outage and independent backup restore",
      "live data migration and permissions","bank settlement and mixed tender"],
   note:"Production URL is only a hosted source preview. NO_GO for real supermarket sales regardless of HTTP PASS."
 };
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await auditPublicPreview();
 console.log(JSON.stringify(report,null,2));
 if(report.online_preview!=="PASS") process.exitCode=1;
}
