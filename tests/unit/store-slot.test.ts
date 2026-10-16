import { describe, expect, it } from "vitest";
import { nextStore, syncName } from "../../src/pwa/store-slot";

describe("the stores of a device", () => {
  it("are numbered from the first, which keeps its names", () => {
    expect(nextStore("riglam")).toBe("riglam-2");
    expect(nextStore("riglam-2")).toBe("riglam-3");
    expect(syncName("riglam")).toBe("riglam-sync");
  });

  it("have an outbox each, so a new store starts with no cursor and an old tab keeps its own", () => {
    expect(syncName("riglam-2")).toBe("riglam-2-sync");
    expect(syncName("riglam-2")).not.toBe(syncName("riglam"));
  });
});
