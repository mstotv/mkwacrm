interface EvolutionResponse {
  instance?: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
  hash?: {
    apikey: string;
  };
  qrcode?: {
    base64?: string;
    code?: string;
  };
  code?: string;
  base64?: string;
  status?: string;
  error?: string;
  message?: string | string[];
  response?: {
    message?: string | string[];
  };
  pairingCode?: string;
}

const DEFAULT_URL = process.env.NEXT_PUBLIC_EVOLUTION_API_URL || 'http://localhost:8080';
const GLOBAL_KEY = process.env.EVOLUTION_API_KEY || '';

function getApiUrl(customUrl?: string | null): string {
  const url = (customUrl && customUrl.trim()) ? customUrl.trim() : DEFAULT_URL;
  return url.replace(/\/+$/, '');
}

/** Validate that a string is safe for HTTP headers (ASCII-only). */
function isAsciiSafe(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return false;
  }
  return true;
}

/** Prefer instance token if ASCII-safe, otherwise fall back to global key. */
function resolveApiKey(instanceToken?: string): string {
  if (instanceToken && isAsciiSafe(instanceToken)) return instanceToken;
  return GLOBAL_KEY;
}

function extractMessage(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

/**
 * POST /instance/create
 * Returns the QR code base64 if present in the create response.
 */
export async function createEvolutionInstance(
  instanceName: string,
  token: string,
  _number: string,
  customUrl?: string | null
): Promise<{ qrBase64: string; alreadyExists: boolean }> {
  const url = `${getApiUrl(customUrl)}/instance/create`;

  const payload: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  };

  // Only include token if it's a real, ASCII-safe value
  if (token && isAsciiSafe(token)) {
    payload.token = token;
  }

  console.log('[Evolution API] Creating instance:', { url, instanceName, hasToken: !!payload.token });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': GLOBAL_KEY,
    },
    body: JSON.stringify(payload),
  });

  const data: EvolutionResponse = await response.json();
  console.log('[Evolution API] Create response:', {
    status: response.status,
    instanceStatus: data.instance?.status,
    hasQr: !!(data.qrcode?.base64 || data.qrcode?.code || data.code || data.base64),
  });

  if (!response.ok) {
    // 409 = already exists — non-fatal
    if (response.status === 409) {
      return { qrBase64: '', alreadyExists: true };
    }
    // Some Evolution versions return 400 when instance already exists
    const errMsg = extractMessage(data.response?.message || data.message || data.error);
    if (errMsg.toLowerCase().includes('already')) {
      return { qrBase64: '', alreadyExists: true };
    }
    throw new Error(errMsg || `Evolution API error: ${response.status}`);
  }

  const qrBase64 =
    data.qrcode?.base64 ||
    data.qrcode?.code ||
    data.base64 ||
    data.code ||
    '';

  return { qrBase64, alreadyExists: false };
}

/**
 * GET /instance/connect/{instanceName}
 * Returns base64 QR or connected:true if the session is open.
 */
export async function getEvolutionQrCode(
  instanceName: string,
  token: string,
  customUrl?: string | null
): Promise<{ base64: string; connected: boolean }> {
  const apiUrl = getApiUrl(customUrl);
  const authKey = resolveApiKey(token);

  const endpoints = [
    `${apiUrl}/instance/connect/${instanceName}`,
    `${apiUrl}/instance/qrcode/${instanceName}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'apikey': authKey },
      });

      if (!response.ok) continue;

      const data: EvolutionResponse = await response.json();

      if (data.status === 'open' || data.instance?.status === 'open') {
        return { base64: '', connected: true };
      }

      const qr =
        data.qrcode?.base64 ||
        data.qrcode?.code ||
        data.base64 ||
        data.code ||
        '';

      if (qr) return { base64: qr, connected: false };
    } catch (_) {
      // try next endpoint
    }
  }

  return { base64: '', connected: false };
}

/**
 * POST /webhook/set/{instanceName}
 * Registers a webhook so Evolution pushes events (QR updates, connection changes)
 * to this platform. Called automatically after creating/reconnecting an instance.
 */
export async function setEvolutionWebhook(
  instanceName: string,
  token: string,
  webhookUrl: string,
  customUrl?: string | null
): Promise<boolean> {
  const apiUrl = getApiUrl(customUrl);
  const authKey = resolveApiKey(token);

  const url = `${apiUrl}/webhook/set/${instanceName}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': authKey,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: true,
          webhookBase64: true,
          events: [
            'QRCODE_UPDATED',
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
          ],
        },
      }),
    });

    const ok = response.ok;
    if (!ok) {
      const body = await response.text();
      console.warn('[Evolution API] Webhook set failed:', response.status, body);
    } else {
      console.log('[Evolution API] Webhook set successfully for:', instanceName, '->', webhookUrl);
    }
    return ok;
  } catch (err) {
    console.warn('[Evolution API] Webhook set error:', err);
    return false;
  }
}

/**
 * GET /instance/connectionState/{instanceName}
 */
export async function getEvolutionInstanceStatus(
  instanceName: string,
  token: string,
  customUrl?: string | null
): Promise<{ status: string; instanceName: string }> {
  const url = `${getApiUrl(customUrl)}/instance/connectionState/${instanceName}`;
  const authKey = resolveApiKey(token);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'apikey': authKey },
    });

    if (!response.ok) {
      return { status: 'disconnected', instanceName };
    }

    const data = await response.json();
    const status = data?.instance?.state || data?.instance?.status || data?.state || 'disconnected';
    return { status, instanceName };
  } catch {
    return { status: 'disconnected', instanceName };
  }
}

export async function logoutEvolutionInstance(
  instanceName: string,
  token: string,
  customUrl?: string | null
): Promise<boolean> {
  const url = `${getApiUrl(customUrl)}/instance/logout/${instanceName}`;
  const authKey = resolveApiKey(token);
  try {
    const response = await fetch(url, { method: 'DELETE', headers: { 'apikey': authKey } });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteEvolutionInstance(
  instanceName: string,
  token: string,
  customUrl?: string | null
): Promise<boolean> {
  const url = `${getApiUrl(customUrl)}/instance/delete/${instanceName}`;
  const authKey = resolveApiKey(token);
  try {
    const response = await fetch(url, { method: 'DELETE', headers: { 'apikey': authKey } });
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendEvolutionTextMessage(
  instanceName: string,
  token: string,
  to: string,
  text: string,
  customUrl?: string | null
): Promise<{ messageId: string }> {
  const url = `${getApiUrl(customUrl)}/message/sendText/${instanceName}`;
  const authKey = resolveApiKey(token);
  const cleanNumber = to.replace(/[^\d]/g, '');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': authKey,
    },
    body: JSON.stringify({
      number: cleanNumber,
      options: { delay: 500, presence: 'composing', linkPreview: false },
      textMessage: { text },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(extractMessage(data.message || data.error) || 'Failed to send Evolution message');
  }

  return { messageId: data.key?.id || data.messageId || `evo-${Date.now()}` };
}
