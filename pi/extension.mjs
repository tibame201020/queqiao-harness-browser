// Standalone Pi Web Ask: four explicit tools, one shared receipt/state core.
// All page IDs / authentication remain operator-owned and local, never model arguments.
import {Type} from 'typebox';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {createWebAskTool} from './web-ask-core.mjs';
import {createOrcaCliTransport,withOrcaLock} from './orca-cli.mjs';
import {WEB_PROVIDERS} from './web-providers.mjs';
import {registerWebAskCommands} from './commands.mjs';
import {createAgentSendGuard} from './agent-send-guard.mjs';

const providers=Object.keys(WEB_PROVIDERS);
const configPath=()=>process.env.QUEQIAO_PI_CHATGPT_CONFIG||path.join(os.homedir(),'.config','queqiao','pi-chatgpt.json');
function localConfig(){
 const cfg=JSON.parse(fs.readFileSync(configPath(),'utf8'));
 for(const k of ['profile','stateDir','lockFile'])if(typeof cfg[k]!=='string'||!cfg[k])throw Error('MISSING_PI_WEB_'+k.toUpperCase());
 return cfg;
}
function providerConfig(cfg,provider){
 // Existing one-provider installs retain their ChatGPT page binding unchanged.
 const p=cfg.providers?.[provider]??(provider==='chatgpt'?cfg:null);
 if(!p||typeof p.worktree!=='string'||typeof p.pageId!=='string')throw Error('MISSING_PI_WEB_PROVIDER_'+provider.toUpperCase());
 return p;
}
const toolResult=(provider,value)=>{
 const unresolved=['UNKNOWN','PENDING'].includes(value?.status)&&typeof value.request_id==='string';
 const response=unresolved?{...value,next_action:`Use collect_${provider} or ${provider}_status with request_id ${value.request_id}. Do not call ask_${provider} again for this unresolved send. If still unknown, stop and report the receipt.`}:value;
 return {content:[{type:'text',text:JSON.stringify(response)}],details:{provider,transport:'orca-cli'}};
};
export default function(pi){
 const clients=new Map();let cfg;
 const guard=createAgentSendGuard();
 // `agent_start` is a native Pi low-level run boundary. `tool_call` is a
 // pre-execution hook, including for sibling calls in a parallel tool batch.
 if(typeof pi.on==='function'){
  // Reset only for a new user prompt, not a low-level auto-retry.
  pi.on('before_agent_start',()=>guard.beginAgent());
  pi.on('tool_call',event=>{
   const match=/^ask_(chatgpt|claude|grok|mistral)$/.exec(event.toolName||'');
   if(match)return guard.beforeAsk(match[1])??undefined;
  });
 }

 const getClient=provider=>{
  if(clients.has(provider))return clients.get(provider);
  cfg??=localConfig();
  const p=providerConfig(cfg,provider);
  const client=createWebAskTool({provider,profile:cfg.profile,stateDir:cfg.stateDir,
   transport:createOrcaCliTransport({provider,cli:p.cli??cfg.cli??'orca-ide',worktree:p.worktree,pageId:p.pageId}),
   withLock:(fn,signal)=>withOrcaLock(cfg.lockFile,fn,{signal})});
  clients.set(provider,client);return client;
 };
 registerWebAskCommands(pi,{getClient});
 const askParameters=Type.Object({question:Type.String({minLength:1,maxLength:4000}),request_id:Type.Optional(Type.String({minLength:8,maxLength:96}))},{additionalProperties:false});
 const requestParameters=Type.Object({request_id:Type.String({minLength:8,maxLength:96})},{additionalProperties:false});
 const emptyParameters=Type.Object({},{additionalProperties:false});
 for(const provider of providers){
  pi.registerTool({name:`ask_${provider}`,label:`Ask ${provider} via Orca`,
   description:`Send one question to the existing dedicated ${provider} web browser tab. If returned PENDING/UNKNOWN, NEVER call ask_${provider} again in the same run; use collect_${provider} or ${provider}_status with the original request_id, then report an unresolved receipt. Never blindly resend, close tabs, or transmit secrets.`,
   parameters:askParameters,async execute(_id,args,signal){
    let outcome;
    try{outcome=await getClient(provider).ask(args,signal)}
    catch(e){guard.afterAsk(provider,{status:'UNKNOWN',request_id:args?.request_id});throw e}
    guard.afterAsk(provider,outcome);
    return toolResult(provider,outcome);
   }});
  pi.registerTool({name:`collect_${provider}`,label:`Collect ${provider} web response`,
   description:`Read only the original ${provider} conversation for the saved request; never send again.`,
   parameters:requestParameters,async execute(_id,args,signal){
    const result=await getClient(provider).collect(args,signal);
    guard.afterCollect(provider,result);
    return toolResult(provider,result);
   }});
  pi.registerTool({name:`${provider}_status`,label:`Check ${provider} request receipt`,
   description:'Local receipt read only; no website operation.',
   parameters:requestParameters,async execute(_id,args){
    const result=await getClient(provider).status(args);
    guard.afterCollect(provider,result);
    return toolResult(provider,result);
   }});
  pi.registerTool({name:`${provider}_readiness`,label:`Check ${provider} Orca page`,
   description:`Check only the preconfigured ${provider} browser page; does not submit a question.`,
   parameters:emptyParameters,async execute(){return toolResult(provider,{status:await getClient(provider).readiness()?'READY':'NOT_READY'})}});
 }
}
