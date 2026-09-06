#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerProjectTools } from '../src/project-tools.ts'

const root = await mkdtemp(join(tmpdir(), 'projectflow-dsh-approval-'))
const registered = new Map()
const approvalRequests = []
const ctx = {
  approval: {
    async request(request) {
      approvalRequests.push(request)
      return 'allowed-once'
    },
  },
  tools: {
    register(tool) {
      registered.set(tool.name, tool)
    },
  },
}

const agent = {
  id: 'captain-session',
  session: {
    header: { cwd: root, parentSession: undefined },
  },
}
const execution = {
  agent,
  workspace: root,
  session: agent.session,
}

try {
  registerProjectTools(ctx)
  const init = registered.get('agent_project_init')
  assert.ok(init, 'project init tool is registered')
  await init.execute({
    project_root: root,
    id: 'project',
    title: 'Project',
    goal: 'Confirm the DSH approval flow',
    mode: 'greenfield',
  }, execution)
  const requirement = registered.get('agent_project_requirement_update')
  assert.ok(requirement, 'requirement tool is registered')
  await requirement.execute({
    project_root: root,
    action: 'create',
    id: 'req',
    title: 'Requirement',
    statement: 'Build it',
    scope: ['feature'],
    out_of_scope: [],
    acceptance_criteria: ['works'],
    status: 'approved',
  }, execution)
  assert.equal(approvalRequests.length, 1, 'DSH approval is requested once')
  assert.equal(approvalRequests[0].toolName, 'projectflow_decision')
  assert.match(approvalRequests[0].reason, /确认需求/)
  console.log('PASS ProjectFlow uses the DSH confirmation prompt for requirement approval')
} finally {
  await rm(root, { recursive: true, force: true })
}
