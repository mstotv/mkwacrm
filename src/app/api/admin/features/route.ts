import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Instantiate service role admin client
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

// Helper to check platform admin authorization
async function checkAdminAuth() {
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
    return { error: 'Unauthorized', status: 401 };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('platform_role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile || (profile.platform_role !== 'super_admin' && profile.platform_role !== 'assistant_admin')) {
    return { error: 'Forbidden. Admins only.', status: 403 };
  }

  return { success: true, supabaseAdmin: getSupabaseAdmin() };
}

export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data: features, error } = await auth.supabaseAdmin
      .from('plan_features_library')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name_en', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ features });
  } catch (err: any) {
    console.error('[Features GET] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await checkAdminAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { updates } = body; // Array of { id: string, feature_key: string | null }

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Invalid payload. updates must be an array.' }, { status: 400 });
    }

    // Execute updates
    for (const update of updates) {
      if (!update.id) continue;
      
      const keyVal = update.feature_key && update.feature_key.trim() !== '' 
        ? update.feature_key.trim().toLowerCase() 
        : null;

      const { error } = await auth.supabaseAdmin
        .from('plan_features_library')
        .update({ feature_key: keyVal })
        .eq('id', update.id);

      if (error) {
        // If there's a unique constraint violation (code 23505), return a specific error
        if ((error as any).code === '23505') {
          return NextResponse.json({ error: `رمز الميزة '${keyVal}' مستخدم بالفعل لميزة أخرى.` }, { status: 409 });
        }
        throw error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Features POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
