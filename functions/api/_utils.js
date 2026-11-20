/**
 * Utilidades compartidas para Cloudflare Pages Functions
 * Implementa Web Crypto API nativa (sin dependencias npm).
 */

const DEFAULT_SECRET = 'vozepub_pro_secret_key_change_in_cf_vars_2026';

// Respuestas JSON estandarizadas
export function jsonResponse(data, status = 200, customHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...customHeaders
    }
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: true, message }, status);
}

// Conversión Base64 URL Safe
function toBase64Url(uint8Array) {
  let str = '';
  for (let i = 0; i < uint8Array.length; i++) {
    str += String.fromCharCode(uint8Array[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

// --- Criptografía con Web Crypto API (PBKDF2) ---

export async function hashPassword(password, saltHex = null) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return {
    hash: bytesToHex(new Uint8Array(derived)),
    salt: bytesToHex(salt)
  };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// --- Firma y Verificación de JWT (HMAC-SHA256) ---

export async function signJWT(payload, secret = DEFAULT_SECRET) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const encodedHeader = toBase64Url(enc.encode(JSON.stringify(header)));
  const encodedPayload = toBase64Url(enc.encode(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 días
  })));

  const tokenData = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(tokenData));
  return `${tokenData}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJWT(token, secret = DEFAULT_SECRET) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const tokenData = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = fromBase64Url(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(tokenData));
    if (!valid) return null;

    const payloadJson = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(payloadJson);

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expirado
    }

    return payload;
  } catch {
    return null;
  }
}

// Extrae el usuario autenticado desde los Headers o Cookies de la petición
export async function getAuthUser(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  let token = null;

  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Buscar en cookies
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/vozepub_token=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;

  const secret = env.JWT_SECRET || DEFAULT_SECRET;
  const payload = await verifyJWT(token, secret);
  if (!payload || !payload.sub) return null;

  // Si Cloudflare D1 está configurado, verificar que el usuario exista
  if (env.DB) {
    const user = await env.DB.prepare('SELECT id, email, name, provider, avatar_url FROM users WHERE id = ?')
      .bind(payload.sub)
      .first();
    return user || null;
  }

  // Fallback si DB aún no está enlazada
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0]
  };
}
