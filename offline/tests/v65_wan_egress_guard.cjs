// V65 ephemeral test-process WAN isolation. Not an OS firewall or real unplug.
// Loaded only into Node cash test; PostgreSQL + HTTPS must stay on 127.0.0.1.
// Throw before Node resolves or connects to ANY external endpoint.
"use strict";
const net=require("node:net");
const original=net.Socket.prototype.connect;
const loopback=new Set(["127.0.0.1","::1","localhost"]);
net.Socket.prototype.connect=function(...args){
 const first=args[0];
 let host="";
 if(first&&typeof first==="object"){
  if(first.path)throw Error("V65_WAN_DISCONNECTED: unix path not approved");
  host=String(first.host??first.hostname??"localhost");
 }else if(typeof first==="number"){
  host=typeof args[1]==="string"?args[1]:"localhost";
 }else if(typeof first==="string"){
  throw Error("V65_WAN_DISCONNECTED: unix path not approved");
 }else{
  throw Error("V65_WAN_DISCONNECTED: unknown target");
 }
 if(!loopback.has(host))throw Error("V65_WAN_DISCONNECTED: external network forbidden");
 return original.apply(this,args);
};
