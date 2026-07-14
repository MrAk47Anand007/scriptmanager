import {
  Bell, Bot, Braces, CheckCircle2, Clock3, Code2, GitFork, GitMerge,
  Globe2, ServerCog, Split, type LucideIcon,
} from 'lucide-react'
import type { WorkflowNode, WorkflowNodeType } from './types'

export type WorkflowNodeCategory = 'triggers' | 'actions' | 'flow' | 'agents' | 'communication' | 'plugins'
export type InspectorFieldKind = 'text' | 'textarea' | 'number' | 'select' | 'resource' | 'json'

export type InspectorField = {
  key: string
  label: string
  kind: InspectorFieldKind
  required?: boolean
  min?: number
  options?: Array<{ label: string; value: string }>
  resource?: 'scripts' | 'apiRequests' | 'remoteProfiles' | 'agentProfiles'
}

export type WorkflowNodePort = { id: string; label: string }

export type WorkflowNodeSpec = {
  type: WorkflowNodeType
  label: string
  description: string
  category: WorkflowNodeCategory
  icon: LucideIcon
  color: string
  keywords: string[]
  defaults: Record<string, unknown>
  inputs: WorkflowNodePort[]
  outputs: WorkflowNodePort[]
  fields: InspectorField[]
}

export type NodeConfigIssue = {
  code: 'required_config' | 'invalid_config'
  field: string
  message: string
}

const input = [{ id: 'input', label: 'Input' }]
const output = [{ id: 'output', label: 'Output' }]

const specs: WorkflowNodeSpec[] = [
  { type: 'script', label: 'Script', description: 'Run a managed script.', category: 'actions', icon: Code2, color: 'sky', keywords: ['code', 'build', 'run'], defaults: { scriptId: '' }, inputs: input, outputs: output, fields: [{ key: 'scriptId', label: 'Script', kind: 'resource', resource: 'scripts', required: true }] },
  { type: 'api', label: 'API request', description: 'Run a saved API request.', category: 'actions', icon: Globe2, color: 'blue', keywords: ['http', 'request', 'rest'], defaults: { requestId: '' }, inputs: input, outputs: output, fields: [{ key: 'requestId', label: 'Request', kind: 'resource', resource: 'apiRequests', required: true }] },
  { type: 'remote', label: 'Remote', description: 'Run a script on a remote profile.', category: 'actions', icon: ServerCog, color: 'cyan', keywords: ['ssh', 'server', 'ops'], defaults: { scriptId: '', profileId: '' }, inputs: input, outputs: output, fields: [{ key: 'scriptId', label: 'Script', kind: 'resource', resource: 'scripts', required: true }, { key: 'profileId', label: 'Remote profile', kind: 'resource', resource: 'remoteProfiles', required: true }] },
  { type: 'condition', label: 'Condition', description: 'Route values through true or false branches.', category: 'flow', icon: Split, color: 'amber', keywords: ['if', 'branch', 'boolean'], defaults: { left: '$trigger.value', operator: 'truthy' }, inputs: input, outputs: [{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }], fields: [{ key: 'left', label: 'Value', kind: 'text', required: true }, { key: 'operator', label: 'Operator', kind: 'select', required: true, options: ['equals', 'not_equals', 'truthy', 'falsy', 'greater_than', 'less_than'].map((value) => ({ label: value.replaceAll('_', ' '), value })) }, { key: 'right', label: 'Compare with', kind: 'text' }] },
  { type: 'transform', label: 'Transform', description: 'Map workflow values into a new shape.', category: 'flow', icon: Braces, color: 'violet', keywords: ['map', 'json', 'data'], defaults: { mappings: {} }, inputs: input, outputs: output, fields: [{ key: 'mappings', label: 'Mappings', kind: 'json', required: true }] },
  { type: 'delay', label: 'Delay', description: 'Wait before continuing.', category: 'flow', icon: Clock3, color: 'orange', keywords: ['wait', 'sleep', 'time'], defaults: { durationMs: 1000 }, inputs: input, outputs: output, fields: [{ key: 'durationMs', label: 'Duration (ms)', kind: 'number', min: 1, required: true }] },
  { type: 'approval', label: 'Approval', description: 'Pause for a protected human decision.', category: 'flow', icon: CheckCircle2, color: 'purple', keywords: ['review', 'allow', 'human'], defaults: { prompt: 'Approve this step?' }, inputs: input, outputs: output, fields: [{ key: 'prompt', label: 'Approval prompt', kind: 'textarea', required: true }] },
  { type: 'parallel', label: 'Parallel', description: 'Start concurrent branches.', category: 'flow', icon: GitFork, color: 'teal', keywords: ['fork', 'branch', 'concurrent'], defaults: {}, inputs: input, outputs: output, fields: [] },
  { type: 'join', label: 'Join', description: 'Wait for parallel branches.', category: 'flow', icon: GitMerge, color: 'teal', keywords: ['merge', 'converge', 'wait'], defaults: {}, inputs: input, outputs: output, fields: [] },
  { type: 'notification', label: 'Notification', description: 'Send a workflow update.', category: 'communication', icon: Bell, color: 'rose', keywords: ['notify', 'message', 'alert'], defaults: { channel: 'desktop', message: 'Workflow update' }, inputs: input, outputs: output, fields: [{ key: 'channel', label: 'Channel', kind: 'select', required: true, options: ['desktop', 'webhook', 'slack', 'smtp', 'teams'].map((value) => ({ label: value, value })) }, { key: 'message', label: 'Message', kind: 'textarea', required: true }] },
  { type: 'agent', label: 'AI agent', description: 'Run a configured ACP agent.', category: 'agents', icon: Bot, color: 'indigo', keywords: ['codex', 'claude', 'acp', 'ai'], defaults: { profileId: '', prompt: '' }, inputs: input, outputs: output, fields: [{ key: 'profileId', label: 'Agent profile', kind: 'resource', resource: 'agentProfiles', required: true }, { key: 'prompt', label: 'Prompt', kind: 'textarea', required: true }] },
]

