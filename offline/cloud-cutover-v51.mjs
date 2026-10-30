// V51 Cloud cutover preflight: config inspection only; no HTTP requests, no DB writes.
// A hostname string cannot prove DNS/IP trust; network policy is a separate GO-LIVE gate.
import {validId} from "./sync-wire-v27.mjs";

const PUBLIC_HOST=/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const BLOCKED_HOSTS=new Set(["localhost","localhost.localdomain","metadata.google.internal",
  "169.254.169.254","0.0.0.0","127.0.0.1","::1"]);
const BANNED_SUFFIX=/(?:^|\.)(?:local|internal|localhost|test|invalid)$/i;

export function validateV51ProposedCloudEndpoint(value,expectedHost){
 if(typeof value!=="string"||typeof expectedHost!=="string")throw Error("v51_missing_cloud_target");
 // The operator-entered host and the URL must be an *exact* fixed DNS name.
 // No DNS lookup or network access happens here.
 if(!PUBLIC_HOST.test(expectedHost)||BLOCKED_HOSTS.has(expectedHost)||
    BANNED_SUFFIX.test(expectedHost)||expectedHost!==expectedHost.toLowerCase())
   throw Error("v51_unapproved_cloud_host");
 let u;
 try{u=new URL(value);}catch{throw Error("v51_invalid_cloud_endpoint")}
 if(u.protocol!=="https:"||u.hostname!==expectedHost||
    u.username||u.password||u.port||u.pathname!=="/v27/events"||
    u.search||u.hash||u.origin!=="https://"+expectedHost||
    value!==u.href||BLOCKED_HOSTS.has(u.hostname)||BANNED_SUFFIX.test(u.hostname))
   throw Error("v51_cloud_target_mismatch");
 // Reject numeric IPv4, IPv6 and IP-like DNS forms. DNS rebinding remains a
 // separate firewall/egress-policy requirement, and is NOT waived by this test.
 if(/^[\d.]+$/.test(u.hostname)||u.hostname.includes(":"))
   throw Error("v51_ip_address_disallowed");
 return Object.freeze({hostname:u.hostname,endpoint:u.href});
}
export function inspectV51CloudCutover(input){
 if(!input||typeof input!=="object")throw Error("v51_invalid_cutover_record");
 const {storeId,receiverUrl,approvedHostname,evidence}=input;
 if(!validId(storeId))throw Error("v51_invalid_store_id");
 const target=validateV51ProposedCloudEndpoint(receiverUrl,approvedHostname);
 if(!evidence||typeof evidence!=="object")throw Error("v51_missing_evidence");
 const requirements=[
   ["receiver_deployed","Owner-approved cloud receiver with HTTPS and restricted access"],
   ["network_egress_review","DNS rebinding and private-IP egress denied at network layer"],
   ["receiver_security_review","Per-store HMAC rotation, replay protection, rate limits and logging reviewed"],
   ["cloud_database_isolation","Least-privilege cloud PostgreSQL and tenant segregation verified"],
   ["event_id_reconciliation","Full event-ID parity and mismatch/alert handling verified"],
   ["backup_restore","Independent encrypted cloud and local backup restore tested"],
   ["windows_service_review","Signed installer, protected background service and rollback verified"],
   ["physical_checkout","Real scanner, printer, LAN/WAN outage and two-register acceptance passed"],
   ["owner_signoff","Signed owner acceptance with documented evidence"]
 ];
 const checks=requirements.map(([key,label])=>({
    key,description:label,verified:evidence[key]===true
 }));
 const missing=checks.filter(x=>!x.verified).map(x=>x.key);
 return {
   project:"ZHIROX371",phase:"V51",mode:"REVIEW_ONLY",
   receiver_host:target.hostname,scope:"sales_events_only",
   network_contacted:false,local_db_modified:false,cloud_db_modified:false,
   checks,missing,all_checked:missing.length===0,
   release_status:"NO_GO",
   warning:"Operator checkboxes are declarations, NOT independent verification. No production deployment or cloud transport is authorized by this report."
 };
}
