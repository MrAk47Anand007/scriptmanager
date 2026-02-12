import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { registerSchedule, removeSchedule, getNextRunTime } from '@/lib/schedulerService'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  const nextRunTime = script.scheduleCron && script.scheduleEnabled
    ? getNextRunTime(script.scheduleCron)
    : null

  return NextResponse.json({
    schedule_cron: script.scheduleCron,
    schedule_enabled: script.scheduleEnabled,
    next_run_time: nextRunTime
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { cron, enabled } = await req.json()

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  // Validate cron expression
  if (cron) {
    const nextRun = getNextRunTime(cron)
    if (nextRun === null && cron.trim() !== '') {
      return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 })
    }
  }

  const updated = await prisma.script.update({
    where: { id },
    data: {
      scheduleCron: cron || null,
      scheduleEnabled: enabled ?? false
    }
  })

  // Update the in-memory scheduler
  if (updated.scheduleEnabled && updated.scheduleCron) {
    registerSchedule(updated)
  } else {
    removeSchedule(id)
  }

  const nextRunTime = updated.scheduleCron && updated.scheduleEnabled
    ? getNextRunTime(updated.scheduleCron)
    : null

  return NextResponse.json({
    schedule_cron: updated.scheduleCron,
    schedule_enabled: updated.scheduleEnabled,
    next_run_time: nextRunTime
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const script = await prisma.script.findUnique({ where: { id } })
  if (!script) {
    return NextResponse.json({ error: 'Script not found' }, { status: 404 })
  }

  await prisma.script.update({
    where: { id },
    data: { scheduleCron: null, scheduleEnabled: false }
  })

  removeSchedule(id)

  return NextResponse.json({ message: 'Schedule removed' })
}