const byType = new Map(specs.map((spec) => [spec.type, spec]))

function pluginSpec(type: WorkflowNodeType): WorkflowNodeSpec {
  const [, plugin = 'plugin', node = 'node'] = type.split(':')
  return { type, label: node, description: `Run ${plugin}'s ${node} node.`, category: 'plugins', icon: Braces, color: 'slate', keywords: ['plugin', plugin, node], defaults: {}, inputs: input, outputs: output, fields: [{ key: 'settings', label: 'Settings', kind: 'json' }] }
}

export function listWorkflowNodeSpecs(): WorkflowNodeSpec[] {
  return [...specs]
}

export function getWorkflowNodeSpec(type: WorkflowNodeType): WorkflowNodeSpec {
  return byType.get(type) ?? pluginSpec(type)
}

export function validateNodeConfig(node: WorkflowNode): NodeConfigIssue[] {
  const issues: NodeConfigIssue[] = []
  for (const field of getWorkflowNodeSpec(node.type).fields) {
    const value = node.config[field.key]
    if (field.required && (value === undefined || value === null || value === '')) {
      issues.push({ code: 'required_config', field: field.key, message: `${field.label} is required` })
      continue
    }
    if (field.kind === 'number' && value !== undefined && (typeof value !== 'number' || (field.min !== undefined && value < field.min))) {
      issues.push({ code: 'invalid_config', field: field.key, message: `${field.label} must be at least ${field.min ?? 0}` })
    }
  }
  return issues
}

const safe = (value: unknown) => typeof value === 'string' && value ? value : undefined

export function summarizeNode(node: WorkflowNode): string {
  switch (node.type) {
    case 'script': return safe(node.config.scriptId) ? `Script: ${node.config.scriptId}` : 'Choose a script'
    case 'api': return safe(node.config.requestId) ? `Request: ${node.config.requestId}` : 'Choose a request'
    case 'remote': return safe(node.config.profileId) ? `Profile: ${node.config.profileId}` : 'Choose a remote profile'
    case 'condition': return `${String(node.config.left ?? 'value')} ${String(node.config.operator ?? 'truthy').replaceAll('_', ' ')}`
    case 'delay': return `${Number(node.config.durationMs ?? 0)} ms`
    case 'approval': return safe(node.config.prompt) ?? 'Approval required'
    case 'notification': return safe(node.config.channel) ? `Channel: ${node.config.channel}` : 'Choose a channel'
    case 'agent': return safe(node.config.profileId) ? `Agent: ${node.config.profileId}` : 'Choose an agent profile'
    default: return getWorkflowNodeSpec(node.type).description
  }
}
