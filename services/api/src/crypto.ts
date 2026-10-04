const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(pepper: string): Promise<CryptoKey> {
  let key = keyCache.get(pepper);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(pepper),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keyCache.set(pepper, key);
  }
  return key;
}

/**
 * HMAC-SHA256(pepper, value) as lowercase hex. Used for install IDs and IP addresses,
 * which are never stored raw (LLD §3, DATA-2).
 */
export async function hmacHex(pepper: string, value: string): Promise<string> {
  if (!pepper) throw new Error("HASH_PEPPER is not configured");
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(pepper), encoder.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function stringToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

export function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}
