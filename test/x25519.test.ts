import { describe, expect, it } from "vitest";
import { x25519, x25519Base } from "../src/x25519";

function fromHex(value: string): Uint8Array {
  return new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("x25519", () => {
  // RFC 7748 §5.2 test vectors.
  it("matches the first RFC 7748 vector", () => {
    const scalar = fromHex("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4");
    const point = fromHex("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c");
    expect(toHex(x25519(scalar, point))).toBe(
      "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552",
    );
  });

  it("matches the second RFC 7748 vector", () => {
    const scalar = fromHex("4b66e9d4d1b4673c5ad22691957d6af5c11b6421e0ea01d42ca4169e7918ba0d");
    const point = fromHex("e5210f12786811d3f4b7959d0538ae2c31dbe7106fc03c3efc4cd549c715a493");
    expect(toHex(x25519(scalar, point))).toBe(
      "95cbde9476e8907d7aade45cb4b873f88b595a68799fa152e6f8f7647aac7957",
    );
  });

  it("derives the RFC 7748 §6.1 public key from the base point", () => {
    const alicePrivate = fromHex(
      "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a",
    );
    expect(toHex(x25519Base(alicePrivate))).toBe(
      "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
    );
  });

  it("clamps the scalar, so neighbouring inputs collide on purpose", () => {
    const scalar = new Uint8Array(32).fill(1);
    const tweaked = scalar.slice();
    tweaked[0] |= 0x07;
    expect(toHex(x25519Base(scalar))).toBe(toHex(x25519Base(tweaked)));
    expect(x25519Base(scalar)).toHaveLength(32);
  });
});
