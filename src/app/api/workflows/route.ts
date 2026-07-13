import { apiError, workflowJson, workflowRepository } from '@/lib/workflows/api'

export async function GET() {
  const workflows = await workflowRepository.listWorkflows()
  return Response.json(workflows.map(workflowJson))
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    return Response.json(workflowJson(await workflowRepository.createDraft({ name: body.name, description: body.description, definition: body.definition })), { status: 201 })
  } catch (error) { return apiError(error) }
}
