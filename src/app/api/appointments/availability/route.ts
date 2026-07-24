import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAvailability, findAvailableSlots } from '@/lib/appointments/booking-engine'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 })
    }

    const url = new URL(request.url)
    const dateTime = url.searchParams.get('dateTime')
    const date = url.searchParams.get('date')
    const serviceId = url.searchParams.get('service_id')
    const staffId = url.searchParams.get('staff_id')

    if (dateTime) {
      // Check single availability
      const result = await checkAvailability(profile.account_id, dateTime, serviceId, staffId)
      return NextResponse.json(result)
    }

    if (date) {
      // Find available slots for a date
      const slots = await findAvailableSlots(profile.account_id, date, serviceId, staffId)
      return NextResponse.json({ slots })
    }

    return NextResponse.json({ error: 'Missing parameter: either dateTime or date is required' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
