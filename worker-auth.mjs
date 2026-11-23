const project = 'elec114-sbs';
const issuer = `https://securetoken.google.com/${project}`;
const keysUrl = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const decoder = new TextDecoder();
let cachedKeys;
let cacheExpires = 0;

function bytes(base64url) {
  return Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

export async function requireAdmin(request) {
  try {
    const token = /^Bearer ([\w.-]+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
    const parts = token?.split('.');
    if (parts?.length !== 3 || token.length > 8192) throw new Error();
    const [header, payload, signature] = parts;
    const { alg, kid } = JSON.parse(decoder.decode(bytes(header)));
    const claims = JSON.parse(decoder.decode(bytes(payload)));
    const now = Math.floor(Date.now() / 1000);
    if (alg !== 'RS256' || typeof kid !== 'string' || claims.iss !== issuer ||
        claims.aud !== project || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128 ||
        !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now ||
        !Number.isInteger(claims.auth_time) || claims.auth_time > now || claims.admin !== true) throw new Error();
    if (!cachedKeys || Date.now() >= cacheExpires) {
      const response = await fetch(keysUrl);
      if (!response.ok) throw new Error();
      cachedKeys = (await response.json()).keys;
      cacheExpires = Date.now() + Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1] ?? 60) * 1000;
    }
    const jwk = cachedKeys.find((key) => key.kid === kid);
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(signature), new TextEncoder().encode(`${header}.${payload}`));
    if (verified) return { uid: claims.sub, token: claims };
  } catch { /* Invalid credentials receive the same response. */ }
  throw Object.assign(new Error('ต้องใช้บัญชีผู้ดูแลระบบ'), { code: 'permission-denied' });
}
