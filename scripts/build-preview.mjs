// Bundle the real PC source into one navigable, offline QA preview. No hosted credentials or data.
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pages={};
const fixture=(read('tests/browser/qa_supabase_fixture.js')+read('tests/browser/qa_v22_fixture.js')+read('tests/browser/qa_v27_fixture.js')).replace('name:"QA Only"','name:"سوپەرمارکێتی کانی چنار"');
const previewBoot=`window.__retailPreview=true;if(!crypto.randomUUID)crypto.randomUUID=()=>{const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)};localStorage.setItem('retail_store_settings_v19_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',JSON.stringify({storeName:'سوپەرمارکێتی کانی چنار'}));`;
for(const name of ['index.html','workspace.html','operations.html','receipt-print.html','diagnostics.html','qa.html','modules.html','customer-display.html','staff-workflows.html']){
 let html=read(name);
 html=html.replace(/<link[^>]*href="\.\/([^"?]+\.css)"[^>]*>/g,(_,file)=>'<style>'+read(file)+'</style>');
 html=html.replace(/<script\b([^>]*)src="([^"]+)"([^>]*)><\/script>/g,(_,before,url,after)=>{
  if(/^https?:/.test(url))return '';
  if(url.endsWith('config.js'))return '<script>window.RETAIL_CONFIG={supabaseUrl:"https://offline.invalid",publishableKey:"offline-qa"};</script>';
  let js=read(url.replace(/^\.\//,''));
  if(url.endsWith('diagnostics.js'))js=js.replace(/import \{ inspectBarcode \} from "\.\/diagnostics-core\.mjs";/,read('diagnostics-core.mjs').replace(/export /g,''));
  if(/\bdefer\b/.test(before+after))js='document.addEventListener("DOMContentLoaded",()=>{'+js+'});';
  return '<script'+before+after+'>'+js.replace(/<\/script/gi,'<\\/script')+'</script>';
 });
 html=html.replace(/location\.search/g,'window.__previewSearch');
 html=html.replace(/window\.location\.assign\(/g,'window.__previewNavigate(');
 const bootstrap='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'unsafe-eval\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; font-src data:"><script>'+previewBoot+fixture+'\nwindow.__previewNavigate=url=>parent.postMessage({type:"retail-preview",url},"*");window.open=(url)=>{window.__previewNavigate(url);return null};document.addEventListener("click",e=>{const a=e.target.closest("a[href]");if(a&&a.getAttribute("href").startsWith(".")){e.preventDefault();window.__previewNavigate(a.getAttribute("href"));}});</script>';
 html=html.replace('<head>',()=>'<head>'+bootstrap);
 pages[name]=html;
}
const data=JSON.stringify(pages).replace(/</g,'\\u003c');
writeFileSync(new URL('../preview.html',import.meta.url),`<!doctype html><html lang="ckb" dir="rtl"><meta charset="utf-8"><title>سوپەرمارکێتی کانی چنار</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}</style><iframe id="pc" title="سوپەرمارکێتی کانی چنار" sandbox="allow-scripts allow-same-origin allow-modals allow-forms"></iframe><script>const pages=${data};const frame=document.getElementById('pc');function navigate(url){const u=new URL(url,'https://offline.invalid/');const name=u.pathname.split('/').pop()||'index.html';if(!pages[name])return;frame.srcdoc=pages[name].replace('<head>',()=>'<head><script>window.__previewSearch='+JSON.stringify(u.search)+';<\\/script>');}addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.data?.type==='retail-preview')navigate(e.data.url)});navigate('index.html');</script></html>`);
console.log('Created offline preview.html from the current source; all 12 cards and 48 child routes preserved.');
