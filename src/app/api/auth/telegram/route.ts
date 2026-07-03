import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Global simple in-memory rate limiting map
// Maps IP address -> { count, resetAt }
const ipCache = new Map<string, { count: number; resetAt: number }>();

// Clean up old rate limit keys every 10 minutes to prevent memory leaks
if (typeof global !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipCache.entries()) {
      if (now > data.resetAt) {
        ipCache.delete(ip);
      }
    }
  }, 600000);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
  const now = Date.now();

  // 1) Rate limiting check (max 10 login attempts per minute per IP)
  const limitInfo = ipCache.get(ip);
  if (limitInfo && now < limitInfo.resetAt) {
    if (limitInfo.count >= 10) {
      console.warn(`[Telegram Auth] Rate limit exceeded for IP: ${ip}`);
      return NextResponse.json({ error: ' محاولات كثيرة جداً. يرجى المحاولة لاحقاً.' }, { status: 429 });
    }
    limitInfo.count++;
  } else {
    ipCache.set(ip, { count: 1, resetAt: now + 60000 });
  }

  try {
    const body = await request.json();
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = body;

    // Check if token exists
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("[Telegram Auth] Missing TELEGRAM_BOT_TOKEN server variable.");
      return NextResponse.json({ error: 'فشل إعدادات تسجيل الدخول بالخادم.' }, { status: 500 });
    }

    // 2) Validate Telegram auth_date age (replay attack prevention)
    const authDateTime = Number(auth_date);
    const currentTimeSec = Math.floor(now / 1000);
    const timeDiff = currentTimeSec - authDateTime;

    if (isNaN(authDateTime) || timeDiff > 86400 || timeDiff < -120) {
      console.warn(`[Telegram Auth] Expired auth request from IP: ${ip} (auth_date: ${auth_date})`);
      return NextResponse.json({ error: 'طلب تسجيل الدخول تليجرام منتهي الصلاحية.' }, { status: 400 });
    }

    // 3) Validate Hash HMAC-SHA256 signature
    const secretKey = crypto.createHash('sha256').update(botToken).digest();

    const dataCheckFields: Record<string, string> = {};
    if (id !== undefined && id !== null) dataCheckFields.id = String(id);
    if (first_name) dataCheckFields.first_name = first_name;
    if (last_name) dataCheckFields.last_name = last_name;
    if (username) dataCheckFields.username = username;
    if (photo_url) dataCheckFields.photo_url = photo_url;
    if (auth_date !== undefined && auth_date !== null) dataCheckFields.auth_date = String(auth_date);

    const checkString = Object.keys(dataCheckFields)
      .sort()
      .map(key => `${key}=${dataCheckFields[key]}`)
      .join('\n');

    const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (expectedHash !== hash) {
      console.warn(`[Telegram Auth] Signature hash verification failed for IP: ${ip}`);
      return NextResponse.json({ error: 'فشل التحقق من صحة توقيع تليجرام. الطلب غير موثوق.' }, { status: 400 });
    }

    // 4) Supabase Admin Integration (using service role key to bypass RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Check if user already linked this Telegram ID
    const { data: profile, error: searchError } = await supabaseAdmin
      .from('profiles')
      .select('email, user_id')
      .eq('telegram_id', String(id))
      .maybeSingle();

    if (searchError) throw searchError;

    let targetEmail = '';

    if (profile) {
      // User exists
      targetEmail = profile.email;
    } else {
      // User is new, register a placeholder email
      targetEmail = `telegram_${id}@placeholder.local`;

      // Create new user in Supabase auth (triggers handle_new_user DDL database trigger)
      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        password: crypto.randomBytes(24).toString('hex'),
        email_confirm: true
      });

      if (createError) throw createError;

      // Update the automatically seeded profile row with Telegram metadata
      const fullName = first_name + (last_name ? ' ' + last_name : '');
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          telegram_id: String(id),
          telegram_username: username || null,
          full_name: fullName,
          avatar_url: photo_url || null
        })
        .eq('user_id', authUser.user.id);

      if (updateError) throw updateError;
    }

    // 5) Generate actual magiclink session link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail
    });

    if (linkError) throw linkError;

    // Parse the verification token hash from generated action link
    const actionUrl = new URL(linkData.properties.action_link);
    const tokenHash = actionUrl.searchParams.get('token_hash') || linkData.properties.hashed_token;

    return NextResponse.json({
      token_hash: tokenHash,
      email: targetEmail
    });

  } catch (err: any) {
    console.error(`[Telegram Auth] Server side exception for IP ${ip}:`, err);
    return NextResponse.json({ error: 'حدث خطأ داخلي أثناء تسجيل الدخول بالخادم.' }, { status: 500 });
  }
}
