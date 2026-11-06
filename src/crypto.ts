/** Byte / encoding helpers plus the P-256 key handling used by the registrar. */

export function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function randomBase64(size: number): string {
  return toBase64(randomBytes(size));
}

export function randomHex(size: number): string {
  return [...randomBytes(size)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface P256KeyPair {
  /** SEC1 / RFC 5915 DER, base64. Matches Go's x509.MarshalECPrivateKey output. */
  privateKey: string;
  /** SPKI / X.509 SubjectPublicKeyInfo DER, base64. */
  publicKey: string;
}

export async function generateP256KeyPair(): Promise<P256KeyPair> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  const [pkcs8, spki] = await Promise.all([
    crypto.subtle.exportKey("pkcs8", pair.privateKey) as Promise<ArrayBuffer>,
    crypto.subtle.exportKey("spki", pair.publicKey) as Promise<ArrayBuffer>,
  ]);

  const pkcs8Bytes = new Uint8Array(pkcs8);
  const sec1 = pkcs8ToSec1(pkcs8Bytes);

  return {
    privateKey: toBase64(sec1 ?? pkcs8Bytes),
    publicKey: toBase64(new Uint8Array(spki)),
  };
}

interface Tlv {
  tag: number;
  valueStart: number;
  valueEnd: number;
}

/** Reads a single DER TLV header. Returns null on malformed input. */
function readTlv(buffer: Uint8Array, offset: number): Tlv | null {
  if (offset + 2 > buffer.length) return null;

  const tag = buffer[offset];
  let cursor = offset + 1;
  let length = buffer[cursor++];

  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || cursor + count > buffer.length) return null;
    length = 0;
    for (let index = 0; index < count; index += 1) {
      length = length * 256 + buffer[cursor++];
    }
  }

  const valueStart = cursor;
  const valueEnd = valueStart + length;
  if (valueEnd > buffer.length) return null;
  return { tag, valueStart, valueEnd };
}

/**
 * Extracts the inner SEC1 ECPrivateKey from a PKCS#8 blob:
 * SEQUENCE { INTEGER 0, SEQUENCE { OID ecPublicKey, OID prime256v1 }, OCTET STRING <SEC1> }
 */
export function pkcs8ToSec1(pkcs8: Uint8Array): Uint8Array | null {
  const outer = readTlv(pkcs8, 0);
  if (!outer || outer.tag !== 0x30) return null;

  let cursor = outer.valueStart;

  const version = readTlv(pkcs8, cursor);
  if (!version || version.tag !== 0x02) return null;
  cursor = version.valueEnd;

  const algorithm = readTlv(pkcs8, cursor);
  if (!algorithm || algorithm.tag !== 0x30) return null;
  cursor = algorithm.valueEnd;

  const key = readTlv(pkcs8, cursor);
  if (!key || key.tag !== 0x04) return null;

  const inner = readTlv(pkcs8, key.valueStart);
  if (!inner || inner.tag !== 0x30 || inner.valueEnd > key.valueEnd) return null;

  return pkcs8.slice(key.valueStart, key.valueEnd);
}
