import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {withOrcaLock} from './orca-cli.mjs';
import {npmInstallCommand} from './install-platform.mjs';

test('Windows uses cmd.exe for npm.cmd, Linux invokes npm without shell',()=>{
 assert.deepEqual(npmInstallCommand('win32'),{exe:'cmd.exe',args:['/d','/s','/c','npm install --ignore-scripts --omit=dev --no-audit --no-fund']});
 assert.deepEqual(npmInstallCommand('linux'),{exe:'npm',args:['install','--ignore-scripts','--omit=dev','--no-audit','--no-fund']});
});
test('portable Orca lock uses atomic directory exclusively and releases after async completion',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-lock-portable-'));
 const lock=path.join(dir,'browser.lockdir');let release;
 try{
  const first=withOrcaLock(lock,()=>new Promise(resolve=>{release=()=>resolve('first') }),{pollMs:10,timeoutMs:2000});
  for(let i=0;i<30&&!release;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(typeof release,'function');assert.equal((await fs.stat(lock)).isDirectory(),true);
  await assert.rejects(withOrcaLock(lock,async()=>null,{pollMs:5,timeoutMs:35}),/ORCA_LOCK_TIMEOUT/);
  release();assert.equal(await first,'first');await assert.rejects(fs.stat(lock),e=>e.code==='ENOENT');
  assert.equal(await withOrcaLock(lock,async()=>42,{pollMs:5,timeoutMs:100}),42);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('lock exception or abort always releases owned lock, but never removes a lock owned by another process',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pi-lock-ownership-'));const lock=path.join(dir,'lockdir');
 try{
  await assert.rejects(withOrcaLock(lock,async()=>{throw Error('synthetic')},{timeoutMs:200}),/synthetic/);
  await assert.rejects(fs.stat(lock),e=>e.code==='ENOENT');
  await fs.mkdir(lock);
  const ac=new AbortController();ac.abort();
  await assert.rejects(withOrcaLock(lock,async()=>null,{signal:ac.signal,timeoutMs:200}),/ORCA_LOCK_ABORTED/);
  assert.equal((await fs.stat(lock)).isDirectory(),true);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
