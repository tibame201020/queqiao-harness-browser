import {spawnSync} from "node:child_process";
import {mkdtempSync,existsSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const runner=path.join(root,"dist","runner.js");
const home=mkdtempSync(path.join(os.tmpdir(),"qbh-stateless-resolver-"));
const synthetic="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const project="https://chatgpt.com/g/g-p-synthetic/c/"+synthetic;
const run=(command,payload)=>{
 const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
 return spawnSync(process.execPath,[runner,command,encoded],{
  env:{...process.env,QUEQIAO_HARNESS_HOME:home},encoding:"utf8",timeout:12000,
 });
};
const config=name=>({name,adapter:"chatgpt",browser:{
 engine:"chromium",channel:"chrome",connection:"cdp",cdpUrl:"http://127.0.0.1:1",
 headless:true,startMinimized:true,
}});
try{
 const init=run("init",{config:config("fixture")});
 assert.equal(init.status,0,"synthetic init failed: "+init.stderr);
 const state=path.join(home,"profiles","fixture","state.json");
 assert.equal(existsSync(state),false);
 const result=run("run",{name:"fixture",action:"resolve_targets",args:{urls:[project]}});
 assert.equal(result.status,0,"resolve_targets must not open offline CDP: "+result.stderr);
 const reply=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
 assert.deepEqual(reply,{status:"ok",action:"resolve_targets",result:{
  status:"complete",candidates:[{conversationId:synthetic,conversationUrl:project}],
 }});
 assert.equal(existsSync(state),false,"pure URL resolution must not modify Runner state");
 const invalid=run("run",{name:"fixture",action:"resolve_targets",args:{urls:[]}});
 assert.notEqual(invalid.status,0,"empty candidate input must fail closed");
 assert.equal(existsSync(state),false);
 const wrong=run("init",{config:{...config("wrong-adapter"),adapter:"generic",adapterConfig:{url:"https://example.invalid"}}});
 assert.equal(wrong.status,0);
 const unsupported=run("run",{name:"wrong-adapter",action:"resolve_targets",args:{urls:[project]}});
 assert.notEqual(unsupported.status,0);
 assert.equal(existsSync(path.join(home,"profiles","wrong-adapter","state.json")),false);
 console.log("STATELESS_RESOLVE_RUNNER_OK");
}finally{rmSync(home,{recursive:true,force:true})}
