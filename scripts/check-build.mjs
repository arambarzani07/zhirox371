import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {Script} from 'node:vm';
for(const file of readdirSync('.').filter(f=>/\.(?:js|mjs)$/.test(f))){
 const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
for(const file of readdirSync('.').filter(f=>f.endsWith('.html')&&f!=='preview.html')){
 const html=readFileSync(file,'utf8');
 for(const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)){
  if(!existsSync(match[1]))throw new Error(`${file}: missing local asset ${match[1]}`);
 }
 for(const match of html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/g)){
  if(!match[1].includes('src=')&&!match[1].includes('type="module"'))new Script(match[2],{filename:file});
 }
}
console.log('JavaScript syntax, inline scripts and local page assets verified.');
