// A narrow Pi Agent Loop safety boundary: an unverified send must not be
// repeated with altered wording during the same agent run. This is not a
// provider budget; completed sends can be followed by new consultations.
const providers=new Set(['chatgpt','claude','grok','mistral']);
export function createAgentSendGuard(){
 const pending=new Map();
 const valid=p=>{if(!providers.has(p))throw Error('UNKNOWN_WEB_PROVIDER')};
 const blocked=state=>{
  const suffix=state.request_id?` Receipt: ${state.request_id}.`:'';
  return {block:true,terminate:true,reason:`Previous Web Ask is ${state.status} and cannot safely be sent again in this Pi run.${suffix} Use collect_${state.provider} or ${state.provider}_status to read the original request; do not rephrase and re-ask.`};
 };
 return {
  beginAgent(){pending.clear()},
  beforeAsk(provider){
   valid(provider);
   const state=pending.get(provider);
   if(state)return blocked(state);
   pending.set(provider,{provider,status:'IN_FLIGHT',request_id:null});
   return null;
  },
  afterAsk(provider,result){
   valid(provider);
   if(result&&['UNKNOWN','PENDING','SUBMITTED'].includes(result.status)){
    pending.set(provider,{provider,status:result.status,request_id:result.request_id??null});
   }else pending.delete(provider);
  },
  afterCollect(provider,result){
   valid(provider);
   const state=pending.get(provider);if(!state)return;
   if(result?.status==='COMPLETED'&&result.request_id===state.request_id)pending.delete(provider);
  }
 };
}
