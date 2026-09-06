/** Plain-language next-step projections for ordinary ProjectFlow users. */

export interface ProjectWizardSummary {
  readonly name: string
  readonly phase: string
  readonly requirement: string
  readonly design: string
  readonly counts: Readonly<Record<string, number>>
  readonly risks: number
  readonly decisions: number
  readonly clarifications: number
}

export interface ProjectWizardLink {
  readonly [key: string]: unknown
}

export type ProjectWizardActionKind =
  | 'link_invalid'
  | 'clarification'
  | 'requirement'
  | 'design'
  | 'review'
  | 'blocked'
  | 'progress'
  | 'start'
  | 'accept'
  | 'deliver'
  | 'done'
  | 'continue'

export interface ProjectWizardAction {
  readonly kind: ProjectWizardActionKind
}

function count(summary: ProjectWizardSummary, ...statuses: readonly string[]): number {
  return statuses.reduce((total, status) => total + (summary.counts[status] ?? 0), 0)
}

function isApproved(value: string): boolean {
  return value === 'approved' || value === '已确认' || value.toLowerCase() === 'approved'
}

/** Choose one safe next action without mutating durable project state. */
export function deriveProjectWizardAction(
  summary: ProjectWizardSummary,
  executionLinks: readonly ProjectWizardLink[],
): ProjectWizardAction {
  if (executionLinks.some((link) => link.link_status === 'link_invalid')) return { kind: 'link_invalid' }
  if (summary.clarifications > 0 || summary.decisions > 0) return { kind: 'clarification' }
  if (!isApproved(summary.requirement)) return { kind: 'requirement' }
  if (!isApproved(summary.design)) return { kind: 'design' }
  if (count(summary, 'failed_review', 'failed_verification') > 0) return { kind: 'review' }
  if (count(summary, 'blocked', 'waiting_for_user') > 0) return { kind: 'blocked' }
  if (count(summary, 'in_progress') > 0) return { kind: 'progress' }
  if (count(summary, 'not_started') > 0) return { kind: 'start' }
  if (count(summary, 'implemented_not_accepted') > 0) return { kind: 'accept' }
  if (count(summary, 'accepted') > 0) return { kind: 'deliver' }
  if (count(summary, 'delivered', 'completed') > 0) return { kind: 'done' }
  return { kind: 'continue' }
}

/** Build a copyable, read-only continuation prompt for a new conversation. */
export function projectContinuationPrompt(
  workspace: string,
  summary: ProjectWizardSummary,
): string {
  const name = summary.name === '—' ? workspace : summary.name
  return [
    '请继续我上次没有做完的工作。',
    '',
    '工作名称：' + name,
    '',
    '请先用简单的话告诉我：',
    '1. 上次已经完成了什么；',
    '2. 还没有完成什么；',
    '3. 现在需要我决定哪一件事。',
    '',
    '先不要修改内容，也不要重新开始，等我确认后再继续。',
    '',
    '请只在这个对话中处理这项工作，不要在其他对话框同时处理同一件事，以免工作记录发生冲突。',
  ].join('\n')
}

/** Build a short, ordinary-language message for asking about the current next step. */
export function projectNextStepPrompt(kind: ProjectWizardActionKind): string {
  switch (kind) {
    case 'link_invalid': return '请先用简单的话说明工作安排哪里没有接上，不要创建或移动任何工作，等我确认后再处理。'
    case 'clarification': return '请一次只问我一个需要决定的问题，并用简单的话说明为什么要问。'
    case 'requirement': return '请用简单的话告诉我这项工作要完成什么，等我确认后再继续。'
    case 'design': return '请用简单的话说明处理方案、可能影响和需要我确认的地方，先不要开始处理。'
    case 'review': return '请告诉我检查发现了什么问题、怎么修改，以及修改后如何再次检查。'
    case 'blocked': return '请用简单的话说明现在为什么不能继续，以及我可以选择什么。'
    case 'progress': return '请告诉我这项工作现在做到哪里、已经完成什么、还剩什么。'
    case 'start': return '我确认可以开始处理。请先用简单的话告诉我准备做什么，再开始。'
    case 'accept': return '请展示处理结果和检查情况，我先查看，暂时不要自动交付。'
    case 'deliver': return '我确认可以交付。请先说明将交付什么，再执行交付。'
    case 'done': return '请用简单的话告诉我这项工作已经完成了什么，并说明是否还有需要我处理的事情。'
    case 'continue': return '请继续我上次没有做完的工作，先告诉我已经完成什么、还差什么，再等我确认。'
  }
}
