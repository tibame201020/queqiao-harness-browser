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
const toolResult=(provider,value)=>({content:[{type:'text',text:JSON.stringify(value)}],details:{provider,transport:'orca-cli'}});
export default function(pi){
 const clients=new Map();let cfg;
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
   description:`Send one question to the existing dedicated ${provider} web browser tab. Never blindly resend, close tabs, or transmit secrets. Returns verified answer or a durable receipt.`,
   parameters:askParameters,async execute(_id,args,signal){return toolResult(provider,await getClient(provider).ask(args,signal))}});
  pi.registerTool({name:`collect_${provider}`,label:`Collect ${provider} web response`,
   description:`Read only the original ${provider} conversation for the saved request; never send again.`,
   parameters:requestParameters,async execute(_id,args,signal){return toolResult(provider,await getClient(provider).collect(args,signal))}});
  pi.registerTool({name:`${provider}_status`,label:`Check ${provider} request receipt`,
   description:'Local receipt read only; no website operation.',
   parameters:requestParameters,async execute(_id,args){return toolResult(provider,await getClient(provider).status(args))}});
  pi.registerTool({name:`${provider}_readiness`,label:`Check ${provider} Orca page`,
   description:`Check only the preconfigured ${provider} browser page; does not submit a question.`,
   parameters:emptyParameters,async execute(){return toolResult(provider,{status:await getClient(provider).readiness()?'READY':'NOT_READY'})}});
 }
}
