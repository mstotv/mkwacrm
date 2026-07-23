import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { processDueFollowUps } from '@/lib/follow-ups/runner'

/**
 * GET /api/follow-ups/cron
 *
 * Background job to process due pending follow-ups.
 * Safe from concurrent runs via a row-level claim step.
 *
 * Auth: x-cron-secret header matching AUTOMATION_CRON_SECRET env variable.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }

  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)

  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const processedCount = await processDueFollowUps()
  return NextResponse.json({ processed: processedCount })
}
