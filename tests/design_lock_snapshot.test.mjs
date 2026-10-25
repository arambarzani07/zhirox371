import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const working=readFileSync(resolve(root,"index.html"),"utf8");
function snapshot(){
 return execFileSync("git",["show","origin/design-lock/pc-home-v1:index.html"],{cwd:root,encoding:"utf8"});
}
const section=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start))+end.length);
test("approved Home styles are unchanged from frozen Git branch",()=>{
 const locked=snapshot();
 assert.equal(section(working,"<style>","</style>"),section(locked,"<style>","</style>"));
});
test("all 12 cards, their order and subcard definitions remain unchanged",()=>{
 const locked=snapshot();
 assert.equal(section(working,"const specs=[","];"),section(locked,"const specs=[","];"));
});
test("Home's PC baseline viewport and RTL remain locked",()=>{
 assert.match(working,/<html lang="ckb" dir="rtl">/);
 assert.match(working,/min-width:1020px/);
 assert.match(working,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(working,/for\(let c=0;c<4;c\+\+\)/);
});
