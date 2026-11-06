// Manual Pi slash commands are a thin UI over the same durable Web Ask Core
// used by model tools. They never submit directly to Orca or bypass receipts.
const COMMANDS=Object.freeze([
 ['ask-gpt','chatgpt','ChatGPT'],
 ['ask-claude','claude','Claude'],
 ['ask-grok','grok','Grok'],
 ['ask-mistral','mistral','Mistral']
]);
const RETRYABLE_UNKNOWN=new Set(['CLICK_OUTCOME_UNKNOWN','POST_CLICK_UNVERIFIED']);
const DISPLAY_LIMIT=12000;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function render(name,provider,command,r){
 const receipt=r?.request_id?`\nRequest ID: ${r.request_id}`:'';
 const status=r?.status||'UNKNOWN';
 if(status==='COMPLETED'){
  const full=typeof r.answer==='string'?r.answer:'';
  const clipped=full.length>DISPLAY_LIMIT;
  return `${name} — COMPLETED${receipt}\n\n${full.slice(0,DISPLAY_LIMIT)}${clipped?'\n\n[Answer truncated for Pi display; full response is retained in the private request journal.]':''}`;
 }
 const reason=r?.reason?`\nReason: ${r.reason}`:'';
 const followup=r?.request_id&&['PENDING','UNKNOWN'].includes(status)?`\nRead-only follow-up: /${command} --collect ${r.request_id}`:'';
 return `${name} — ${status}${receipt}${reason}${followup}`;
}

export function registerWebAskCommands(pi,{getClient,sleep=wait,maxCollectAttempts=8}={}){
 if(typeof getClient!=='function')throw Error('MISSING_WEB_ASK_CLIENT');
 for(const [command,provider,name] of COMMANDS){
  pi.registerCommand(command,{
   description:`Ask ${name} Web via pinned Orca tab; usage: /${command} <question> or /${command} --collect <request_id>`,
   handler:async(args,ctx)=>{
    const input=typeof args==='string'?args.trim():'';
    const notify=(message,severity='warning')=>{
     if(ctx?.hasUI&&typeof ctx.ui?.notify==='function')ctx.ui.notify(message,severity);
     else pi.sendMessage({customType:'queqiao-web-ask',content:message,display:true},{triggerTurn:false});
    };
    let request;
    if(input.startsWith('--collect')){
     const match=/^--collect\s+([A-Za-z0-9._-]{8,96})$/.exec(input);
     if(!match){notify(`Usage: /${command} --collect <request_id>`);return}
     request={request_id:match[1]};
    }else{
     if(!input||input.length>4000){notify(`Usage: /${command} <question> (1–4000 characters)`);return}
    }
    try{
     const client=getClient(provider);
     let result=request?await client.collect(request):await client.ask({question:input});
     if(!request){
      for(let i=0;i<maxCollectAttempts;i++){
       const pending=result?.status==='PENDING';
       const recovery=result?.status==='UNKNOWN'&&RETRYABLE_UNKNOWN.has(result.reason);
       if(!result?.request_id||!(pending||recovery))break;
       await sleep(1200);
       result=await client.collect({request_id:result.request_id});
      }
     }
     pi.sendMessage({customType:'queqiao-web-ask',content:render(name,provider,command,result),display:true,
      details:{provider,status:result?.status||'UNKNOWN',request_id:result?.request_id??null}},
      {triggerTurn:false});
    }catch{
     // Transport failures can happen after a successful click. Do not claim
     // NOT_SENT or run a second Ask; the persistent journal is authoritative.
     notify(`${name} — command failed; send outcome not established. Inspect the receipt before retrying.`, 'error');
    }
   }
  });
 }
}
