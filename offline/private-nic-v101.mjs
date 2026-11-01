// V101: exact-NIC, allowlisted RFC1918 socket policy for disposable CI only.
// Never infer trusted peers from forwarded headers, DNS or a public interface.
import {networkInterfaces} from "node:os";
import {isIP} from "node:net";

export function isPrivateV101IPv4(value){
 if(isIP(value)!==4)return false;
 const octets=value.split(".").map(Number);
 return octets[0]===10||
  (octets[0]===172&&octets[1]>=16&&octets[1]<=31)||
  (octets[0]===192&&octets[1]===168);
}
export function localV101PrivateInterfaces(interfaces=networkInterfaces()){
 return Object.values(interfaces).flat().filter(x=>
  x?.family==="IPv4"&&!x.internal&&isPrivateV101IPv4(x.address))
  .map(x=>x.address);
}
export function createV101PrivateNICPolicy({bindAddress,allowedPeers,
 interfaces=networkInterfaces()}){
 if(!isPrivateV101IPv4(bindAddress)||
   !localV101PrivateInterfaces(interfaces).includes(bindAddress)||
   !Array.isArray(allowedPeers)||allowedPeers.length<1||
   allowedPeers.length>4||
   allowedPeers.some(ip=>!isPrivateV101IPv4(ip))||
   new Set(allowedPeers).size!==allowedPeers.length)
  throw Error("V101_exact_private_NIC_and_peer_allowlist_required");
 const peers=new Set(allowedPeers);
 return function privateNICCheck(req){
  const socket=req.socket;
  const remote=(socket.remoteAddress||"").replace(/^::ffff:/,"");
  // Node socket properties, not untrusted proxy or X-Forwarded-For headers.
  const host=bindAddress+":"+socket.localPort;
  return socket.encrypted===true&&socket.authorized===true&&
    socket.localAddress===bindAddress&&req.headers.host===host&&
    peers.has(remote);
 };
}
