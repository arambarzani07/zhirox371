import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {createContext,runInContext,Script} from 'node:vm';
test('offline preview preserves replacement tokens in embedded source and route queries without corrupting scripts',()=>{
 execFileSync(process.execPath,['scripts/build-preview.mjs']);
 const html=readFileSync('preview.html','utf8'),outer=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
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
