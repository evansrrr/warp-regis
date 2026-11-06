import { describe, expect, it } from "vitest";
import { generateP256KeyPair, generateX25519KeyPair, pkcs8ToSec1, randomHex } from "../src/crypto";

function fromBase64(value: string): Uint8Array {
  return new Uint8Array([...atob(value)].map((char) => char.charCodeAt(0)));
}

describe("key generation", () => {
  it("exports a SEC1 EC private key for MASQUE", async () => {
    const pair = await generateP256KeyPair();
    const der = fromBase64(pair.privateKey);

    // SEQUENCE { INTEGER 1, OCTET STRING <32-byte scalar>, [0] params, [1] public key }
    expect(der[0]).toBe(0x30);
    expect(der[1]).toBe(der.length - 2);
    expect(der[2]).toBe(0x02);
    expect(der[4]).toBe(0x01);

    const spki = fromBase64(pair.publicKey);
    expect(spki[0]).toBe(0x30);
    expect(spki.length).toBe(91);
  });

  it("exports a clamped 32-byte scalar for WireGuard", () => {
    const pair = generateX25519KeyPair();
    const privateKey = fromBase64(pair.privateKey);

    expect(privateKey).toHaveLength(32);
    expect(privateKey[0] & 0x07).toBe(0);
    expect(privateKey[31] & 0x80).toBe(0);
    expect(privateKey[31] & 0x40).toBe(64);
    expect(fromBase64(pair.publicKey)).toHaveLength(32);
  });

  it("generates distinct keys and serials", () => {
    const a = generateX25519KeyPair();
    const b = generateX25519KeyPair();
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(randomHex(8)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("pkcs8ToSec1", () => {
  it("unwraps the PKCS#8 container into SEC1", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;

    const pkcs8 = new Uint8Array(
      (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer,
    );
    const sec1 = pkcs8ToSec1(pkcs8);

    expect(sec1).not.toBeNull();
    expect(sec1![0]).toBe(0x30);
    expect(sec1![2]).toBe(0x02);
    expect(sec1!.length).toBeLessThan(pkcs8.length);
  });

  it("rejects input that is not PKCS#8", () => {
    expect(pkcs8ToSec1(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
