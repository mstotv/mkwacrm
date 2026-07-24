import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { processDueFollowUps } from '@/lib/follow-ups/runner'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/follow-ups/cron
 *
 * Background job to process due pending follow-ups.
 * Safe from concurrent runs via a mutex in the runner.
 *
 * Accepts two authentication methods:
 * 1. Cron header: x-cron-secret matching AUTOMATION_CRON_SECRET (for external schedulers)
 * 2. Session cookie: authenticated Supabase user (for manual trigger from Dashboard)
 */
export async function GET(request: Request) {
  // --- Auth Method 1: Cron Secret (external scheduler) ---
  const expected = process.env.AUTOMATION_CRON_SECRET
  const supplied = request.headers.get('x-cron-secret') ?? ''

  if (expected && supplied) {
    const suppliedBuf = Buffer.from(supplied)
    const expectedBuf = Buffer.from(expected)
    if (
      suppliedBuf.length === expectedBuf.length &&
      timingSafeEqual(suppliedBuf, expectedBuf)
    ) {
      const processedCount = await processDueFollowUps()
      return NextResponse.json({ success: true, processed: processedCount, source: 'cron' })
    }
  }

  // --- Auth Method 2: Authenticated Session (manual trigger from Dashboard) ---
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const processedCount = await processDueFollowUps()
      return NextResponse.json({ success: true, processed: processedCount, source: 'manual' })
    }
  } catch (_) {}

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
