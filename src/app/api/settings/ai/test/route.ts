import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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

  try {
    const { provider, apiKey, testMessage } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const prompt = testMessage || 'Hello, are you working?';

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: data.error?.message || 'OpenAI API returned an error',
        });
      }

      return NextResponse.json({
        success: true,
        response: data.choices?.[0]?.message?.content || '',
      });
    } else if (provider === 'deepseek') {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json({
          success: false,
          error: data.error?.message || 'DeepSeek API returned an error',
        });
      }

      return NextResponse.json({
        success: true,
        response: data.choices?.[0]?.message?.content || '',
      });
    }

    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Connection test failed' });
  }
}
