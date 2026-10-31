import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

// Owner's PC design lock: this baseline is the current Home source including
// later explicitly accepted fixed header, 12+48 cards and distinct SVG icons.
// The immutable original HTML is kept as a fixture even though production
// mounts React. This preserves the historic design baseline byte-for-byte.
// React geometry is covered by structure and browser position checks.
// Update these source SHA-1s only after explicit owner design-unlock approval.
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const LOCKED_BLOBS={
  "tests/fixtures/owner_locked_home_v1.html": "c364336a84b2c92cf121d7682671b309eccd4b05",
  "index.html": "ba44208524868a80297790edba872ec4745622df",
  "ui-global.css": "14474a71940bfa79a25173623bcfbaf5387d3660",
  "ui-fixed-pc.css": "e55fc2ddbec2aa0e0e19d97c568592a6e6501a0c",
  "card-icons.css": "1c774c9d6f21221fb0972d88d3d4f303707f77a1",
  "card-icons.js": "b1b8f5b03c6585c7fd38fd91a22519fae4c7d5c5"
};
for(const [file,expected] of Object.entries(LOCKED_BLOBS)){
 test("Owner-locked PC Home source remains byte-for-byte unchanged: "+file,()=>{
  const contents=readFileSync(resolve(root,file));
  const gitBlob=createHash("sha1").update("blob "+contents.length+"\0").update(contents).digest("hex");
  assert.equal(gitBlob,expected,"Unapproved design edit: "+file+"; obtain explicit owner design unlock");
 });
}
test("Full system Home retains fixed 12 cards, 48 subcards and their trusted icon catalog",()=>{
 const home=readFileSync(resolve(root,"tests/fixtures/owner_locked_home_v1.html"),"utf8");
 const react=readFileSync(resolve(root,"src/components/HomeScreen.tsx"),"utf8");
 const entry=readFileSync(resolve(root,"index.html"),"utf8");
 const icons=readFileSync(resolve(root,"card-icons.js"),"utf8");
 const fixed=readFileSync(resolve(root,"ui-fixed-pc.css"),"utf8");
 assert.match(home,/for\(let r=0;r<3;r\+\+\)/);
 assert.match(home,/for\(let c=0;c<4;c\+\+\)/);
 assert.match(home,/s\[4\]\.forEach\(\(label,j\)=>/);
 assert.match(icons,/main\.length!==12\|\|sub\.length!==12/);
 assert.match(icons,/new Set\(expected\)\.size!==60/);
 assert.match(fixed,/min-width: 1020px/);
 assert.match(home,/class="market-banner">سوپەرمارکێتی کانی چنار/);
 assert.match(entry,/<div id="root"><\/div>/,"React must mount without modifying the owner reference");
 assert.match(react,/MODULE_SPECS\.slice\(rowIndex \* 4, rowIndex \* 4 \+ 4\)/);
 assert.match(react,/activeModule\.submodules\.map\(/);
 assert.match(react,/zIndex: isRowOpen \? 20 : 1/);
 assert.match(react,/top: 'calc\(100% \+ 2px\)'/);
 assert.doesNotMatch(react,/rowIndex \* 184/,"No hard-coded drawer position or row height");
});
