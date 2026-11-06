import { describe, expect, it } from "vitest";
import { configuredKeys, extractKey, isAuthorized, safeEqual } from "../src/auth";

const BASE = new URL("https://warp.test/device");

function request(headers: Record<string, string> = {}): Request {
  return new Request(BASE, { headers });
}

describe("keys", () => {
  it("splits comma separated secrets and trims them", () => {
    expect(configuredKeys({ REGIS_KEY: " a , b ,, " })).toEqual(["a", "b"]);
    expect(configuredKeys({})).toEqual([]);
  });

  it("compares in constant time without throwing on length mismatches", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secre")).toBe(false);
  });
});

describe("authorization", () => {
  const keyed = { REGIS_KEY: "key-one,key-two" };

  it("stays open when no key is configured", () => {
    expect(isAuthorized(request(), BASE, {})).toBe(true);
  });

  it("accepts a bearer token", () => {
    expect(isAuthorized(request({ Authorization: "Bearer key-two" }), BASE, keyed)).toBe(true);
    expect(isAuthorized(request({ Authorization: "bearer key-one" }), BASE, keyed)).toBe(true);
  });

  it("accepts the query parameter", () => {
    const url = new URL("https://warp.test/regis?key=key-one");
    expect(isAuthorized(request(), url, keyed)).toBe(true);
    expect(extractKey(request(), url)).toBe("key-one");
  });

  it("prefers the header over the query parameter", () => {
    const url = new URL("https://warp.test/device?key=wrong");
    expect(extractKey(request({ Authorization: "Bearer key-two" }), url)).toBe("key-two");
    expect(isAuthorized(request({ Authorization: "Bearer key-two" }), url, keyed)).toBe(true);
  });

  it("rejects missing or wrong keys", () => {
    expect(isAuthorized(request(), BASE, keyed)).toBe(false);
    expect(isAuthorized(request({ Authorization: "Bearer nope" }), BASE, keyed)).toBe(false);
    expect(isAuthorized(request(), new URL("https://warp.test/device?key=nope"), keyed)).toBe(false);
  });
});
