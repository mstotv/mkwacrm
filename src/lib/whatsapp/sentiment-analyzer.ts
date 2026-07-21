import { createClient } from '@supabase/supabase-js';

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type SentimentCategory = 'positive' | 'neutral' | 'negative' | 'frustrated';
export type IntentCategory = 'ready_to_buy' | 'hesitant' | 'not_interested' | 'wants_appointment' | 'info_seeking' | 'unknown';
export type ConversationCategory = 'sales' | 'support' | 'complaint' | 'refund' | 'general' | 'unknown';

interface AnalysisResult {
  sentiment: SentimentCategory;
  score: number;
  intent: IntentCategory;
  category: ConversationCategory;
}

export async function analyzeSentimentAndSave(
  accountId: string,
  conversationId: string,
  messageText: string
) {
  try {
    // Check if AI is configured and active for this account
    const { data: aiConfig } = await adminSupabase
      .from('ai_config')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .maybeSingle();

    if (!aiConfig || !aiConfig.api_key) return;

    let result: AnalysisResult | null = null;
    
    if (aiConfig.provider === 'openai') {
      result = await analyzeWithOpenAI(messageText, aiConfig.api_key);
    } else if (aiConfig.provider === 'deepseek') {
      result = await analyzeWithDeepSeek(messageText, aiConfig.api_key);
    }

    if (result) {
      // Save sentiment, intent and category to conversation
      const { error } = await adminSupabase
        .from('conversations')
        .update({
          sentiment: result.sentiment,
          sentiment_score: result.score,
          intent: result.intent,
          category: result.category,
        })
        .eq('id', conversationId);

      if (error) {
        console.error('[SentimentAnalyzer] Failed to update conversation:', error);
      } else {
        console.log(`[SentimentAnalyzer] Conversation ${conversationId} updated to Sentiment: ${result.sentiment} (${result.score}), Intent: ${result.intent}, Category: ${result.category}`);
      }
    }
  } catch (error) {
    console.error('[SentimentAnalyzer] Error analyzing sentiment:', error);
  }
}

const SYSTEM_PROMPT = `You are an expert customer support sentiment, intent, and category analyzer. 
Analyze the following message and determine the customer's sentiment, buying intent, and the conversation category.

Sentiment Categories:
- "positive" (happy, satisfied, praising, thankful)
- "neutral" (just asking a question, normal tone, informational)
- "negative" (unhappy, complaining, disappointed)
- "frustrated" (angry, threatening, cursing, highly upset, using lots of exclamation marks)

Intent Categories:
- "ready_to_buy" (asks for price, payment link, how to buy, ready to proceed)
- "hesitant" (unsure, thinking about it, asking for discount, comparing with others)
- "not_interested" (says no, stop, unsubscribe, not buying, ignore)
- "wants_appointment" (asking for a call, meeting, demo, scheduling)
- "info_seeking" (just asking questions, inquiring about features, general questions)
- "unknown" (cannot determine intent)

Conversation Categories:
- "sales" (inquiring about products to buy, pricing, sales)
- "support" (asking for help, how to use a feature, technical issue, support)
- "complaint" (reporting a bad experience, complaining about service/product)
- "refund" (asking for money back, return, cancellation)
- "general" (greetings, non-specific chatter, general inquiry)
- "unknown" (cannot determine category)

You must reply with a valid JSON object ONLY, in this exact format:
{
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "score": <integer from 1 to 100, where 1 is extremely frustrated/negative, 50 is neutral, and 100 is extremely positive>,
  "intent": "ready_to_buy" | "hesitant" | "not_interested" | "wants_appointment" | "info_seeking" | "unknown",
  "category": "sales" | "support" | "complaint" | "refund" | "general" | "unknown"
}
Do not add any markdown formatting, just the raw JSON.`;

async function analyzeWithOpenAI(text: string, apiKey: string): Promise<AnalysisResult | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
      })
    });

    if (!response.ok) return null;

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    
    if (parsed.sentiment && parsed.intent) {
      return {
        sentiment: parsed.sentiment as SentimentCategory,
        score: typeof parsed.score === 'number' ? parsed.score : 50,
        intent: parsed.intent as IntentCategory,
        category: (parsed.category as ConversationCategory) || 'unknown',
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function analyzeWithDeepSeek(text: string, apiKey: string): Promise<AnalysisResult | null> {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
      })
    });

    if (!response.ok) return null;

    const resData = await response.json();
    const content = resData.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanContent);
    
    if (parsed.sentiment && parsed.intent) {
      return {
        sentiment: parsed.sentiment as SentimentCategory,
        score: typeof parsed.score === 'number' ? parsed.score : 50,
        intent: parsed.intent as IntentCategory,
        category: (parsed.category as ConversationCategory) || 'unknown',
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}
