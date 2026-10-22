// An ambiguous-send receipt is profile state, not a list of provider names.
export function ambiguousTriggerBlocked(state:{ambiguousTrigger?:boolean},_adapter:string,action:string,acknowledged:boolean):boolean {
  return action==="trigger" && state.ambiguousTrigger===true && !acknowledged;
}
export function triggerMayHaveDispatched(action:string,value:unknown):boolean {
  return action==="trigger" && value!==null && typeof value==="object" &&
    ["triggered","ambiguous"].includes((value as {status?:string}).status ?? "");
}
export function nextAmbiguousTrigger(previous:boolean,action:string,value:unknown,acknowledged:boolean):boolean {
  if(action!=="trigger") return previous;
  if(value && typeof value==="object" && (value as {status?:string}).status==="ambiguous") return true;
  return acknowledged ? false : previous;
}
