import {describe,expect,it} from "vitest";
import {ambiguousTriggerBlocked, nextAmbiguousTrigger} from "./trigger-guard.js";
describe("ambiguous web submission recovery",()=>{
 it("locks future web trigger even if the caller requests force",()=>{
  expect(ambiguousTriggerBlocked({ambiguousTrigger:true},"claude","trigger",false)).toBe(true);
  expect(ambiguousTriggerBlocked({ambiguousTrigger:true},"claude","trigger",true)).toBe(false);
  expect(ambiguousTriggerBlocked({ambiguousTrigger:true},"chatgpt","trigger",false)).toBe(true);
  expect(ambiguousTriggerBlocked({ambiguousTrigger:true},"grok","collect",false)).toBe(false);
 });
 it("persists ambiguous status through later status calls and clears only after explicit acknowledgement",()=>{
  expect(nextAmbiguousTrigger(true,"status",{status:"ready"},false)).toBe(true);
  expect(nextAmbiguousTrigger(false,"trigger",{status:"ambiguous"},false)).toBe(true);
  expect(nextAmbiguousTrigger(true,"trigger",{status:"unavailable"},false)).toBe(true);
  expect(nextAmbiguousTrigger(true,"trigger",{status:"unavailable"},true)).toBe(false);
 });
});
