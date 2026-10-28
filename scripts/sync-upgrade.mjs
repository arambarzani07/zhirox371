// Embed reviewed upgrade migrations in order, within the standalone transaction.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const start='-- BEGIN EMBEDDED V21 INTEGRITY',end='-- END EMBEDDED V21 INTEGRITY';
let source=readFileSync('db/v19_complete_production_upgrade.sql','utf8');
const bodies=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort().map(file=>readFileSync('supabase/migrations/'+file,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'').trim());
const block=start+'\n'+bodies.join('\n\n')+'\n'+end+'\n';
if(source.includes(start))source=source.slice(0,source.indexOf(start))+block+source.slice(source.indexOf(end)+end.length).replace(/^\n/,'');
else{const at=source.lastIndexOf('COMMIT;');if(at<0)throw new Error('Upgrade transaction missing');source=source.slice(0,at)+block+source.slice(at);}
writeFileSync('db/v19_complete_production_upgrade.sql',source);
console.log('Standalone upgrade embeds the exact ordered integrity migrations.');
