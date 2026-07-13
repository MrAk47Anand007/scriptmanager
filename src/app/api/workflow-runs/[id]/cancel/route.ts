import { apiError, workflowRepository } from '@/lib/workflows/api'
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await workflowRepository.requestCancellation((await params).id)) } catch (error) { return apiError(error) }
}
