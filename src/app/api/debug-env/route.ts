import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    GOOGLE_CLIENT_ID_exists: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET_exists: !!process.env.GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || null
  })
}
