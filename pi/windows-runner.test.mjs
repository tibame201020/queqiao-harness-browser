import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {makeWindowsRunnerInput,createWindowsHarnessTransport,withSharedBrowserLock} from './windows-runner.mjs';

const runner='C:\\Harness\\dist\\runner.js';
test('Windows transport sends only a base64url payload on stdin, not the process argv',()=>{
 const x=makeWindowsRunnerInput(runner,'run',{name:'dedicated-pi',action:'trigger',args:{prompt:'private regression prompt'}});
 assert.deepEqual(x.args,['-NoProfile','-NonInteractive','-Command','-']);
 assert.equal(x.args.join(' ').includes('private regression prompt'),false);
 assert.equal(x.input.includes('private regression prompt'),false);
 assert.equal(x.input.includes('runner.js'),true);
 assert.equal(x.input.includes('node.exe'),true);
 assert.throws(()=>makeWindowsRunnerInput(`C:\\bad'path\\runner.js`,'run',{}),/INVALID_RUNNER_PATH/);
 assert.throws(()=>makeWindowsRunnerInput(runner,'bogus',{}),/INVALID_RUNNER_COMMAND/);
});

test('transport parses structured Browser Harness Runner receipt and does not log child stdout',async()=>{
 let seen;
 const spawnProcess=(exe,args)=>{
  assert.equal(exe,'powershell.exe');
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};
  child.stdin={on:()=>{},end(input){seen={args,input};queueMicrotask(()=>{child.stdout.emit('data','__QUEQIAO_PI_WIN_PID__77\n');child.stdout.emit('data',JSON.stringify({status:'ok',profile:'test-profile'})+'\n');child.emit('close',0)})}};
  return child;
 };
 const c=createWindowsHarnessTransport({runnerPath:runner,powershellExe:'powershell.exe',spawnProcess});
 const r=await c.run('status',{name:'test-profile'});
 assert.equal(r.profile,'test-profile');assert.equal(seen.args.includes('status'),false);
});

test('transport refuses invalid JSON receipt and handles the process as failed',async()=>{
 let killed=0;
 const spawnProcess=()=>{
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{killed++};
  child.stdin={on:()=>{},end(){queueMicrotask(()=>{child.stdout.emit('data','bad receipt');child.emit('close',0)})}};
  return child;
 };
 await assert.rejects(createWindowsHarnessTransport({runnerPath:runner,spawnProcess}).run('run',{name:'x'}),/HARNESS_INVALID_RECEIPT/);
 assert.equal(killed,0); // already-exited Windows PID must never be killed again
});

test('shared browser lock surrounds the complete asynchronous runner call',async()=>{
 const log=[];
 const spawnProcess=(_,args)=>{
  assert.deepEqual(args.slice(0,4),['-x','-w','90','/tmp/local-test-browser.lock']);
  const child=new EventEmitter();child.stdout=new EventEmitter();child.stdin={end(){log.push('release')}};
  queueMicrotask(()=>child.stdout.emit('data','__PI_LOCK_HELD__\n'));
  return child;
 };
 const r=await withSharedBrowserLock('/tmp/local-test-browser.lock',async()=>{log.push('work');return 'complete'},{spawnProcess});
 assert.equal(r,'complete');assert.deepEqual(log,['work','release']);
});
