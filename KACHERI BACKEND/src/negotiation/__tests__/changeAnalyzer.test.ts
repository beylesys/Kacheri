import { describe, it, expect } from "vitest";
import { ChangeAnalyzer } from "../changeAnalyzer.js";
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
    originalText: "Old text",
    proposedText: "New text",
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

/* ============= estimateRiskLevel ============= */

describe("estimateRiskLevel", () => {
  it("returns low for editorial changes", () => {
    const change = makeChange({ category: "editorial" });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("low");
  });

  it("returns medium for structural changes", () => {
    const change = makeChange({ category: "structural" });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("medium");
  });

  it("returns high for monetary amounts", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "The fee is $500,000 per year.",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("high");
  });

  it("returns high for liability keywords", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "The liability cap shall not exceed the contract value.",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("high");
  });

  it("returns high for indemnification keywords", () => {
    const change = makeChange({
      category: "substantive",
      originalText: "Indemnification clause revised.",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("high");
  });

  it("returns high for negative modal verbs", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "The vendor shall not provide any warranty.",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("high");
  });

  it("returns medium for percentages", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "The service level target is 99.5%.",
      originalText: "",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("medium");
  });

  it("returns medium for obligation modals", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "The vendor shall deliver the goods on time.",
      originalText: "",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("medium");
  });

  it("returns medium as default for substantive without specific triggers", () => {
    const change = makeChange({
      category: "substantive",
      originalText: "Some generic text here.",
      proposedText: "Different generic text here.",
    });
    expect(ChangeAnalyzer.estimateRiskLevel(change)).toBe("medium");
  });
});

/* ============= extractQueryTerms ============= */

describe("extractQueryTerms", () => {
  it("extracts words 4+ chars", () => {
    const terms = ChangeAnalyzer.extractQueryTerms("The big liability clause is important");
    expect(terms).toContain("liability");
    expect(terms).toContain("clause");
    expect(terms).toContain("important");
    // "The", "big", "is" should be excluded (< 4 chars)
    expect(terms).not.toContain("The");
    expect(terms).not.toContain("big");
    expect(terms).not.toContain("is");
  });

  it("sorts by length descending", () => {
    const terms = ChangeAnalyzer.extractQueryTerms("liability indemnification term");
    expect(terms[0]).toBe("indemnification");
    expect(terms[1]).toBe("liability");
    expect(terms[2]).toBe("term");
  });

  it("deduplicates", () => {
    const terms = ChangeAnalyzer.extractQueryTerms("clause clause clause agreement agreement");
    const unique = new Set(terms);
    expect(unique.size).toBe(terms.length);
  });

  it("returns empty for short text", () => {
    const terms = ChangeAnalyzer.extractQueryTerms("hi a");
    expect(terms).toHaveLength(0);
  });

  it("caps at 10 terms", () => {
    const longText = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa";
    const terms = ChangeAnalyzer.extractQueryTerms(longText);
    expect(terms.length).toBeLessThanOrEqual(10);
  });
});

/* ============= buildHeuristicAnalysis ============= */

describe("buildHeuristicAnalysis", () => {
  it("preserves the change category", () => {
    const change = makeChange({ category: "editorial" });
    const result = ChangeAnalyzer.buildHeuristicAnalysis(change);
    expect(result.category).toBe("editorial");
  });

  it("sets risk level from estimateRiskLevel", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "$1,000,000 liability cap",
    });
    const result = ChangeAnalyzer.buildHeuristicAnalysis(change);
    expect(result.riskLevel).toBe("high");
  });

  it("recommends review for high/critical risk", () => {
    const change = makeChange({
      category: "substantive",
      proposedText: "liability indemnification penalty",
    });
    const result = ChangeAnalyzer.buildHeuristicAnalysis(change);
    expect(result.recommendation).toBe("review");
  });

  it("recommends accept for low risk", () => {
    const change = makeChange({ category: "editorial" });
    const result = ChangeAnalyzer.buildHeuristicAnalysis(change);
    expect(result.recommendation).toBe("accept");
  });

  it("returns all required AnalysisResult fields", () => {
    const change = makeChange();
    const result = ChangeAnalyzer.buildHeuristicAnalysis(change);

    expect(typeof result.category).toBe("string");
    expect(typeof result.riskLevel).toBe("string");
    expect(typeof result.summary).toBe("string");
    expect(typeof result.impact).toBe("string");
    expect(result.historicalContext).toBeNull();
    expect(result.clauseComparison).toBeNull();
    expect(Array.isArray(result.complianceFlags)).toBe(true);
    expect(typeof result.recommendation).toBe("string");
    expect(typeof result.recommendationReason).toBe("string");
  });

  it("uses change type in impact text", () => {
    const deleteChange = makeChange({ changeType: "delete" });
    const result = ChangeAnalyzer.buildHeuristicAnalysis(deleteChange);
    expect(result.impact).toContain("Removal");

    const insertChange = makeChange({ changeType: "insert" });
    const result2 = ChangeAnalyzer.buildHeuristicAnalysis(insertChange);
    expect(result2.impact).toContain("Addition");

    const replaceChange = makeChange({ changeType: "replace" });
    const result3 = ChangeAnalyzer.buildHeuristicAnalysis(replaceChange);
    expect(result3.impact).toContain("Modification");
  });
});

