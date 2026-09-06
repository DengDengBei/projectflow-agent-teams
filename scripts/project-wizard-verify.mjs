import { strict as assert } from 'node:assert'
import { deriveProjectWizardAction, projectContinuationPrompt } from '../src/client/project-wizard.ts'

const base = {
  name: '示例工作', phase: 'planning', requirement: '已确认', design: '已确认',
  counts: {}, risks: 0, decisions: 0, clarifications: 0,
}
const check = (label, actual, expected) => {
  assert.equal(actual.kind, expected, label)
  console.log('PASS ' + label)
}

check('安排没有接上时先提示处理安排', deriveProjectWizardAction({ ...base, counts: { in_progress: 1 } }, [{ link_status: 'link_invalid' }]), 'link_invalid')
check('有待回答内容时先回答问题', deriveProjectWizardAction({ ...base, clarifications: 1 }, []), 'clarification')
check('内容未确认时先确认内容', deriveProjectWizardAction({ ...base, requirement: '草稿' }, []), 'requirement')
check('方案未确认时先确认方案', deriveProjectWizardAction({ ...base, design: '草稿' }, []), 'design')
check('检查发现问题时先修改', deriveProjectWizardAction({ ...base, counts: { failed_review: 1 } }, []), 'review')
check('正在处理时显示进度', deriveProjectWizardAction({ ...base, counts: { in_progress: 1 } }, []), 'progress')
check('有未开始工作时提示开始', deriveProjectWizardAction({ ...base, counts: { not_started: 1 } }, []), 'start')
check('处理完成后提示检查和确认', deriveProjectWizardAction({ ...base, counts: { implemented_not_accepted: 1 } }, []), 'accept')
check('确认完成后提示交付', deriveProjectWizardAction({ ...base, counts: { accepted: 1 } }, []), 'deliver')
check('全部交付后显示已完成', deriveProjectWizardAction({ ...base, counts: { delivered: 1 } }, []), 'done')

const prompt = projectContinuationPrompt('D:/workspace', base)
assert.match(prompt, /请继续我上次没有做完的工作/)
assert.match(prompt, /不要在其他对话框同时处理同一件事/)
assert.doesNotMatch(prompt, /agent_project_|taskIds|link_invalid|clarification|continue|Work Item/)
console.log('PASS continuation prompt uses ordinary language and warns about parallel dialogs')
