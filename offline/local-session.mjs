import { createHmac, timingSafeEqual } from "node:crypto";

// Development foundation only. Issuance MUST be gated by real local credential
// verification, revocation, lockout/rate limits, and device enrollment before deployment.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = new Set(["owner","manager","cashier"]);
const enc = data => Buffer.from(JSON.stringify(data)).toString("base64url");
export function makeLocalSessionCodec(secret, clock=()=>Date.now()) {
  if (typeof secret !== "string" || Buffer.byteLength(secret)<32) throw Error("session secret too short");
  const sign = value => createHmac("sha256",secret).update(value).digest("base64url");
  return {
    issue({user_id,store_id,role,session_version=1,db_proof},lifetimeMs=15*60_000) {
      if (!uuid.test(user_id) || !uuid.test(store_id) || !roles.has(role) || !Number.isSafeInteger(session_version) || session_version<1
        || !Number.isSafeInteger(lifetimeMs) || lifetimeMs<1000 || lifetimeMs>60*60_000)
        throw Error("invalid principal");
      if(db_proof!==undefined && (typeof db_proof!=="string"|| !/^[a-f0-9]{64}$/.test(db_proof)))
        throw Error("invalid_db_actor_proof");
      const payload=enc({v:2,user_id,store_id,role,sv:session_version,exp:clock()+lifetimeMs,...(db_proof?{db_proof}:{})});
      return payload+"."+sign(payload);
    },
    verify(token,requiredStore,allowedRoles=["owner","manager","cashier"]) {
      if (typeof token!=="string" || token.length>4096) return null;
      const parts=token.split(".");
      if (parts.length!==2 || !parts[0] || !parts[1]) return null;
      const expected=Buffer.from(sign(parts[0]));
      const given=Buffer.from(parts[1]);
      if (expected.length!==given.length || !timingSafeEqual(expected,given)) return null;
      try {
        const p=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
        if (p.v!==2 || !Number.isSafeInteger(p.sv) || p.sv<1 || !uuid.test(p.user_id) || !uuid.test(p.store_id)
          || !roles.has(p.role) || !allowedRoles.includes(p.role)
          || !Number.isSafeInteger(p.exp) || p.exp<=clock()
          || (requiredStore && p.store_id!==requiredStore)
          || (p.db_proof!==undefined && (typeof p.db_proof!=="string" || !/^[a-f0-9]{64}$/.test(p.db_proof)))) return null;
        return p;
      } catch {return null;}
    }
  };
}
