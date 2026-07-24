/**
 * Next.js Instrumentation Hook
 * ────────────────────────────
 * This file runs ONCE when the Next.js server process starts (Node.js only,
 * not in the Edge runtime or browser). It is the correct place for:
 *   - Background polling workers (follow-ups, automations, etc.)
 *   - One-time startup initialization
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * ⚠️  This runs in the long-lived Node.js process, NOT in serverless lambdas.
 *      setInterval timers started here persist across requests.
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge, not browser)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Server started — booting background workers...')

    // ── Follow-up background worker ──────────────────────────────
    // Dynamically import to avoid bundling server-only modules in
    // the Edge runtime or the client bundle.
    const { startFollowUpBackgroundWorker } = await import('@/lib/follow-ups/runner')
    startFollowUpBackgroundWorker()

    console.log('[Instrumentation] ✅ Follow-up background worker registered.')
  }
}
