import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('user-local install produces exactly one auto-discovered Pi entrypoint and no credentials',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-install-test-'));
 try{
  const x=spawnSync(process.execPath,['pi/install.mjs','--dest',dir,'--skip-deps'],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(x.status,0,x.stderr);
  assert.deepEqual(fs.readdirSync(dir).sort(),['chatgpt-core.mjs','index.ts','package.json','windows-runner.mjs']);
  assert.ok(fs.readFileSync(path.join(dir,'index.ts'),'utf8').includes("name:'ask_chatgpt'"));
  assert.equal(fs.statSync(path.join(dir,'index.ts')).mode&0o777,0o600);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).dependencies.typebox,'1.3.7');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
