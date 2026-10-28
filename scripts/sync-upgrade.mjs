// Keep the standalone upgrade and Supabase migration on exactly the same integrity code.
import {readFileSync,writeFileSync} from 'node:fs';
const migrationPath='supabase/migrations/20261028045514_transaction_integrity.sql';
const body=readFileSync(migrationPath,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'').trim();
const start='-- BEGIN EMBEDDED V21 INTEGRITY';const end='-- END EMBEDDED V21 INTEGRITY';
let source=readFileSync('db/v19_complete_production_upgrade.sql','utf8');
const block=start+'\n'+body+'\n'+end+'\n';
if(source.includes(start))source=source.slice(0,source.indexOf(start))+block+source.slice(source.indexOf(end)+end.length).replace(/^\n/,'');
else{const at=source.lastIndexOf('COMMIT;');if(at<0)throw new Error('Upgrade transaction missing');source=source.slice(0,at)+block+source.slice(at);}
writeFileSync('db/v19_complete_production_upgrade.sql',source);
console.log('Standalone upgrade embeds the exact integrity migration in its transaction.');
