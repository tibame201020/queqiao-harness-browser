// Pi-facing request/receipt state machine. Browser operations are delegated to Orca CLI.
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
    try{return await transport.readiness(signal)===true}catch{return false}
  }
  async function collect({request_id},signal){
    if(typeof request_id!=='string'||!ID.test(request_id))return {status:'INVALID_REQUEST'};
    let record=await read(request_id);
    if(!record)return {status:'NOT_FOUND',request_id};
    // A CLI click may succeed yet lose its receipt during navigation. The
    // original question hash can be reconciled from the pinned tab, read-only.
    // Only recover explicit post-click ambiguity, never arbitrary host failures.
    if(record.status==='UNKNOWN'&&['CLICK_OUTCOME_UNKNOWN','POST_CLICK_UNVERIFIED'].includes(record.reason)&&
      typeof transport.recover==='function'){
      try{
        const observed=await withLock(()=>transport.recover({promptHash:record.prompt_hash},signal),signal);
        if(observed?.status==='submitted'&&CONVERSATION.test(observed.conversationId||'')&&
           validUrl(observed.conversationUrl,observed.conversationId)){
          record={...record,status:'SUBMITTED',reason:undefined,conversation_id:observed.conversationId,
            conversation_url:observed.conversationUrl};
          await write(request_id,record);
        }
      }catch{/* Ambiguous click remains UNKNOWN, with no resend. */}
    }
    if(!['SUBMITTED','PENDING'].includes(record.status))return simple(record);
    if(!CONVERSATION.test(record.conversation_id||'')||!validUrl(record.conversation_url,record.conversation_id))return {status:'UNKNOWN',request_id};
    return withLock(async()=>{
      try{
        const v=await transport.collect({conversationId:record.conversation_id,conversationUrl:record.conversation_url,promptHash:record.prompt_hash},signal);
        if(v?.status==='completed'&&v.conversationId===record.conversation_id&&
          validUrl(v.conversationUrl,record.conversation_id)&&typeof v.text==='string'&&v.text.trim()){
          const done={...record,status:'COMPLETED',reason:undefined,conversation_url:v.conversationUrl,answer:v.text};await write(request_id,done);return simple(done);
        }
        if(v?.status==='unknown'){
          const unknown={...record,status:'UNKNOWN',reason:v.reason||'COLLECT_IDENTITY_UNKNOWN'};
          await write(request_id,unknown);return simple(unknown);
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
    // Exclusive claim precedes the first irreversible Orca CLI send.
    const initial={status:'DISPATCHING',request_id:id,prompt_hash:questionHash};
    try{await fs.writeFile(file(id),JSON.stringify(initial),{flag:'wx',mode:0o600})}
    catch(e){if(e.code!=='EEXIST')throw e;prior=await read(id);return prior?.prompt_hash===questionHash?simple({...prior,status:prior.status==='DISPATCHING'?'UNKNOWN':prior.status}):{status:'REQUEST_MISMATCH',request_id:id}}
    let record={...initial,status:'UNKNOWN',reason:'SEND_OUTCOME_UNKNOWN'};
    try{
      const v=await withLock(()=>transport.trigger({question},signal),signal);
      if(v?.status==='submitted'&&CONVERSATION.test(v.conversationId||'')&&validUrl(v.conversationUrl,v.conversationId)){
        record={...initial,status:'SUBMITTED',conversation_id:v.conversationId,conversation_url:v.conversationUrl};
      }else if(v?.status==='not_sent'){
        record={...initial,status:'NOT_SENT',reason:v.reason||'PRE_SEND_NOT_READY'};
      }else if(v?.status==='unknown'){
        record={...initial,status:'UNKNOWN',reason:v.reason||'SEND_OUTCOME_UNKNOWN'};
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