/* ============= parseAnalysisResponse ============= */

describe("parseAnalysisResponse", () => {
  const change = makeChange();

  it("parses valid JSON directly", () => {
    const json = JSON.stringify({
      category: "substantive",
      riskLevel: "high",
      summary: "Liability cap reduced",
      impact: "Increases financial exposure",
      historicalContext: null,
      clauseComparison: null,
      complianceFlags: [],
      recommendation: "reject",
      recommendationReason: "Too risky",
    });

    const result = ChangeAnalyzer.parseAnalysisResponse(json, change);
    expect(result.riskLevel).toBe("high");
    expect(result.summary).toBe("Liability cap reduced");
    expect(result.recommendation).toBe("reject");
  });

  it("extracts JSON from markdown code blocks", () => {
    const wrapped = '```json\n{"summary":"Test","riskLevel":"low","recommendation":"accept","impact":"None","category":"editorial","historicalContext":null,"clauseComparison":null,"complianceFlags":[],"recommendationReason":"Safe"}\n```';

    const result = ChangeAnalyzer.parseAnalysisResponse(wrapped, change);
    expect(result.summary).toBe("Test");
    expect(result.riskLevel).toBe("low");
  });

  it("falls back to heuristic on invalid input", () => {
    const result = ChangeAnalyzer.parseAnalysisResponse("This is not JSON at all", change);
    // Heuristic fallback should still return valid AnalysisResult
    expect(typeof result.summary).toBe("string");
    expect(typeof result.riskLevel).toBe("string");
    expect(typeof result.recommendation).toBe("string");
  });

  it("normalizes invalid enum values to defaults", () => {
    const json = JSON.stringify({
      summary: "Test",
      riskLevel: "unknown_level",
      recommendation: "nope",
      impact: "Test impact",
    });

    const result = ChangeAnalyzer.parseAnalysisResponse(json, change);
    expect(result.riskLevel).toBe("medium"); // default
    expect(result.recommendation).toBe("review"); // default
  });
});

/* ============= parseBatchResponse ============= */

describe("parseBatchResponse", () => {
  const changes = [
    makeChange({ id: "c1", category: "editorial" }),
    makeChange({ id: "c2", category: "editorial" }),
  ];

  it("parses valid JSON array", () => {
    const json = JSON.stringify([
      { changeIndex: 0, summary: "First", riskLevel: "low", recommendation: "accept", impact: "None", category: "editorial", complianceFlags: [], recommendationReason: "Safe" },
      { changeIndex: 1, summary: "Second", riskLevel: "low", recommendation: "accept", impact: "None", category: "editorial", complianceFlags: [], recommendationReason: "Safe" },
    ]);

    const result = ChangeAnalyzer.parseBatchResponse(json, changes);
    expect(result.size).toBe(2);
    expect(result.get(0)?.summary).toBe("First");
    expect(result.get(1)?.summary).toBe("Second");
  });

  it("fills missing indices with heuristic fallback", () => {
    const json = JSON.stringify([
      { changeIndex: 0, summary: "First only", riskLevel: "low", recommendation: "accept" },
    ]);

    const result = ChangeAnalyzer.parseBatchResponse(json, changes);
    expect(result.size).toBe(2);
    expect(result.get(0)?.summary).toBe("First only");
    // Index 1 should be filled with heuristic
    expect(result.has(1)).toBe(true);
  });

  it("returns heuristic for all on completely invalid input", () => {
    const result = ChangeAnalyzer.parseBatchResponse("Not valid JSON at all", changes);
    expect(result.size).toBe(2);
    // All should have heuristic results
    for (const [_, analysis] of result) {
      expect(typeof analysis.summary).toBe("string");
      expect(typeof analysis.riskLevel).toBe("string");
    }
  });

  it("ignores out-of-range changeIndex values", () => {
    const json = JSON.stringify([
      { changeIndex: 99, summary: "Out of range", riskLevel: "high", recommendation: "reject" },
    ]);

    const result = ChangeAnalyzer.parseBatchResponse(json, changes);
    // Index 99 should be ignored, 0 and 1 filled with heuristic
    expect(result.has(99)).toBe(false);
    expect(result.size).toBe(2);
  });
});

