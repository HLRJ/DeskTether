import { describe, expect, it } from "vitest";
import { ConfirmationError, ConfirmationStore } from "../src/confirmation.js";

describe("ConfirmationStore", () => {
  it("binds a token to the exact command and cwd and consumes it once", () => {
    let now = 1_000;
    const store = new ConfirmationStore({ ttlMs: 300_000, now: () => now });
    const issued = store.issue("git push origin main", "workspace");

    expect(issued.expiresInSeconds).toBe(300);
    expect(() => store.consume(issued.token, "git push origin other", "workspace"))
      .toThrow(ConfirmationError);
    expect(store.consume(issued.token, "git push origin main", "workspace")).toBe(true);
    expect(() => store.consume(issued.token, "git push origin main", "workspace"))
      .toThrow(ConfirmationError);
  });

  it("rejects expired tokens", () => {
    let now = 10_000;
    const store = new ConfirmationStore({ ttlMs: 300_000, now: () => now });
    const issued = store.issue("Remove-Item -Recurse temp", "workspace");

    now += 300_001;
    expect(() => store.consume(issued.token, "Remove-Item -Recurse temp", "workspace"))
      .toThrow(/expired/i);
  });
});
