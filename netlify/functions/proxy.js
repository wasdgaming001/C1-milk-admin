
import { createHash } from 'crypto';

// ── SECURE ENVIRONMENT VARIABLES ────────────────────────────────────────────
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APP_SECRET = process.env.APP_SECRET;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://c1milk.netlify.app";

// ── HELPERS ─────────────────────────────────────────────────────────────────
const buildCorsHeaders = (origin) => {
  // FIX: Changed /$/ to /\/$/ to actually strip trailing slashes
  const allow = ALLOWED_ORIGIN ? ALLOWED_ORIGIN.replace(/\/$/, '') : (origin || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const jsonResponse = (statusCode, headers, payload) => ({
  statusCode,
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const errorResponse = (statusCode, headers, code, message) =>
  jsonResponse(statusCode, headers, { success: false, error: { code, message } });

const getClientIP = (event) =>
  event.headers['x-nf-client-connection-ip'] ||
  (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  'unknown';

const hashIP = (ip) => createHash('sha256').update(ip).digest('hex').slice(0, 16);

// ── VALIDATION HELPERS (Extracted to reduce complexity) ─────────────────────
const checkEnvironment = (corsHeaders) => {
  if (!APPS_SCRIPT_URL || !APP_SECRET) {
    return errorResponse(503, corsHeaders, 'PROXY_MISCONFIGURED', 'Proxy is missing required environment variables');
  }
  return null;
};

const checkMethod = (event, corsHeaders) => {
  if (event.httpMethod === 'OPTIONS') return { preflight: true };
  if (event.httpMethod !== 'POST') return errorResponse(405, corsHeaders, 'METHOD_NOT_ALLOWED', 'Only POST is accepted');
  return null;
};

// fallow-ignore-next-line complexity
export const checkOrigin = (event, corsHeaders) => {
  // FIX: Changed /$/ to /\/$/
  const origin = (event.headers['origin'] || event.headers['Origin'] || '').replace(/\/$/, '');
  if (ALLOWED_ORIGIN && origin.toLowerCase() !== ALLOWED_ORIGIN.replace(/\/$/, '').toLowerCase()) {
    return errorResponse(403, corsHeaders, 'FORBIDDEN', 'Origin not allowed');
  }
  return null;
};

const checkBodySize = (event, corsHeaders) => {
  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > 102400) {
    return errorResponse(413, corsHeaders, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 100 KB');
  }
  return null;
};

// fallow-ignore-next-line complexity
export const parseAndValidateBody = (event, corsHeaders) => {
  try {
    const body = JSON.parse(event.body || '');
    if (!body.action || typeof body.action !== 'string') {
      return errorResponse(400, corsHeaders, 'BAD_REQUEST', 'action field is required');
    }
    return { body };
  } catch {
    return errorResponse(400, corsHeaders, 'BAD_REQUEST', 'Invalid JSON');
  }
};

// ── VALIDATION (Now extremely low complexity) ───────────────────────────────
// fallow-ignore-next-line complexity
export function validateRequest(event, corsHeaders) {
  // The || operator returns the first truthy value. 
  // If a check fails, it returns an error object (truthy) and stops.
  // If it passes, it returns null (falsy) and moves to the next check.
  return (
    checkEnvironment(corsHeaders) || // Check env first!
    checkMethod(event, corsHeaders) ||
    checkOrigin(event, corsHeaders) ||
    checkBodySize(event, corsHeaders) ||
    parseAndValidateBody(event, corsHeaders)
  );
}

// ── UPSTREAM CALL ───────────────────────────────────────────────────────────
async function callAppsScript(body) {
  console.log('[proxy] Calling upstream with action:', body.action);
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    const text = await response.text();
    console.log('[proxy] Final status:', response.status, '| Length:', text.length);
    return { ok: true, status: response.status, text };
  } catch (err) {
    console.error('[proxy] Upstream call failed:', err.name, err.message);
    return { ok: false, error: err };
  }
}

// ── RESPONSE HANDLER (Extracted to reduce complexity) ───────────────────────
// fallow-ignore-next-line complexity
export function handleUpstreamResponse(result, corsHeaders) {
  if (!result.ok) {
    const isTimeout = result.error?.name === 'TimeoutError' || result.error?.name === 'AbortError';
    return errorResponse(
      isTimeout ? 504 : 502,
      corsHeaders,
      isTimeout ? 'GATEWAY_TIMEOUT' : 'UPSTREAM_ERROR',
      result.error?.message || 'Upstream error'
    );
  }

  let finalBody = result.text;
  try {
    JSON.parse(finalBody);
  } catch {
    console.error('[proxy] Upstream returned non-JSON:', finalBody.substring(0, 200));
    finalBody = JSON.stringify({
      success: false,
      error: { code: 'UPSTREAM_NON_JSON', message: 'Upstream returned a non-JSON response. Check Netlify logs.' },
    });
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: finalBody,
  };
}

// ── MAIN HANDLER (Now extremely low complexity) ─────────────────────────────
// fallow-ignore-next-line complexity
export const handler = async function (event) {
  // FIX: Changed /$/ to /\/$/
  const origin = (event.headers['origin'] || event.headers['Origin'] || '').replace(/\/$/, '');
  const corsHeaders = buildCorsHeaders(origin);

  const validation = validateRequest(event, corsHeaders);
  if (validation.preflight) return { statusCode: 204, headers: corsHeaders, body: '' };
  if (validation.statusCode) return validation; // It's an error response

  const body = validation.body;
  body.appSecret = APP_SECRET;
  body.ipHash = hashIP(getClientIP(event));

  const result = await callAppsScript(body);
  return handleUpstreamResponse(result, corsHeaders);
};