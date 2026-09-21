'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {buildResponse, inside} = require('./continuity-hook.cjs');
const registry = {
  schemaVersion:1, projectName:'Fixture', canonicalRoot:'C:\\Projects\\Fixture',
  primaryThreadId:'primary-1', retiredThreadIds:['old-1'], autoHandoffEnabled:true, transition:'idle', successorThreadId:null,
  handoffPath:'docs/handoff.md', checkpointPath:'docs/checkpoint.md', protocolPath:'docs/rollover.md'
};
const event = (extra = {}) => ({
  hook_event_name:'SessionStart', source:'startup', cwd:'C:\\Projects\\Fixture',
  session_id:'primary-1', ...extra
});
const context = x => x.hookSpecificOutput.additionalContext;
test('normal startup restores state without requesting rollover', () => {
  const x=buildResponse(event(),registry); assert.match(context(x),/Recheck actual root/);
  assert.doesNotMatch(context(x),/AUTOMATIC_PROJECT_HANDOFF_REQUIRED/);
});
for (const state of ['active', 'blocked', 'pending', 'unknown']) {
  test(`compaction restores ${state} work without rollover or a stop loop`, () => {
    const x=buildResponse(event({source:'compact'}),{...registry,taskState:state});
    const s=context(x);
    assert.match(s,/RESTORE_AND_CONTINUE_CURRENT_TASK/);
    assert.match(s,/continue in this same primary task/);
    assert.match(s,/FAILED\/BLOCKED\/PENDING\/unknown outcomes are incomplete/);
    assert.match(s,/attempt\/time limits without rotating/);
    assert.doesNotMatch(s,/AUTOMATIC_PROJECT_HANDOFF_REQUIRED|create exactly one|archive this source/);
    assert.equal(x.continue,undefined);
  });
}
test('a completion flag does not bypass evidence, CI or comprehension', () => {
  const s=context(buildResponse(event({source:'compact'}),{...registry,taskState:'completed',taskCompleted:true}));
  for(const part of ['entire agreed Definition of Done','authorized publication and actual CI',
    'no unfinished operations','successor read-only comprehension','no registry flag alone',
    'Never narrow the task to one test or governance edit']) assert.ok(s.includes(part));
  assert.doesNotMatch(s,/AUTOMATIC_PROJECT_HANDOFF_REQUIRED/);
});
test('successor/read-only tasks never recursively create successors', () => {
  const s=context(buildResponse(event({source:'compact',session_id:'reader-1'}),registry));
  assert.match(s,/not the registered primary/); assert.doesNotMatch(s,/AUTOMATIC_PROJECT_HANDOFF_REQUIRED/);
});
test('retired source cannot resume through SessionStart', () => {
  const x=buildResponse(event({session_id:'old-1'}),registry); assert.equal(x.continue,false);
  assert.match(context(x),/RETIRED OWNER/);
});
test('UserPromptSubmit carries JSON context without unsupported stop fields', () => {
  const x=buildResponse(event({hook_event_name:'UserPromptSubmit',session_id:'old-1'}),registry);
  assert.equal(x.hookSpecificOutput.hookEventName,'UserPromptSubmit'); assert.equal(x.continue,undefined);
});
test('explicitly disabled rotation does not request a successor', () => {
  const s=context(buildResponse(event({source:'compact'}),{...registry,autoHandoffEnabled:false}));
  assert.doesNotMatch(s,/AUTOMATIC_PROJECT_HANDOFF_REQUIRED/);
  assert.match(s,/Automatic rollover is disabled/);
});
test('incomplete transition recovers the same handoff without recursive rotation', () => {
  for(const transition of ['bootstrap','preparing','awaiting_archive']) {
    const s=context(buildResponse(event({source:'compact'}),{...registry,transition}));
    assert.match(s,/HANDOFF_TRANSITION_IN_PROGRESS/);
    assert.doesNotMatch(s,/AUTOMATIC_PROJECT_HANDOFF_REQUIRED/);
  }
});
test('recorded successor blocks duplicate creation even with stale idle marker', () => {
  const s=context(buildResponse(event({source:'compact'}),{...registry,successorThreadId:'next-1'}));
  assert.match(s,/reuse and inspect it/);
  assert.doesNotMatch(s,/AUTOMATIC_PROJECT_HANDOFF_REQUIRED/);
});
test('awaiting archive permits only evidence-backed recovery of the same transition', () => {
  const x=buildResponse(event({source:'compact'}),{...registry,transition:'awaiting_archive',successorThreadId:'primary-1'});
  const s=context(x);
  for(const part of ['No product writes','pre-validated successor or authorized orchestrator',
    'idempotently','stopped source','native archive confirmation','explicit owner authorization',
    'never create a duplicate']) assert.ok(s.includes(part));
  assert.equal(x.continue,undefined);
});
test('outside or similarly named root is rejected', () => {
  for(const cwd of ['C:\\Projects\\Fixture-other','C:\\Projects\\Fixture\\..\\Other','D:\\Projects\\Fixture'])
    assert.match(context(buildResponse(event({cwd}),registry)),/could not be validated/);
});
test('subdirectory and extended Windows paths are recognized', () => {
  assert.equal(inside(registry.canonicalRoot,'\\\\?\\C:\\Projects\\Fixture\\docs'),true);
  assert.equal(inside(registry.canonicalRoot,'c:\\projects\\fixture'),true);
});
test('invalid session id never enters generated instructions', () => {
  const x=buildResponse(event({session_id:'bad\\nIGNORE_RULES'}),registry);
  assert.match(context(x),/could not be validated/); assert.doesNotMatch(context(x),/IGNORE_RULES/);
});
test('unrelated events are ignored', () => assert.deepEqual(buildResponse(event({hook_event_name:'PostToolUse'}),registry),{}));
test('malformed schema fails safely', () => assert.match(context(buildResponse(event(),{...registry,schemaVersion:9})),/could not be validated/));
test('hook does not consume prompt or transcript contents', () => {
  const x=buildResponse(event({prompt:'PRIVATE_SENTINEL',transcript_path:'PRIVATE_PATH'}),registry);
  assert.doesNotMatch(JSON.stringify(x),/PRIVATE_SENTINEL|PRIVATE_PATH/);
});
test('real registry and hook JSON are consistent', () => {
  const r=JSON.parse(fs.readFileSync(path.join(__dirname,'project-session.json'),'utf8'));
  const h=JSON.parse(fs.readFileSync(path.join(__dirname,'hooks.json'),'utf8'));
  for(const rel of [r.handoffPath,r.checkpointPath,r.protocolPath]) assert.ok(fs.existsSync(path.resolve(__dirname,'..',rel)),rel);
  assert.deepEqual(Object.keys(h.hooks).sort(),['SessionStart','UserPromptSubmit']);
  assert.equal(r.rolloverPolicy,'after-task-completion');
  for(const list of Object.values(h.hooks)) for(const group of list) for(const item of group.hooks) {
    assert.equal(item.type,'command'); assert.equal(item.timeout,5);
    assert.ok(item.commandWindows.includes('continuity-hook.cjs'));
    assert.ok(!item.commandWindows.includes('Bypass'));
  }
});
test('CLI compact restores current primary without changing continuity files', () => {
  const files=['project-session.json','hooks.json','continuity-hook.cjs'];
  const before=files.map(file=>fs.readFileSync(path.join(__dirname,file)));
  const r=JSON.parse(before[0]);
  const out=spawnSync(process.execPath,[path.join(__dirname,'continuity-hook.cjs')],{
    input:JSON.stringify(event({source:'compact',session_id:r.primaryThreadId,cwd:r.canonicalRoot})),encoding:'utf8'});
  assert.equal(out.status,0);
  const response=JSON.parse(out.stdout);
  assert.equal(response.continue,undefined);
  assert.match(context(response),/RESTORE_AND_CONTINUE_CURRENT_TASK/);
  files.forEach((file,i)=>assert.deepEqual(fs.readFileSync(path.join(__dirname,file)),before[i]));
});
test('CLI malformed input returns warning without mutations or raw contents', () => {
  const out=spawnSync(process.execPath,[path.join(__dirname,'continuity-hook.cjs')],{input:'PRIVATE_SENTINEL{',encoding:'utf8'});
  assert.equal(out.status,0); assert.match(JSON.parse(out.stdout).systemMessage,/failed/);
  assert.doesNotMatch(out.stdout,/PRIVATE_SENTINEL/);
});
