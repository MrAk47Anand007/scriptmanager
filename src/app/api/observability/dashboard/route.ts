import { observabilityError, observabilityRepository } from '@/lib/observability/api'
import { parseExecutionFilters } from '@/lib/observability/filters'

export async function GET(request: Request) {
  try { return Response.json(await observabilityRepository.getDashboard(parseExecutionFilters(new URL(request.url).searchParams))) }
  catch (error) { return observabilityError(error) }
}

