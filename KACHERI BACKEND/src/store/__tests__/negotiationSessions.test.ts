import { describe, it, expect } from "vitest";
import { NegotiationSessionsStore, validateStatus } from "../negotiationSessions.js";

/* ============= validateStatus ============= */

describe("validateStatus", () => {
  it("accepts draft", () => {
    expect(validateStatus("draft")).toBe(true);
  });

  it("accepts active", () => {
    expect(validateStatus("active")).toBe(true);
  });

  it("accepts awaiting_response", () => {
    expect(validateStatus("awaiting_response")).toBe(true);
  });

  it("accepts reviewing", () => {
    expect(validateStatus("reviewing")).toBe(true);
  });

  it("accepts settled", () => {
    expect(validateStatus("settled")).toBe(true);
  });

  it("accepts abandoned", () => {
    expect(validateStatus("abandoned")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(validateStatus("")).toBe(false);
  });

  it("rejects unknown status", () => {
    expect(validateStatus("pending")).toBe(false);
  });

  it("rejects close variations", () => {
    expect(validateStatus("Draft")).toBe(false);
    expect(validateStatus("ACTIVE")).toBe(false);
    expect(validateStatus("settled ")).toBe(false);
  });

  it("rejects random strings", () => {
    expect(validateStatus("open")).toBe(false);
    expect(validateStatus("closed")).toBe(false);
    expect(validateStatus("in_progress")).toBe(false);
  });
});

/* ============= NegotiationSessionsStore export ============= */

describe("NegotiationSessionsStore", () => {
  it("exports create as a function", () => {
    expect(typeof NegotiationSessionsStore.create).toBe("function");
  });

  it("exports getById as a function", () => {
    expect(typeof NegotiationSessionsStore.getById).toBe("function");
  });

  it("exports getByDoc as a function", () => {
    expect(typeof NegotiationSessionsStore.getByDoc).toBe("function");
  });

  it("exports getByWorkspace as a function", () => {
    expect(typeof NegotiationSessionsStore.getByWorkspace).toBe("function");
  });

  it("exports update as a function", () => {
    expect(typeof NegotiationSessionsStore.update).toBe("function");
  });

  it("exports updateCounts as a function", () => {
    expect(typeof NegotiationSessionsStore.updateCounts).toBe("function");
  });

  it("exports delete as a function", () => {
    expect(typeof NegotiationSessionsStore.delete).toBe("function");
  });

  it("exports count as a function", () => {
    expect(typeof NegotiationSessionsStore.count).toBe("function");
  });

  it("exports archiveStale as a function", () => {
    expect(typeof NegotiationSessionsStore.archiveStale).toBe("function");
  });

  it("exports validateStatus as a function", () => {
    expect(typeof NegotiationSessionsStore.validateStatus).toBe("function");
  });

  it("has exactly 10 exported methods", () => {
    const keys = Object.keys(NegotiationSessionsStore);
    expect(keys).toHaveLength(10);
  });
});
