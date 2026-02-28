import { describe, it, expect } from "vitest";
import { CounterproposalGenerator } from "../counterproposalGenerator.js";
import type { NegotiationChange } from "../../store/negotiationChanges.js";

/* ============= helpers ============= */

function makeChange(overrides: Partial<NegotiationChange> = {}): NegotiationChange {
  return {
    id: "chg_test",
    sessionId: "sess_test",
    roundId: "rnd_test",
    changeType: "replace",
    category: "substantive",
    sectionHeading: null,
    originalText: "Original clause text",
    proposedText: "Proposed clause text",
    fromPos: 0,
    toPos: 100,
    status: "pending",
    suggestionId: null,
    riskLevel: null,
    aiAnalysis: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/* ============= parseResponse ============= */

describe("parseResponse", () => {
  it("parses valid JSON directly", () => {
    const json = JSON.stringify({
      proposedText: "Compromise language here",
      rationale: "This is a fair middle ground",
      changesFromYours: "Reduced cap",
      changesFromTheirs: "Increased protection",
      preserves: "Key terms preserved",
    });

    const result = CounterproposalGenerator.parseResponse(json);
    expect(result.proposedText).toBe("Compromise language here");
    expect(result.rationale).toBe("This is a fair middle ground");
    expect(result.changesFromYours).toBe("Reduced cap");
    expect(result.changesFromTheirs).toBe("Increased protection");
    expect(result.preserves).toBe("Key terms preserved");
  });

  it("extracts JSON from markdown code blocks", () => {
    const wrapped = '```json\n{"proposedText":"Compromise","rationale":"Fair deal","changesFromYours":"Minor","changesFromTheirs":"Minor","preserves":"Core terms"}\n```';

    const result = CounterproposalGenerator.parseResponse(wrapped);
    expect(result.proposedText).toBe("Compromise");
    expect(result.rationale).toBe("Fair deal");
  });

  it("normalizes snake_case keys to camelCase", () => {
    const json = JSON.stringify({
      proposedText: "Compromise text",
      rationale: "Fair balance",
      changes_from_yours: "Your concession",
      changes_from_theirs: "Their concession",
      preserves: "Key terms",
    });

    const result = CounterproposalGenerator.parseResponse(json);
    expect(result.changesFromYours).toBe("Your concession");
    expect(result.changesFromTheirs).toBe("Their concession");
  });

  it("handles camelCase keys directly", () => {
    const json = JSON.stringify({
      proposedText: "Text",
      rationale: "Reason",
      changesFromYours: "Direct camelCase",
      changesFromTheirs: "Direct camelCase too",
      preserves: "All",
    });

    const result = CounterproposalGenerator.parseResponse(json);
    expect(result.changesFromYours).toBe("Direct camelCase");
    expect(result.changesFromTheirs).toBe("Direct camelCase too");
  });

  it("throws on invalid input", () => {
    expect(() => {
      CounterproposalGenerator.parseResponse("This is not JSON");
    }).toThrow();
  });

  it("throws when required fields are missing", () => {
    const json = JSON.stringify({
      rationale: "Has rationale but no proposedText",
    });

    expect(() => {
      CounterproposalGenerator.parseResponse(json);
    }).toThrow();
  });

  it("throws when proposedText is empty", () => {
    const json = JSON.stringify({
      proposedText: "",
      rationale: "Some rationale",
    });

    expect(() => {
      CounterproposalGenerator.parseResponse(json);
    }).toThrow();
  });

  it("defaults missing optional fields to empty string", () => {
    const json = JSON.stringify({
      proposedText: "Compromise",
      rationale: "Fair",
    });

    const result = CounterproposalGenerator.parseResponse(json);
    expect(result.changesFromYours).toBe("");
    expect(result.changesFromTheirs).toBe("");
    expect(result.preserves).toBe("");
  });
});

/* ============= buildPrompt ============= */

describe("buildPrompt", () => {
  const emptyGathered = {
    historicalEntities: [],
    clauseMatches: [],
    compliancePolicies: [],
    historicalContext: null,
  };

  it("includes mode directive for balanced", () => {
    const change = makeChange();
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "balanced", ctx, emptyGathered);
    expect(prompt).toContain("balanced");
    expect(prompt).toContain("fair compromise");
  });

  it("includes mode directive for favorable", () => {
    const change = makeChange();
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "favorable", ctx, emptyGathered);
    expect(prompt).toContain("favorable");
    expect(prompt).toContain("leans toward");
  });

  it("includes mode directive for minimal_change", () => {
    const change = makeChange();
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "minimal_change", ctx, emptyGathered);
    expect(prompt).toContain("minimal_change");
    expect(prompt).toContain("smallest possible modification");
  });

  it("includes original and proposed text", () => {
    const change = makeChange({
      originalText: "Liability cap of $1M",
      proposedText: "Liability cap of $500K",
    });
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "balanced", ctx, emptyGathered);
    expect(prompt).toContain("Liability cap of $1M");
    expect(prompt).toContain("Liability cap of $500K");
  });

  it("includes section heading when present", () => {
    const change = makeChange({ sectionHeading: "Indemnification" });
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "balanced", ctx, emptyGathered);
    expect(prompt).toContain("Indemnification");
  });

  it("includes document type", () => {
    const change = makeChange();
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1", documentType: "contract" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "balanced", ctx, emptyGathered);
    expect(prompt).toContain("contract");
  });

  it("adds short text note for changes under 50 chars", () => {
    const change = makeChange({
      originalText: "Short",
      proposedText: "Tiny",
    });
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", createdBy: "user_1" };

    const prompt = CounterproposalGenerator.buildPrompt(change, "balanced", ctx, emptyGathered);
    expect(prompt).toContain("very short");
  });
});

/* ============= export structure ============= */

describe("CounterproposalGenerator export", () => {
  it("exports all expected methods", () => {
    expect(typeof CounterproposalGenerator.generate).toBe("function");
    expect(typeof CounterproposalGenerator.buildPrompt).toBe("function");
    expect(typeof CounterproposalGenerator.parseResponse).toBe("function");
    expect(typeof CounterproposalGenerator.gatherContext).toBe("function");
  });
});
