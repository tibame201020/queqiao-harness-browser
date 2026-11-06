// Manual Pi slash commands are a thin UI over the same durable Web Ask Core
// used by model tools. They never submit directly to Orca or bypass receipts.
const COMMANDS=Object.freeze([
 ['ask-gpt','chatgpt','ChatGPT'],
 ['ask-claude','claude','Claude'],
 ['ask-grok','grok','Grok'],
 ['ask-mistral','mistral','Mistral']
]);
const DISPLAY_LIMIT=12000;

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

export function registerWebAskCommands(pi,{getClient}={}){
 if(typeof getClient!=='function')throw Error('MISSING_WEB_ASK_CLIENT');
 for(const [command,provider,name] of COMMANDS){
  pi.registerCommand(command,{
   description:`Ask ${name} with Pi Agent project context; usage: /${command} <request> or /${command} --collect <request_id>`,
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
     if(!request){
      // The slash command is an Agent Loop entrypoint, not a passthrough.
      // Preserve the user's natural-language requirements, including a
      // mandatory-consult instruction when one is explicitly present.
      const localCwd=typeof ctx?.cwd==='string'?ctx.cwd:'current Pi workspace';
      const instruction=[
       `User invoked /${command}. Preferred external provider: ${name} (Pi tool: ask_${provider}; read-only follow-up: collect_${provider}).`,
       `Current Pi working directory (local context, not automatically for external transmission): ${localCwd}`,
       `User request: ${JSON.stringify(input)}`,
       'Interpret the request using your existing Pi Agent Loop. Decide whether external consultation is needed unless the user explicitly requires it; if explicitly required, make the relevant tool call and report any failure.',
       'For project-specific requests, use Pi read/search/test tools to inspect only relevant actual project evidence first. Send only the minimal task-relevant context to the external provider. Never include credentials, private user data, or unrelated files.',
       `If consulting this provider, call ask_${provider}. If PENDING/UNKNOWN, use collect_${provider} or ${provider}_status for read-only reconciliation; do not repeat Ask merely because the response was not yet complete.`,
       'Continue reasoning about the external result and fulfill the original user task instead of merely displaying the remote answer.'
      ].join('\n');
      pi.sendUserMessage(instruction);
      return;
     }
     // Explicit receipt collection is a local read-only utility command.
     const result=await getClient(provider).collect(request);
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
