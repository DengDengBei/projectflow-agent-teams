import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as project from '../lib/project.js'
import * as projectTools from '../lib/project-tools.js'

let failures = 0

function check(label, condition) {
  if (condition) {
    console.log('PASS ' + label)
  } else {
    failures += 1
    console.error('FAIL ' + label)
  }
}

async function rejects(label, operation) {
  try {
    await operation()
    failures += 1
    console.error('FAIL ' + label + ' (operation unexpectedly succeeded)')
  } catch {
    console.log('PASS ' + label)
  }
}

function executionContext(root) {
  return { agent: { session: { header: { cwd: root } } } }
}

function approvedRequirement() {
  return {
    id: 'req-link-repair', title: 'Requirement', statement: 'Keep links valid', scope: ['link'], outOfScope: [],
    acceptanceCriteria: ['links are valid'], clarificationIds: [], riskIds: [], status: 'approved', version: 1, updatedAt: 1,
  }
}

function approvedDesign() {
  return {
    id: 'design-link-repair', title: 'Design', summary: 'A linked execution plan', architecture: [], moduleBoundaries: [],
    interfaces: [], dataModel: [], tradeoffs: [], migrationStrategy: [], testStrategy: ['offline'], requirementId: 'req-link-repair',
    status: 'approved', version: 1, updatedAt: 1,
  }
}

function decision(decisionType, targetVersion) {
  return {
    actor: 'fixture-user',
    source: 'host_user',
    mode: 'host_capability',
    timestamp: targetVersion,
    targetVersion,
    sessionId: 'fixture-session',
    userId: 'fixture-user',
    projectId: 'project-link-repair',
    decisionType,
    capabilityId: 'fixture-' + decisionType,
    contentHash: 'fixture-' + decisionType + '-hash',
    issuedAt: 0,
    expiresAt: 999999,
  }
}

function stateWithItem(overrides = {}) {
  const state = project.createInitialProjectState({ id: 'project-link-repair', title: 'Project Link Repair', goal: 'verify link-only updates', mode: 'greenfield', now: 1 })
  state.requirement = approvedRequirement()
  state.design = approvedDesign()
  state.workItems.push({
    id: 'wi-link', title: 'Keep this title', status: 'implemented_not_accepted', version: 4, updatedAt: 123,
    requirementId: 'req-link-repair', designId: 'design-link-repair', teamId: 'old-team', taskIds: ['t1', 't2'],
    acceptanceNote: 'review pending', acceptedAt: 456, deliveredAt: 789,
    acceptanceDecision: decision('work_item_accept', 3), deliveryDecision: decision('work_item_deliver', 3),
    ...overrides,
  })
  return state
}

