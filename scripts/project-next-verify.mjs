import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as project from '../lib/project.js'
import * as projectTools from '../lib/project-tools.js'

let failures = 0
function check(label, condition) {
  if (!condition) {
    failures += 1
    console.error('FAIL ' + label)
    return
  }
  console.log('PASS ' + label)
}

const root = await mkdtemp(join(tmpdir(), 'project-next-'))
try {
  const registered = new Map()
  projectTools.registerProjectTools({ tools: { register(tool) { registered.set(tool.name, tool) } } })
  const nextTool = registered.get('agent_project_next')
  const context = { agent: { session: { header: { cwd: root } } } }
  const empty = await nextTool.execute({ project_root: root }, context)
  check('uninitialized work offers a plain-language start action', empty.next_step?.title === '开始一项新工作' && empty.read_only === true)

  const state = project.createInitialProjectState({ id: 'next-project', title: '示例工作', goal: 'next step', mode: 'greenfield', now: 1 })
  state.requirement = { id: 'req', title: 'Req', statement: 'Do work', scope: [], outOfScope: [], acceptanceCriteria: ['works'], clarificationIds: [], riskIds: [], status: 'approved', version: 1, updatedAt: 1 }
  state.design = { id: 'design', title: 'Design', summary: 'Plan', architecture: [], moduleBoundaries: [], interfaces: [], dataModel: [], tradeoffs: [], migrationStrategy: [], testStrategy: [], requirementId: 'req', status: 'approved', version: 1, updatedAt: 1 }
  state.workItems.push({ id: 'wi', title: 'Work', status: 'implemented_not_accepted', version: 1, updatedAt: 1 })
  await project.writeProjectState(root, state)
  const next = await nextTool.execute({ project_root: root }, context)
  check('implemented work asks the user to review and confirm', next.next_step?.title === '查看结果并确认完成' && next.next_step?.requires_confirmation === true)
  check('next-step output uses ordinary user language', typeof next.parallel_work_warning === 'string' && !JSON.stringify(next).includes('agent_project_') && !JSON.stringify(next).includes('taskIds'))
  check('continuation text warns against parallel dialogs', next.continuation_prompt.includes('不要在其他对话框同时处理同一件事'))
} finally {
  await rm(root, { recursive: true, force: true })
}
if (failures > 0) process.exit(1)
console.log('project-next verification passed with 0 failures')