/* ============= buildAnalysisPrompt ============= */

describe("buildAnalysisPrompt", () => {
  it("includes change text in prompt", () => {
    const change = makeChange({
      originalText: "Original liability clause",
      proposedText: "Modified liability clause",
    });
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", documentType: "contract" };
    const gathered = {
      historicalEntities: [],
      clauseMatches: [],
      compliancePolicies: [],
      historicalContext: null,
    };

    const prompt = ChangeAnalyzer.buildAnalysisPrompt(change, ctx, gathered);
    expect(prompt).toContain("Original liability clause");
    expect(prompt).toContain("Modified liability clause");
  });

  it("includes document type in prompt", () => {
    const change = makeChange();
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1", documentType: "proposal" };
    const gathered = {
      historicalEntities: [],
      clauseMatches: [],
      compliancePolicies: [],
      historicalContext: null,
    };

    const prompt = ChangeAnalyzer.buildAnalysisPrompt(change, ctx, gathered);
    expect(prompt).toContain("proposal");
  });

  it("includes section heading when present", () => {
    const change = makeChange({ sectionHeading: "Termination" });
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1" };
    const gathered = {
      historicalEntities: [],
      clauseMatches: [],
      compliancePolicies: [],
      historicalContext: null,
    };

    const prompt = ChangeAnalyzer.buildAnalysisPrompt(change, ctx, gathered);
    expect(prompt).toContain("Termination");
  });
});

/* ============= buildBatchPrompt ============= */

describe("buildBatchPrompt", () => {
  it("includes all change texts", () => {
    const changes = [
      makeChange({ id: "c1", proposedText: "First change text" }),
      makeChange({ id: "c2", proposedText: "Second change text" }),
    ];
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1" };

    const prompt = ChangeAnalyzer.buildBatchPrompt(changes, ctx);
    expect(prompt).toContain("First change text");
    expect(prompt).toContain("Second change text");
    expect(prompt).toContain("Change 0");
    expect(prompt).toContain("Change 1");
  });

  it("includes change count", () => {
    const changes = [makeChange(), makeChange(), makeChange()];
    const ctx = { workspaceId: "ws_1", sessionId: "sess_1" };

    const prompt = ChangeAnalyzer.buildBatchPrompt(changes, ctx);
    expect(prompt).toContain("3 changes");
  });
});

/* ============= export structure ============= */

describe("ChangeAnalyzer export", () => {
  it("exports all expected methods", () => {
    expect(typeof ChangeAnalyzer.analyzeSingle).toBe("function");
    expect(typeof ChangeAnalyzer.batchAnalyze).toBe("function");
    expect(typeof ChangeAnalyzer.buildAnalysisPrompt).toBe("function");
    expect(typeof ChangeAnalyzer.buildBatchPrompt).toBe("function");
    expect(typeof ChangeAnalyzer.parseAnalysisResponse).toBe("function");
    expect(typeof ChangeAnalyzer.parseBatchResponse).toBe("function");
    expect(typeof ChangeAnalyzer.gatherContext).toBe("function");
    expect(typeof ChangeAnalyzer.buildHeuristicAnalysis).toBe("function");
    expect(typeof ChangeAnalyzer.estimateRiskLevel).toBe("function");
    expect(typeof ChangeAnalyzer.extractQueryTerms).toBe("function");
  });
});
