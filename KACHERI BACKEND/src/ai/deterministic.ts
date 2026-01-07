// src/ai/deterministic.ts
import crypto from "node:crypto";
import { sha256Hex } from "../utils/fs";

/** Stable stringify with sorted object keys (handles nested arrays/objects). */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return JSON.stringify(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  // functions/undefined/symbol → JSON.stringify rules
  return JSON.stringify(value);
}

/** Stable SHA-256 of any JSON-serializable value. */
export function stableHash(value: unknown): string {
  const s = stableStringify(value);
  return sha256Hex(Buffer.from(s, "utf8"));
}

/** Convert a seed string to a 32-bit unsigned int. */
export function seedToUint32(seed: string): number {
  const h = crypto.createHash("sha256").update(seed, "utf8").digest();
  return ((h[0] << 24) >>> 0) ^ (h[1] << 16) ^ (h[2] << 8) ^ h[3];
}

/** Mulberry32 PRNG — deterministic for a given seed. */
export function mulberry32(seedUint32: number) {
  let t = seedUint32 >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: deterministic alphanumeric string (for tests/IDs). */
export function seededRandomString(seed: string, length = 8): string {
  const rnd = mulberry32(seedToUint32(seed));
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rnd() * alphabet.length)];
  return out;
}
