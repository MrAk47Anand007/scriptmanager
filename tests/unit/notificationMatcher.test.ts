import { describe, expect, it } from 'vitest'
import { createExecutionEvent } from '@/lib/execution/events'
import { matchesNotificationRule } from '@/lib/notifications/matcher'
import { renderNotification } from '@/lib/notifications/template'

const event=createExecutionEvent({type:'execution.failed',executionKind:'workflow',correlationId:'corr',actor:{type:'user',id:'u'},target:{type:'workflow',id:'w',name:'Deploy'},data:{password:'secret',environment:'prod'}})
describe('notification matching and templates',()=>{
  it('matches typed events and filters',()=>expect(matchesNotificationRule(event,'execution.failed','{"environment":"prod"}')).toBe(true))
  it('renders bounded redacted templates',()=>expect(renderNotification('{"title":"{{type}}","body":"{{password}} {{target}}"}',event)).toMatchObject({title:'execution.failed',body:'[REDACTED] Deploy'}))
})
