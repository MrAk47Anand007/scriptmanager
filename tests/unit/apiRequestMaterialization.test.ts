import { describe, expect, it } from 'vitest'
import { materializeApiRequest, type MaterializableApiRequestDraft } from '@/lib/apiRequestMaterialization'

const draft: MaterializableApiRequestDraft = {
  name: 'Users', method: 'GET', url: '{{baseUrl}}/users/{{userId}}',
  headers: [{ key: 'Authorization', value: 'Bearer {{token}}', enabled: true }],
  queryParams: [], bodyType: 'none', body: '', authType: 'none', authConfig: {},
  variables: [{ key: 'userId', value: '42', enabled: true }],
}

describe('API request materialization', () => {
  it('applies request over environment over global precedence and reports unresolved names', () => {
    const result = materializeApiRequest(draft, {
      global: [{ key: 'baseUrl', value: 'https://global.test', enabled: true }],
      environment: [{ key: 'baseUrl', value: 'https://env.test', enabled: true }],
    })

    expect(result.url).toBe('https://env.test/users/42')
    expect(result.unresolvedVariables).toEqual(['token'])
  })
})
