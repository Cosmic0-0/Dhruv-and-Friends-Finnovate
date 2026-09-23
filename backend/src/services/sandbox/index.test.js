import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSandboxTurn } from "./index.js";
import { PLAYBOOKS, getSandboxLines } from "../playbooks/index.js";
const args = {scamType:"MCB_IMPERSONATION",stage:"URGENCY",turnIndex:1};
test("sandbox validates model JSON and pairs it with authoritative tactic", async () => {
 const result=await nextSandboxTurn(args,async()=>({text:JSON.stringify({line:"Your account will be frozen unless you act immediately.",tactic:"invented"})}));
 assert.equal(result.simulated,true); assert.equal(result.source,"llm");
 assert.equal(result.tactic.label,"Artificial urgency"); assert.equal(result.nextStage,"CREDENTIAL_REQUEST");
});
test("sandbox transport and malformed output failures use deterministic playbook fallback", async () => {
 for(const generate of [async()=>{throw Error("offline")},async()=>({text:"invalid"}),async()=>({text:JSON.stringify({line:"Visit https://bad.example and pay now"})})]) {
 const result=await nextSandboxTurn(args,generate);
 assert.equal(result.source,"scripted"); assert.equal(result.line,getSandboxLines(args.scamType,args.stage)[1]);
 }
});
test("turn cap does not invoke a model", async()=>{
 const result=await nextSandboxTurn({...args,turnIndex:5},async()=>{assert.fail("LLM called beyond cap")});
 assert.equal(result.ended,true); assert.equal(result.line,null);
});
test("every playable stage has at least two fallback lines",()=>{
 for(const [type,p] of Object.entries(PLAYBOOKS)) for(const stage of p.typicalStages) assert.ok(getSandboxLines(type,stage).length>=2,`${type}/${stage}`);
});
