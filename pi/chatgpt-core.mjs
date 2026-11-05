// Pi-facing workflow adapter: the browser remains owned by the existing Harness Runner.
// Private prompts are never written to this module's local request journal.
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ID=/^[A-Za-z0-9._-]{8,96}$/;
const CONVERSATION=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=text=>createHash('sha256').update(text).digest('hex');
const simple=r=>({status:r.status==='DISPATCHING'?'UNKNOWN':r.status,request_id:r.request_id,...(r.reason?{reason:r.reason}:{}),
 ...(r.conversation_id?{conversation_id:r.conversation_id}:{}),
 ...(r.conversation_url?{conversation_url:r.conversation_url}:{}),
 ...(r.status==='COMPLETED'?{answer:r.answer}: {})});
function validUrl(raw,id){
  if(typeof raw!=='string')return false;
  try{const u=new URL(raw);return u.origin==='https://chatgpt.com'&&!u.search&&!u.hash&&!u.username&&!u.password&&
    (u.pathname===`/c/${id}`||new RegExp(`^/g/g-p-[A-Za-z0-9_-]{1,120}/c/${id}$`).test(u.pathname));}
  catch{return false}
}
export function createChatGptTool({profile,stateDir,transport,withLock=async f=>f()}){
  if(!/^[A-Za-z0-9._-]{1,64}$/.test(profile||''))throw Error('INVALID_PROFILE');
  if(!path.isAbsolute(stateDir||''))throw Error('INVALID_JOURNAL_PATH');
  const file=id=>path.join(stateDir,hash(profile+'\0'+id)+'.json');
  async function read(id){try{return JSON.parse(await fs.readFile(file(id),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
  async function write(id,data){
    const name=file(id),tmp=name+'.'+process.pid+'.'+Math.random().toString(16).slice(2)+'.tmp';
    await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600,flag:'wx'});
    try{await fs.rename(tmp,name)}finally{await fs.rm(tmp,{force:true})}
  }
  async function readiness(signal){
    if(signal?.aborted)return false;
    try{const x=await transport.run('status',{name:profile},{signal});
      const cfg=x?.config;
      return x?.status==='ok'&&cfg?.adapter==='chatgpt'&&cfg?.schedule?.type==='manual'&&
        cfg?.adapterConfig?.project?.enabled===false&&cfg?.adapterConfig?.conversation?.newChatEachRun===true&&
        (cfg?.browser?.connection!=='cdp'||x?.browserEndpoint?.status==='ready');
    }catch{return false}
  }
  async function collect({request_id},signal){
    if(typeof request_id!=='string'||!ID.test(request_id))return {status:'INVALID_REQUEST'};
    const record=await read(request_id);
    if(!record)return {status:'NOT_FOUND',request_id};
    if(!['SUBMITTED','PENDING'].includes(record.status))return simple(record);
    if(!CONVERSATION.test(record.conversation_id||'')||!validUrl(record.conversation_url,record.conversation_id))return {status:'UNKNOWN',request_id};
    return withLock(async()=>{
      try{
        const x=await transport.run('run',{name:profile,action:'collect',args:{conversationId:record.conversation_id,conversationUrl:record.conversation_url,timeoutMs:60000}},{signal});
        const v=x?.result;
        if(x?.status==='ok'&&v?.status==='completed'&&v.conversationId===record.conversation_id&&validUrl(v.url,record.conversation_id)&&typeof v.text==='string'&&v.text.trim()){
          const done={...record,status:'COMPLETED',conversation_url:v.url,answer:v.text};await write(request_id,done);return simple(done);
        }
        const pending={...record,status:'PENDING'};await write(request_id,pending);return simple(pending);
      }catch{return simple({...record,status:'PENDING'})}
    },signal);
  }
  async function ask({question,request_id}={},signal){
    if(signal?.aborted)return {status:'NOT_READY',reason:'CANCELLED_BEFORE_SEND'};
    if(typeof question!=='string'||!question.trim()||question.length>4000)return {status:'INVALID_QUESTION'};
    const id=request_id??hash(profile+'\0'+question);
    if(typeof id!=='string'||!ID.test(id))return {status:'INVALID_REQUEST'};
    const questionHash=hash(question);
    let prior=await read(id);
    if(prior)return prior.prompt_hash===questionHash?simple(prior):{status:'REQUEST_MISMATCH',request_id:id};
    if(!await readiness(signal))return {status:'NOT_READY',request_id:id};
    await fs.mkdir(stateDir,{recursive:true,mode:0o700});
    // Exclusive claim precedes the first irreversible Browser Harness trigger.
    const initial={status:'DISPATCHING',request_id:id,prompt_hash:questionHash};
    try{await fs.writeFile(file(id),JSON.stringify(initial),{flag:'wx',mode:0o600})}
    catch(e){if(e.code!=='EEXIST')throw e;prior=await read(id);return prior?.prompt_hash===questionHash?simple({...prior,status:prior.status==='DISPATCHING'?'UNKNOWN':prior.status}):{status:'REQUEST_MISMATCH',request_id:id}}
    let record={...initial,status:'UNKNOWN',reason:'SEND_OUTCOME_UNKNOWN'};
    try{
      const x=await withLock(()=>transport.run('run',{name:profile,action:'trigger',args:{prompt:question}},{signal}),signal);
      if(x?.status==='ok'&&x?.result?.status==='triggered'&&x.result.submissionState==='submitted'&&
        CONVERSATION.test(x.result.conversationId||'')&&validUrl(x.result.url,x.result.conversationId)){
        record={...initial,status:'SUBMITTED',conversation_id:x.result.conversationId,conversation_url:x.result.url};
      }else if(x?.status==='ok'&&x?.result?.submissionState==='not_sent'){
        record={...initial,status:'NOT_SENT',reason:x.result.reason||'PRE_SEND_NOT_READY'};
      }
    }catch{/* Host error after claim cannot establish that no click occurred. */}
    await write(id,record);
    return record.status==='SUBMITTED'?collect({request_id:id},signal):simple(record);
  }
  async function status({request_id}){
    if(typeof request_id!=='string'||!ID.test(request_id))return {status:'INVALID_REQUEST'};
    const r=await read(request_id);return r?simple({...r,status:r.status==='DISPATCHING'?'UNKNOWN':r.status}):{status:'NOT_FOUND',request_id};
  }
  return {ask,collect,status,readiness};
}
