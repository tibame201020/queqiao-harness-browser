const webProviders=new Set(["claude","mistral","grok"]);
export function ambiguousTriggerBlocked(state:{ambiguousTrigger?:boolean},adapter:string,action:string,acknowledged:boolean):boolean {
  return webProviders.has(adapter) && action==="trigger" && state.ambiguousTrigger===true && !acknowledged;
}
export function nextAmbiguousTrigger(previous:boolean,action:string,value:unknown,acknowledged:boolean):boolean {
  if(action!=="trigger") return previous;
  if(value && typeof value==="object" && (value as {status?:string}).status==="ambiguous") return true;
  return acknowledged ? false : previous;
}
