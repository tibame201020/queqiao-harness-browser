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
  assert.deepEqual(fs.readdirSync(dir).sort(),['chatgpt-core.mjs','commands.mjs','index.ts','orca-cli.mjs','package.json','web-ask-core.mjs','web-providers.mjs']);
  assert.ok(fs.readFileSync(path.join(dir,'index.ts'),'utf8').includes("name:`ask_${provider}`"));
  assert.ok(fs.readFileSync(path.join(dir,'commands.mjs'),'utf8').includes("registerCommand"));
  // Windows fs.chmod has no POSIX 0600 semantics; native user-profile ACLs apply.
  if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'index.ts')).mode&0o777,0o600);
  else assert.equal(fs.statSync(path.join(dir,'index.ts')).isFile(),true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).dependencies.typebox,'1.3.7');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('installer removes only the previously installed legacy Browser Harness Pi module',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pi-orca-migrate-test-'));
 try{
  const stale=path.join(dir,'windows-runner.mjs');
  fs.writeFileSync(stale,'// WSL transport to the already installed Windows Browser Harness Runner.\nexport function createWindowsHarnessTransport() {}\n');
  const p=spawnSync(process.execPath,['pi/install.mjs','--dest',dir,'--skip-deps'],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  assert.equal(fs.existsSync(stale),false);
  assert.equal(fs.existsSync(path.join(dir,'orca-cli.mjs')),true);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('npm package includes Orca runtime module and excludes removed Windows Runner',()=>{
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
 assert.ok(pkg.files.includes('pi/orca-cli.mjs'));
 assert.ok(pkg.files.includes('pi/web-providers.mjs'));
 assert.ok(pkg.files.includes('pi/web-ask-core.mjs'));
 assert.ok(pkg.files.includes('pi/commands.mjs'));
 assert.ok(pkg.files.includes('pi/install-platform.mjs'));
 assert.equal(pkg.files.includes('pi/windows-runner.mjs'),false);
});
