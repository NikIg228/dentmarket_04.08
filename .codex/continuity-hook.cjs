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
    return result(eventName, intro + 'HANDOFF_TRANSITION_IN_PROGRESS. No product writes and no new independent rollover. Read the existing transition and checkpoint; recover only that same handoff. If a successor is already recorded, reuse and inspect it, never create a duplicate. During initial bootstrap the orchestrator retains control; perform only the requested read-only comprehension.');
  }
  if (eventName === 'SessionStart' && event.source === 'compact' && registry.autoHandoffEnabled === true) {
    return result(eventName, intro +
      'AUTOMATIC_PROJECT_HANDOFF_REQUIRED: the owner authorized replacement of the primary task after context compaction on 2026-09-21. ' +
      'Before any more product edits, follow the two-phase procedure in the protocol: persist the exact unfinished authorized scope and evidence, freeze source writes, reuse an already recorded successor or create exactly one fresh task in this saved project using environment.type=local, never a worktree or fork. ' +
      'Have the successor perform read-only comprehension; inspect its reply, then transfer ownership, archive this source through the native Codex tool and release the successor to the same unfinished authorized scope. ' +
      'Do not replay the entire backlog, reset attempt budgets, bypass hook trust, commit WIP just because of compaction, or claim archive/create succeeded without readback. ' +
      'If app tools or trust are unavailable, or creation has an uncertain result, stop safely and report the blocker; do not retry blind or resume writing in the old task.');
  }
  return result(eventName, intro +
    'Maintain the existing task checkpoint after meaningful milestones and before handoff; do not wait for a full context window. ' +
    (registry.autoHandoffEnabled === true
      ? 'On a known compaction follow the authorized protocol even if hook execution is unavailable; disclose that limitation. '
      : 'Automatic rollover is disabled. Do not create or archive tasks on compaction. Restore the checkpoint in this task. ') +
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
