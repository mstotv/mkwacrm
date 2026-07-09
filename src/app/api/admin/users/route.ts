import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Re-usable helper to instantiate service role admin client
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify calling user is super_admin
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('platform_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.platform_role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden. Super Admin only.' }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Get Auth users list
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    // 2. Fetch profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, account_id, full_name, platform_role');
    if (profilesError) throw profilesError;

    // 3. Fetch accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('accounts')
      .select('id, name, is_blocked');
    if (accountsError) throw accountsError;

    // 4. Fetch subscriptions
    const { data: subscriptions, error: subsError } = await supabaseAdmin
      .from('account_subscriptions')
      .select(`
        account_id,
        status,
        current_period_end,
        plan:subscription_plans(id, name, display_name)
      `);
    if (subsError) throw subsError;

    // 5. Fetch plans list to return as metadata
    const { data: plans } = await supabaseAdmin.from('subscription_plans').select('id, name, display_name');

    // Join everything together
    const mappedUsers = users.map((u: any) => {
      const prof = profiles?.find((p: any) => p.user_id === u.id);
      const acc = prof ? accounts?.find((a: any) => a.id === prof.account_id) : null;
      const sub = acc ? subscriptions?.find((s: any) => s.account_id === acc.id) : null;

      const planData = (sub as any)?.plan;
      const planObj = Array.isArray(planData) ? planData[0] : planData;

      return {
        id: u.id,
        email: u.email || '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        full_name: prof?.full_name || 'غير معروف',
        platform_role: prof?.platform_role || 'user',
        account_id: prof?.account_id || null,
        is_blocked: acc?.is_blocked || false,
        plan_id: planObj?.id || null,
        plan_name: planObj?.name || 'free',
        plan_display_name: planObj?.display_name || 'Free',
        subscription_status: sub?.status || 'active',
        current_period_end: sub?.current_period_end || null
      };
    });

    return NextResponse.json({ users: mappedUsers, plans: plans || [] });

  } catch (err: any) {
    console.error('[Admin Users API GET] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch user list' }, { status: 550 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify calling user is super_admin
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('platform_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.platform_role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden. Super Admin only.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, targetUserId, targetEmail, accountId, planId, expiresAt } = body;
    const supabaseAdmin = getSupabaseAdmin();

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    // 1) IMPERSONATE START
    if (action === 'impersonate_start') {
      if (!targetUserId || !targetEmail) {
        return NextResponse.json({ error: 'Missing target user details' }, { status: 400 });
      }

      // Log action to audit log
      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId,
        target_email: targetEmail,
        action: 'impersonate_start',
        metadata: { ip }
      });

      // Generate magiclink login link
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: targetEmail
      });

      if (linkError) throw linkError;

      const actionUrl = new URL(linkData.properties.action_link);
      const tokenHash = actionUrl.searchParams.get('token_hash') || linkData.properties.hashed_token;

      return NextResponse.json({
        token_hash: tokenHash,
        email: targetEmail
      });
    }

    // 2) IMPERSONATE STOP
    if (action === 'impersonate_stop') {
      // Log action to audit log
      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId || null,
        target_email: targetEmail || null,
        action: 'impersonate_stop',
        metadata: { ip }
      });

      return NextResponse.json({ success: true });
    }

    // 3) RESET PASSWORD
    if (action === 'reset_password') {
      if (!targetUserId || !targetEmail) {
        return NextResponse.json({ error: 'Missing target user details' }, { status: 400 });
      }

      // Generate a strong temporary password
      const tempPassword = crypto.randomBytes(6).toString('hex') + 'A1!';
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: tempPassword
      });

      if (updateError) throw updateError;

      // Log action to audit log
      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId,
        target_email: targetEmail,
        action: 'reset_password',
        metadata: { method: 'temporary_password', ip }
      });

      return NextResponse.json({ tempPassword });
    }

    // 4) UPDATE PLAN
    if (action === 'update_plan') {
      if (!accountId || !planId) {
        return NextResponse.json({ error: 'Missing account or plan parameters' }, { status: 400 });
      }

      // Update or create subscription row
      const { error: subError } = await supabaseAdmin
        .from('account_subscriptions')
        .upsert({
          account_id: accountId,
          plan_id: planId,
          status: 'active',
          payment_method: 'manual',
          current_period_end: expiresAt || '2099-12-31T23:59:59Z',
          updated_at: new Date().toISOString()
        }, { onConflict: 'account_id' });

      if (subError) throw subError;

      // Log action to audit log
      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId || null,
        target_email: targetEmail || null,
        action: 'manual_plan_update',
        metadata: { planId, expiresAt, ip }
      });

      return NextResponse.json({ success: true });
    }

    // 5) BLOCK ACCOUNT
    if (action === 'block') {
      if (!accountId) return NextResponse.json({ error: 'Missing account parameter' }, { status: 400 });

      const { error: blockError } = await supabaseAdmin
        .from('accounts')
        .update({ is_blocked: true })
        .eq('id', accountId);

      if (blockError) throw blockError;

      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId || null,
        target_email: targetEmail || null,
        action: 'block_account',
        metadata: { ip }
      });

      return NextResponse.json({ success: true });
    }

    // 6) UNBLOCK ACCOUNT
    if (action === 'unblock') {
      if (!accountId) return NextResponse.json({ error: 'Missing account parameter' }, { status: 400 });

      const { error: unblockError } = await supabaseAdmin
        .from('accounts')
        .update({ is_blocked: false })
        .eq('id', accountId);

      if (unblockError) throw unblockError;

      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId || null,
        target_email: targetEmail || null,
        action: 'unblock_account',
        metadata: { ip }
      });

      return NextResponse.json({ success: true });
    }

    // 7) DELETE USER
    if (action === 'delete') {
      if (!targetUserId) return NextResponse.json({ error: 'Missing target user parameter' }, { status: 400 });

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      if (deleteError) throw deleteError;

      await supabaseAdmin.from('admin_audit_logs').insert({
        admin_user_id: user.id,
        admin_email: user.email!,
        target_user_id: targetUserId,
        target_email: targetEmail || null,
        action: 'delete_account',
        metadata: { ip }
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err: any) {
    console.error('[Admin Users API POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Action execution failed' }, { status: 500 });
  }
}
