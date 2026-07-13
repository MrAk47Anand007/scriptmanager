import { apiError, workflowRepository } from '@/lib/workflows/api'
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await workflowRepository.getRun((await params).id)) } catch (error) { return apiError(error) }
}
