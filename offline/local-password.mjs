import {randomBytes, scrypt as scryptCallback, timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
const scrypt=promisify(scryptCallback);
export async function hashLocalPassword(password){
 if(typeof password!=="string" || password.length<12 || Buffer.byteLength(password)>1024) throw Error("invalid password");
 const salt=randomBytes(16);
 const key=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024});
 return "scrypt-v1:"+salt.toString("base64url")+":"+key.toString("base64url");
}
export async function verifyLocalPassword(password,stored){
 if(typeof password!=="string" || Buffer.byteLength(password)>1024 || typeof stored!=="string") return false;
 const parts=stored.split(":");
 if(parts.length!==3 || parts[0]!=="scrypt-v1") return false;
 try {
   const salt=Buffer.from(parts[1],"base64url"),expected=Buffer.from(parts[2],"base64url");
   if(salt.length!==16 || expected.length!==64) return false;
   const actual=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024});
   return timingSafeEqual(actual,expected);
 }catch{return false;}
}
