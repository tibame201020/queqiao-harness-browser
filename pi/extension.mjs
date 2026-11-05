// Load with: pi --extension /absolute/path/to/pi/extension.mjs
// Configuration is local only. Never commit profiles, auth, conversations or prompts.
import {Type} from 'typebox';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {createChatGptTool} from './chatgpt-core.mjs';
import {createWindowsHarnessTransport,withSharedBrowserLock} from './windows-runner.mjs';

function localConfig(){
  const file=process.env.QUEQIAO_PI_CHATGPT_CONFIG || path.join(os.homedir(),'.config','queqiao','pi-chatgpt.json');
  const cfg=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const k of ['profile','runnerPath','stateDir','lockFile'])if(typeof cfg[k]!=='string'||!cfg[k])throw Error('MISSING_PI_CHATGPT_'+k.toUpperCase());
  return cfg;
}
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],details:{provider:'chatgpt',transport:'existing-browser-harness'}});
export default function(pi){
  let client;
  const getClient=()=>{
    if(client)return client;
    const cfg=localConfig();
    client=createChatGptTool({profile:cfg.profile,stateDir:cfg.stateDir,
      transport:createWindowsHarnessTransport({runnerPath:cfg.runnerPath}),
      withLock:(fn,signal)=>withSharedBrowserLock(cfg.lockFile,fn,{signal})});
    return client;
  };
  pi.registerTool({name:'ask_chatgpt',label:'Ask ChatGPT through Browser Harness',
    description:'Send one question via the existing authenticated Browser Harness; return verified answer or durable pending/unknown receipt. Repeat with same request_id never resends. Do not use for secret material.',
    parameters:Type.Object({question:Type.String({minLength:1,maxLength:4000}),request_id:Type.Optional(Type.String({minLength:8,maxLength:96}))},{additionalProperties:false}),
    async execute(_id,args,signal){return result(await getClient().ask(args,signal))}});
  pi.registerTool({name:'collect_chatgpt',label:'Collect ChatGPT response',
    description:'Read the exact original conversation for a previously submitted request; never resend a question.',
    parameters:Type.Object({request_id:Type.String({minLength:8,maxLength:96})},{additionalProperties:false}),
    async execute(_id,args,signal){return result(await getClient().collect(args,signal))}});
  pi.registerTool({name:'chatgpt_status',label:'Check ChatGPT request status',
    description:'Read the local durable receipt; this never opens the browser or sends a question.',
    parameters:Type.Object({request_id:Type.String({minLength:8,maxLength:96})},{additionalProperties:false}),
    async execute(_id,args,_signal){return result(await getClient().status(args))}});
  pi.registerTool({name:'chatgpt_readiness',label:'Check ChatGPT Browser Harness readiness',
    description:'Inspect configured existing Browser Harness profile only; no question is submitted.',
    parameters:Type.Object({},{additionalProperties:false}),
    async execute(){return result({status:await getClient().readiness()?'READY':'NOT_READY'})}});
}
