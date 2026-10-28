import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('preview server honors its port, serves UI and rejects malformed/source paths',async()=>{
 const child=spawn(process.execPath,['server.mjs','--port','0'],{stdio:['ignore','pipe','pipe']});
 try{
  let output='';const origin=await new Promise((resolve,reject)=>{
   child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/0\.0\.0\.0:(\d+)/);if(match)resolve('http://127.0.0.1:'+match[1]);});
   child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)));
  });
  assert.equal((await fetch(origin+'/')).status,200);
  for(const path of ['/db/v19_complete_production_upgrade.sql','/.git/config','/node_modules/@electric-sql/pglite/package.json','/package-lock.json'])assert.equal((await fetch(origin+path)).status,404);
  assert.equal((await fetch(origin+'/%E0%A4%A')).status,400);
  assert.equal((await fetch(origin+'/operations.html')).status,200);
 }finally{child.kill();await once(child,'exit');}
});