async function runCase(label, operation) {
  const root = await mkdtemp(join(tmpdir(), 'project-link-repair-case-'))
  try {
    await operation(root)
  } catch (error) {
    failures += 1
    console.error('FAIL ' + label + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const registered = new Map()
projectTools.registerProjectTools({ tools: { register(tool) { registered.set(tool.name, tool) } } })
const updateTool = registered.get('agent_project_work_item_update')

await runCase('pure team link repair', async (root) => {
  const beforeState = stateWithItem()
  const beforeItem = structuredClone(beforeState.workItems[0])
  await project.writeProjectState(root, beforeState)
  await updateTool.execute({ project_root: root, id: 'wi-link', title: beforeItem.title, team_id: 'new-team' }, executionContext(root))
  const after = await project.readProjectState(root)
  const item = after.workItems[0]
  const preserved = { ...item, teamId: beforeItem.teamId }
  check('only teamId changes in the pure link branch', item.teamId === 'new-team' && JSON.stringify(preserved) === JSON.stringify(beforeItem))
  check('pure link repair preserves version, updatedAt, and acceptance/delivery evidence', item.version === 4 && item.updatedAt === 123 && item.acceptanceNote === beforeItem.acceptanceNote && item.acceptedAt === 456 && item.deliveredAt === 789 && JSON.stringify(item.acceptanceDecision) === JSON.stringify(beforeItem.acceptanceDecision) && JSON.stringify(item.deliveryDecision) === JSON.stringify(beforeItem.deliveryDecision))
})

await runCase('empty team id clears a stale link', async (root) => {
  const beforeState = stateWithItem()
  await project.writeProjectState(root, beforeState)
  await updateTool.execute({ project_root: root, id: 'wi-link', title: 'Keep this title', team_id: '' }, executionContext(root))
  const after = await project.readProjectState(root)
  const item = after.workItems[0]
  check('explicit empty team_id removes the stale link', item.teamId === undefined)
  check('clearing the link preserves work item evidence', item.version === 4 && item.updatedAt === 123 && item.status === 'implemented_not_accepted')
  const links = await projectTools.projectExecutionLinks(root, after)
  check('cleared work item is no longer projected as linked', links.length === 0)
  const gate = await projectTools.projectAcceptanceCheck(root, after, item)
  check('cleared work item no longer blocks acceptance on the missing team', gate.ok === true)
})

await runCase('explicit clear flag bypasses empty-string normalization', async (root) => {
  await project.writeProjectState(root, stateWithItem())
  await updateTool.execute({ project_root: root, id: 'wi-link', title: 'Keep this title', clear_team_link: true }, executionContext(root))
  const item = (await project.readProjectState(root)).workItems[0]
  check('clear_team_link removes the stale link', item.teamId === undefined)
  check('clear_team_link preserves implementation evidence', item.version === 4 && item.updatedAt === 123 && item.status === 'implemented_not_accepted')
})

await runCase('title changes use the normal update path', async (root) => {
  await project.writeProjectState(root, stateWithItem({ status: 'not_started' }))
  await updateTool.execute({ project_root: root, id: 'wi-link', title: 'Changed title', team_id: 'new-team' }, executionContext(root))
  const item = (await project.readProjectState(root)).workItems[0]
  check('title change does not use pure link repair', item.title === 'Changed title' && item.teamId === 'new-team' && item.version === 5)
})

await runCase('status changes retain the implementation gate', async (root) => {
  const state = project.createInitialProjectState({ id: 'ungated', title: 'Ungated', goal: 'gate status changes', mode: 'greenfield', now: 1 })
  state.workItems.push({ id: 'wi-link', title: 'Keep this title', status: 'not_started', version: 1, updatedAt: 123, teamId: 'old-team', taskIds: [] })
  await project.writeProjectState(root, state)
  await rejects('status change is blocked before approved requirements and design', () => updateTool.execute({ project_root: root, id: 'wi-link', title: 'Keep this title', status: 'in_progress', team_id: 'new-team' }, executionContext(root)))
  const item = (await project.readProjectState(root)).workItems[0]
  check('blocked status change leaves the item untouched', item.status === 'not_started' && item.teamId === 'old-team' && item.version === 1)
})

for (const [field, value, argument] of [
  ['requirementId', 'req-other', { requirement_id: 'req-other' }],
  ['designId', 'design-other', { design_id: 'design-other' }],
  ['taskIds', ['t3'], { task_ids: ['t3'] }],
]) {
  await runCase(field + ' changes use the normal update path', async (root) => {
    await project.writeProjectState(root, stateWithItem({ status: 'not_started' }))
    await updateTool.execute({ project_root: root, id: 'wi-link', title: 'Keep this title', team_id: 'new-team', ...argument }, executionContext(root))
    const item = (await project.readProjectState(root)).workItems[0]
    check(field + ' change does not use pure link repair', item.teamId === 'new-team' && item.version === 5 && JSON.stringify(item[field]) === JSON.stringify(value))
  })
}

await runCase('missing Work Items cannot use the pure link branch', async (root) => {
  const state = project.createInitialProjectState({ id: 'create-path', title: 'Create path', goal: 'normal creation', mode: 'greenfield', now: 1 })
  await project.writeProjectState(root, state)
  await updateTool.execute({ project_root: root, id: 'new-wi', title: 'New Work Item', team_id: 'new-team' }, executionContext(root))
  const item = (await project.readProjectState(root)).workItems[0]
  check('missing Work Item uses normal creation metadata', item.id === 'new-wi' && item.status === 'not_started' && item.version === 1 && item.teamId === 'new-team')
})

await runCase('ordinary update cannot cross acceptance boundaries', async (root) => {
  await project.writeProjectState(root, stateWithItem())
  await rejects('accepted is rejected by ordinary Work Item update', () => updateTool.execute({ project_root: root, id: 'wi-link', title: 'Keep this title', status: 'accepted', team_id: 'new-team' }, executionContext(root)))
  await rejects('delivered is rejected by ordinary Work Item update', () => updateTool.execute({ project_root: root, id: 'wi-link', title: 'Keep this title', status: 'delivered', team_id: 'new-team' }, executionContext(root)))
})

await runCase('existing team with missing tasks reports link_invalid', async (root) => {
  const state = stateWithItem({ teamId: 'new-team', taskIds: ['t1', 't2'] })
  const team = {
    schemaVersion: 2, id: 'new-team', name: 'New team', description: 'fixture', captainSessionId: 'captain', createdAt: 1,
    members: [], tasks: [], taskSeq: 0, phase: 'staged', planReviewState: 'awaiting_review', revision: 1,
    projectId: 'project-link-repair', projectRequirementId: 'req-link-repair', projectRequirementVersion: 1,
    projectDesignId: 'design-link-repair', projectDesignVersion: 1, projectLinkState: 'linked',
  }
  await project.writeProjectState(root, state)
  const teamRoot = join(root, '.agent-teams', team.id)
  await mkdir(teamRoot, { recursive: true })
  await writeFile(join(teamRoot, 'team.json'), JSON.stringify(team), 'utf8')
  const links = await projectTools.projectExecutionLinks(root, await project.readProjectState(root))
  const link = links[0]
  check('team is found but missing task IDs make the link invalid', link.team_found === true && link.link_status === 'link_invalid' && link.projected_status === 'blocked' && JSON.stringify(link.missing_task_ids) === JSON.stringify(['t1', 't2']))
})

if (failures > 0) process.exit(1)
console.log('project-link-repair verification passed with 0 failures')
