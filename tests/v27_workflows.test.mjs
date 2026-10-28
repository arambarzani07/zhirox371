import {test} from 'node:test';import assert from 'node:assert/strict';import '../workflow-records.js';
const store='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',actor='11111111-1111-4111-8111-111111111111',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function storage(){const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};}
test('workflow failed replies preserve the request ID and never acknowledge a missing/wrong record',async()=>{
 const calls=[];let fail=true;const api=RetailWorkflowV27.create({store,actor,db:{rpc:async(name,args)=>{calls.push(args);if(fail)return {error:Error('offline'),data:null};return {error:null,data:{record:{id:args.p_id,store_id:store,topic:'attendance',version:1,data:{name:'Confirmed'}}}};}}});
 await assert.rejects(()=>api.write('attendance',id,0,'save',{name:'Draft'}));fail=false;await api.write('attendance',id,0,'save',{name:'Draft'});assert.equal(calls[0].p_request,calls[1].p_request);
 const wrong=RetailWorkflowV27.create({store,actor,db:{rpc:async()=>({data:{record:{id:'wrong'}}})}});await assert.rejects(()=>wrong.write('attendance',id,0,'save',{}));
});
test('workflow draft identity survives reload without storing staff data and is scoped by actor/store/topic',()=>{
 const s=storage(),db={};const a=RetailWorkflowV27.create({store,actor,storage:s,db});const first=a.draft('attendance');assert.equal(RetailWorkflowV27.create({store,actor,storage:s,db}).draft('attendance'),first);assert.notEqual(a.draft('workhours'),first);assert.notEqual(RetailWorkflowV27.create({store:'other',actor,storage:s,db}).draft('attendance'),first);assert.notEqual(a.draft('attendance',true),first);
});
test('workflow lists reject a cross-store response and have no local-cache fallback',async()=>{
 const bad=RetailWorkflowV27.create({store,actor,db:{rpc:async()=>({data:{rows:[{id,store_id:'other',topic:'attendance',version:1,data:{}}],total:1}})}});await assert.rejects(()=>bad.list('attendance'));
 const denied=RetailWorkflowV27.create({store,actor,db:{rpc:async()=>({data:null,error:Error('permission denied')})}});await assert.rejects(()=>denied.list('attendance'));
});
