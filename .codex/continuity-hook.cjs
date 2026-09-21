'use strict';
// Read-only event adapter: no transcript, network, Git, process or state writes.
const fs = require('node:fs');
const path = require('node:path');

function normalized(value) {
  return path.win32.normalize(value.replace(/^\\\\\?\\/u, '')).toLowerCase();
}
function inside(root, cwd) {
  const relative = path.win32.relative(normalized(root), normalized(cwd));
  return relative !== '..' && !relative.startsWith('..\\') && !path.win32.isAbsolute(relative);
}
function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(value);
}
function result(eventName, context, stop = false) {
  const out = {hookSpecificOutput: {hookEventName: eventName, additionalContext: context}};
  if (stop) {
    out.continue = false;
    out.stopReason = 'This task is a retired project owner. Use the current primary task.';
    out.systemMessage = out.stopReason;
  }
  return out;
}
function buildResponse(event, registry) {
  const eventName = event.hook_event_name;
  if (!['SessionStart', 'UserPromptSubmit'].includes(eventName)) return {};
  if (registry.schemaVersion !== 1 || !validId(event.session_id) ||
      typeof event.cwd !== 'string' || typeof registry.canonicalRoot !== 'string' ||
      !inside(registry.canonicalRoot, event.cwd)) {
    return result(eventName, 'Project handoff metadata could not be validated. Stop project writes; verify canonical root, AGENTS.md and .codex/project-session.json. Do not create a successor or infer ownership.');
  }
  const id = event.session_id;
  const intro = 'Project ' + registry.projectName + '. Session ' + id + '. Read AGENTS.md, ' +
    registry.handoffPath + ', ' + registry.checkpointPath + ' and ' + registry.protocolPath +
    '. Recheck actual root, branch, HEAD, dirty ownership and evidence. Project folder grouping is not proof of shared memory. ';
  if ((registry.retiredThreadIds || []).includes(id)) {
    return result(eventName, intro + 'RETIRED OWNER. No product or Git writes. Continue in primary task ' + registry.primaryThreadId + '.',
      eventName === 'SessionStart');
  }
  if (id !== registry.primaryThreadId) {
    return result(eventName, intro + 'You are not the registered primary owner. Read-only comprehension/audit only unless the current user explicitly changes ownership. Do not rotate this task, create another primary, start product work or archive another task.');
  }
  if (registry.transition !== 'idle' || registry.successorThreadId) {
    return result(eventName, intro + 'HANDOFF_TRANSITION_IN_PROGRESS. No product writes and no new independent rollover. Read the existing transition and checkpoint; recover only that same handoff. If a successor is already recorded, reuse and inspect it, never create a duplicate. A pre-validated successor or authorized orchestrator may finalize the same transition idempotently only with verified comprehension, stopped source, ownership and native archive confirmation; a registry flag alone proves none of these. Recovery of an interrupted task requires explicit owner authorization. During initial bootstrap the orchestrator retains control; perform only the requested read-only comprehension.');
  }
  return result(eventName, intro +
    (eventName === 'SessionStart' && event.source === 'compact'
      ? 'RESTORE_AND_CONTINUE_CURRENT_TASK: compaction does not interrupt the authorized task or request a handoff. Restore the checkpoint and continue in this same primary task. '
      : '') +
    'Maintain the existing task checkpoint after meaningful milestones and before handoff; do not wait for a full context window. ' +
    'Approaching the context limit is not a rollover trigger. Complete the entire agreed Definition of Done, mandatory checks/review, authorized publication and actual CI where required, with no unfinished operations. ' +
    'FAILED/BLOCKED/PENDING/unknown outcomes are incomplete: preserve evidence, report the blocker and stop at the existing attempt/time limits without rotating. Never narrow the task to one test or governance edit to claim completion. ' +
    (registry.autoHandoffEnabled === true
      ? 'Defer rollover until full task completion is evidenced and successor read-only comprehension is verified under the protocol; no registry flag alone certifies readiness. '
      : 'Automatic rollover is disabled. Restore the checkpoint in this task. ') +
    'Do not create or archive tasks merely because of compaction, bypass hook trust or disable engine auto-compaction. ' +
    'One writer, unchanged task scope and acceptance criteria; no auto-next-phase. Preserve valid checks and failed-attempt counts. ' +
    'Only the recorded primary owns implementation; latest explicit stop/read-only instructions override automatic continuation.');
}
if (require.main === module) {
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (input.length > 1024 * 1024) throw new Error('Hook payload too large');
    const event = JSON.parse(input);
    const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'project-session.json'), 'utf8'));
    process.stdout.write(JSON.stringify(buildResponse(event, registry)));
  } catch {
    process.stdout.write(JSON.stringify({
      systemMessage: 'Project continuity hook failed to read validated metadata. No files or tasks were changed. Check .codex/project-session.json and do not claim automatic handoff is active.'
    }));
  }
}
module.exports = {buildResponse, inside};
