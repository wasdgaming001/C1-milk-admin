// functions/api.js
// Cloudflare Pages Serverless Function that proxies requests to Google Apps Script

function buildCorsHeaders(request) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    // Do NOT echo the request origin, as that creates a security vulnerability.
    const corsOrigin = allowedOrigin === "*" ? "*" : allowedOrigin.replace(/\/$/, "");
    return {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        // Note: Do NOT set Access-Control-Allow-Credentials: true if Origin is "*"
        ...(corsOrigin !== "*" ? { "Access-Control-Allow-Credentials": "true" } : {})
    };
}

const jsonResponse = (statusCode, headers, payload) =>
  new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { ...headers, "Content-Type": "application/json" },
  });

const errorResponse = (statusCode, headers, code, message) =>
  jsonResponse(statusCode, headers, {
    success: false,
    error: { code, message },
  });

const getClientIP = (request) => {
  return request.headers.get("CF-Connecting-IP") || "unknown";
};

// Uses native Web Crypto API (no Node.js compatibility flags needed)
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex.slice(0, 16);
}

// --- VALIDATION HELPERS ---

const checkEnvironment = (env, corsHeaders) => {
  if (!env.APPS_SCRIPT_URL || !env.APP_SECRET) {
    return errorResponse(
      503,
      corsHeaders,
      "PROXY_MISCONFIGURED",
      "Proxy is missing required environment variables",
    );
  }
  return null;
};

function checkOrigin(request) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    // If allowedOrigin is "*", we accept any origin.
    if (allowedOrigin === "*") return true;

    return origin.toLowerCase() === allowedOrigin.toLowerCase().replace(/\/$/, "");
}

// fallow-ignore-next-line complexity
const parseAndValidateBody = async (request, corsHeaders) => {
  try {
    const text = await request.text();
    if (text.length > 102400) {
      return errorResponse(
        413,
        corsHeaders,
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds 100 KB",
      );
    }
    const body = JSON.parse(text);
    if (!body.action || typeof body.action !== "string") {
      return errorResponse(
        400,
        corsHeaders,
        "BAD_REQUEST",
        "action field is required",
      );
    }
    return { body };
  } catch {
    return errorResponse(400, corsHeaders, "BAD_REQUEST", "Invalid JSON");
  }
};

// fallow-ignore-next-line complexity
async function validateRequest(request, env, corsHeaders) {
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";

  const envCheck = checkEnvironment(env, corsHeaders);
  if (envCheck) return envCheck;

  const originCheck = checkOrigin(request);
  if (!originCheck) {
    return errorResponse(403, corsHeaders, "FORBIDDEN", "Origin not allowed");
  }

  const bodyCheck = await parseAndValidateBody(request, corsHeaders);
  if (bodyCheck instanceof Response) return bodyCheck; // It's an error response

  return bodyCheck; // { body: ... }
}

// --- UPSTREAM CALL ---

async function callAppsScript(env, body) {
  console.warn("[proxy] Calling upstream with action:", body.action);
  try {
    const controller = new AbortController();
    
    // ⏱️ INCREASED TIMEOUT: Apps Script operations like generateMonthBill 
    // or reconcileBillingLedger can take 10-20 seconds. 8s was too short.
    const timeoutId = setTimeout(() => controller.abort(), 25000); 

    const response = await fetch(env.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    const text = await response.text();
    console.warn(
      "[proxy] Final status:",
      response.status,
      "| Length:",
      text.length,
    );
    return { ok: true, status: response.status, text };
  } catch (err) {
    console.error("[proxy] Upstream call failed:", err.name, err.message);
    return { ok: false, error: err };
  }
}

// --- RESPONSE HANDLER ---
// fallow-ignore-next-line complexity
function handleUpstreamResponse(result, corsHeaders) {
  if (!result.ok) {
    const isTimeout = result.error?.name === "AbortError";
    return errorResponse(
      isTimeout ? 504 : 502,
      corsHeaders,
      isTimeout ? "GATEWAY_TIMEOUT" : "UPSTREAM_ERROR",
      result.error?.message || "Upstream error",
    );
  }

  let finalBody = result.text;
  try {
    JSON.parse(finalBody);
  } catch {
    console.error(
      "[proxy] Upstream returned non-JSON:",
      finalBody.substring(0, 200),
    );
    finalBody = JSON.stringify({
      success: false,
      error: {
        code: "UPSTREAM_NON_JSON",
        message:
          "Upstream returned a non-JSON response. Check Cloudflare logs.",
      },
    });
  }

  return new Response(finalBody, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// --- ROUTES ---

export async function onRequestOptions(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";
  const corsHeaders = buildCorsHeaders(origin, allowedOrigin);
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get("Origin") || "";
  const allowedOrigin = env.ALLOWED_ORIGIN || "*";
  const corsHeaders = buildCorsHeaders(origin, allowedOrigin);

  const validation = await validateRequest(request, env, corsHeaders);
  if (validation instanceof Response) return validation; // It's an error response

  const body = validation.body;
  
  // 🔒 Inject secret and IP hash so the backend trusts this request
  body.appSecret = env.APP_SECRET;
  body.ipHash = await hashIP(getClientIP(request));

  const result = await callAppsScript(env, body);
  
  return handleUpstreamResponse(result, corsHeaders);
}