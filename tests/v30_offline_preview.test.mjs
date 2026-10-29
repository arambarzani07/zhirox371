import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createContext,runInContext,runInNewContext,Script} from 'node:vm';
test('offline preview preserves replacement tokens in embedded source and route queries without corrupting scripts',()=>{
 execFileSync(process.execPath,['scripts/build-preview.mjs']);
 const html=readFileSync('preview.html','utf8');assert.match(html,/sandbox="[^"]*allow-downloads/);const outer=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
 const frame={srcdoc:''},context=createContext({document:{getElementById:()=>frame},URL,addEventListener(){}});runInContext(outer,context);
 const pages=JSON.parse(runInContext('JSON.stringify(pages)',context));assert.equal(Object.keys(pages).length,9);
 for(const [name,page] of Object.entries(pages)){
  assert.ok(page.includes("new RegExp('^'+re+'$','isu')"),name+' must retain the source dollar-suffix string');
  for(const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
   if(!match[1].includes('type="module"'))assert.doesNotThrow(()=>new Script(match[2]),name+' inline script must compile');
  }
 }
 const target="operations.html?q=$&$'",search=new URL(target,'https://offline.invalid/').search;
 runInContext('navigate('+JSON.stringify(target)+')',context);
 assert.ok(frame.srcdoc.includes('window.__previewSearch='+JSON.stringify(search)+';'));
 assert.doesNotThrow(()=>new Script(frame.srcdoc.match(/<script>([\s\S]*?)<\/script>/)[1]));
});
test('offline preview exports CSV through the owning page and ignores messages from other frames',()=>{
 const html=readFileSync('preview.html','utf8'),outer=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
 let handler,clicked=0,body;const frame={contentWindow:{}},url=class extends URL {static createObjectURL(blob){body=blob.parts[0];return 'blob:qa';}static revokeObjectURL(){}};
 const doc={getElementById:()=>frame,body:{append(){}},createElement:()=>({click(){clicked++;},remove(){}})};
 runInNewContext(outer,{document:doc,URL:url,Blob:class{constructor(parts){this.parts=parts;}},addEventListener:(_name,fn)=>handler=fn,setTimeout:fn=>fn()});
 const data={type:'retail-download',filename:'stock_page.csv',text:'\uFEFFunit,kg\r\n1,0.5'};
 handler({source:{},data});assert.equal(clicked,0);handler({source:frame.contentWindow,data});assert.equal(clicked,1);assert.equal(body,data.text);
 handler({source:frame.contentWindow,data:{...data,filename:'not-a-csv.exe'}});assert.equal(clicked,1);
});
