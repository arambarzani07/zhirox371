import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=readFileSync(resolve(root,"card-icons.js"),"utf8");
const scope={window:{}};
runInNewContext(source,scope);
const icons=scope.window.RetailCardIcons;

test("Whatever icon set is chosen, each SVG is safe to embed",()=>{
 const ids=[...icons.main,...icons.sub.flatMap(x=>Array.from(x))];
 for(const id of new Set(ids)){
  const xml=icons.svg(id);
  assert.match(xml,/^<svg /,id);
  assert.match(xml,/aria-hidden="true"/,id);
  assert.match(xml,/<\/svg>$/,id);
  assert.doesNotMatch(xml,/(?:<script|\bonload\s*=|\bonclick\s*=|\bsrc\s*=\s*"https?:)/i,id);
 }
});

test("Local SVG bundle must not require third-party scripts or icon endpoints",()=>{
 assert.doesNotMatch(source,/(?:fetch\(|src="https?:|cdn\.|<img|import\s)/);
});
