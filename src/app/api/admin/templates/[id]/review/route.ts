import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client to bypass tenant RLS policies
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _adminClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid template ID format.' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify platform role of the caller
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('platform_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Failed to retrieve user profile.' }, { status: 500 });
    }

    const isPlatformAdmin =
      profile.platform_role === 'super_admin' ||
      profile.platform_role === 'assistant_admin';

    if (!isPlatformAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Platform admin privileges required.' },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { action, reason } = body;
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Action must be approve or reject.' }, { status: 400 });
    }

    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const updateData: Record<string, any> = {
      status,
      rejection_reason: action === 'reject' ? reason || 'Rejected by platform admin' : null,
      submission_error: null,
      updated_at: new Date().toISOString()
    };

    const { data: updatedTemplate, error: updateErr } = await supabaseAdmin()
      .from('message_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[Admin Review API] Update failed:', updateErr);
      return NextResponse.json({ error: `Update failed: ${updateErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, template: updatedTemplate });
  } catch (error: any) {
    console.error('[Admin Review API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
