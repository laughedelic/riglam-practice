// The access proof (src/ai/proof.ts): made in the browser, checked in the Worker, with the same code.
import { describe, expect, it } from "vitest";
import { generateKey } from "../../src/data/course.js";
import { DEVICE_ID, checkProof, makeProof, newDeviceId } from "../../src/ai/proof";

describe("device ids", () => {
  it("are random, 22 characters and accepted by the pattern", () => {
    const a = newDeviceId();
    expect(a).toMatch(DEVICE_ID);
    expect(a).toHaveLength(22);
    expect(newDeviceId()).not.toBe(a);
  });
});

describe("proof", () => {
  it("checks out for the device and key it was made for", async () => {
    const key = generateKey();
    const device = newDeviceId();
    const proof = await makeProof(key, device);
    expect(proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await makeProof(key, device)).toBe(proof);
    expect(await checkProof(key, device, proof)).toBe(true);
  });

  it("does not check out for another device, another key or an altered proof", async () => {
    const key = generateKey();
    const device = newDeviceId();
    const proof = await makeProof(key, device);
    expect(await checkProof(key, newDeviceId(), proof)).toBe(false);
    expect(await checkProof(generateKey(), device, proof)).toBe(false);
    const flipped = (proof[0] === "A" ? "B" : "A") + proof.slice(1);
    expect(await checkProof(key, device, flipped)).toBe(false);
  });

  it("says no, and does not throw, to anything that is not a proof", async () => {
    const key = generateKey();
    const device = newDeviceId();
    for (const bad of ["", "short", "!".repeat(43), "A".repeat(44)]) expect(await checkProof(key, device, bad)).toBe(false);
    expect(await checkProof(key, "", await makeProof(key, device))).toBe(false);
    expect(await checkProof(key, "has spaces and is long enough!!", await makeProof(key, device))).toBe(false);
    expect(await checkProof("not a key", device, await makeProof(key, device))).toBe(false);
  });
});
