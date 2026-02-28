import { describe, it, expect } from "vitest";
import { HistoricalAnalyzer } from "../historicalAnalyzer.js";
import type {
  CounterpartyHistory,
  AcceptanceRateResult,
  AmountTrend,
  AmountTrendValue,
  SimilarPastChange,
} from "../historicalAnalyzer.js";

/* ============= helpers ============= */

function makeTrendValue(overrides: Partial<AmountTrendValue> = {}): AmountTrendValue {
  return {
    sessionTitle: "Test Session",
    amount: "$1,000",
    numericAmount: 1000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/* ============= extractKeywords ============= */

describe("extractKeywords", () => {
  it("extracts basic words and lowercases them", () => {
    const result = HistoricalAnalyzer.extractKeywords("Liability Indemnification Agreement");
    expect(result.has("liability")).toBe(true);
    expect(result.has("indemnification")).toBe(true);
    expect(result.has("agreement")).toBe(true);
  });

  it("removes stopwords", () => {
    const result = HistoricalAnalyzer.extractKeywords("the agreement is between the parties");
    expect(result.has("the")).toBe(false);
    expect(result.has("is")).toBe(false);
    expect(result.has("between")).toBe(false);
    expect(result.has("agreement")).toBe(true);
    expect(result.has("parties")).toBe(true);
  });

  it("filters out short words (less than 3 chars)", () => {
    const result = HistoricalAnalyzer.extractKeywords("an at to be do it go no");
    expect(result.size).toBe(0);
  });

  it("splits on non-alphanumeric characters", () => {
    const result = HistoricalAnalyzer.extractKeywords("term-sheet, liability/indemnity (section)");
    expect(result.has("term")).toBe(true);
    expect(result.has("sheet")).toBe(true);
    expect(result.has("liability")).toBe(true);
    expect(result.has("indemnity")).toBe(true);
    expect(result.has("section")).toBe(true);
  });

  it("returns empty set for empty string", () => {
    const result = HistoricalAnalyzer.extractKeywords("");
    expect(result.size).toBe(0);
  });

  it("deduplicates repeated words", () => {
    const result = HistoricalAnalyzer.extractKeywords("contract contract contract agreement agreement");
    expect(result.size).toBe(2);
    expect(result.has("contract")).toBe(true);
    expect(result.has("agreement")).toBe(true);
  });
});

/* ============= jaccardSimilarity ============= */

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["liability", "contract", "agreement"]);
    const b = new Set(["liability", "contract", "agreement"]);
    expect(HistoricalAnalyzer.jaccardSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for completely disjoint sets", () => {
    const a = new Set(["liability", "contract"]);
    const b = new Set(["payment", "invoice"]);
    expect(HistoricalAnalyzer.jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns correct value for partial overlap", () => {
    const a = new Set(["liability", "contract", "agreement"]);
    const b = new Set(["liability", "payment", "terms"]);
    // intersection: {liability} = 1, union: 5
    expect(HistoricalAnalyzer.jaccardSimilarity(a, b)).toBeCloseTo(0.2);
  });

  it("returns 0 for both empty sets", () => {
    const a = new Set<string>();
    const b = new Set<string>();
    expect(HistoricalAnalyzer.jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when one set is empty", () => {
    const a = new Set(["liability", "contract"]);
    const b = new Set<string>();
    expect(HistoricalAnalyzer.jaccardSimilarity(a, b)).toBe(0);
  });

  it("handles single element overlap", () => {
    const a = new Set(["contract"]);
    const b = new Set(["contract"]);
    expect(HistoricalAnalyzer.jaccardSimilarity(a, b)).toBe(1);
  });
});

/* ============= extractQueryTerms ============= */

describe("extractQueryTerms", () => {
  it("extracts words 4+ chars", () => {
    const terms = HistoricalAnalyzer.extractQueryTerms("The big liability clause is important");
    expect(terms).toContain("liability");
    expect(terms).toContain("clause");
    expect(terms).not.toContain("The");
    expect(terms).not.toContain("big");
  });

  it("sorts by length descending", () => {
    const terms = HistoricalAnalyzer.extractQueryTerms("liability indemnification term");
    expect(terms[0]).toBe("indemnification");
  });

  it("returns empty for short-only text", () => {
    const terms = HistoricalAnalyzer.extractQueryTerms("hi a be");
    expect(terms).toHaveLength(0);
  });

  it("caps at 10 terms", () => {
    const longText = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa";
    const terms = HistoricalAnalyzer.extractQueryTerms(longText);
    expect(terms.length).toBeLessThanOrEqual(10);
  });
});

/* ============= parseMonetaryString ============= */

describe("parseMonetaryString", () => {
  it("parses dollar sign format", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("$1,000.50")).toBe(1000.5);
  });

  it("parses with dollar word", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("1000 dollars")).toBe(1000);
  });

  it("parses plain number with commas", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("$50,000")).toBe(50000);
  });

  it("parses with EUR/GBP labels", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("€1000")).toBe(1000);
    expect(HistoricalAnalyzer.parseMonetaryString("£2500")).toBe(2500);
  });

  it("parses large amounts", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("$1,000,000")).toBe(1000000);
  });

  it("returns 0 for invalid input", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("not a number")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("")).toBe(0);
  });

  it("handles whitespace", () => {
    expect(HistoricalAnalyzer.parseMonetaryString("  $500  ")).toBe(500);
  });
});

/* ============= getNestedValue ============= */

describe("getNestedValue", () => {
  it("navigates simple path", () => {
    const obj = { a: 5 };
    expect(HistoricalAnalyzer.getNestedValue(obj, "a")).toBe(5);
  });

  it("navigates nested path", () => {
    const obj = { a: { b: { c: "deep" } } };
    expect(HistoricalAnalyzer.getNestedValue(obj as Record<string, unknown>, "a.b.c")).toBe("deep");
  });

  it("returns undefined for missing key", () => {
    const obj = { a: 1 };
    expect(HistoricalAnalyzer.getNestedValue(obj, "b")).toBeUndefined();
  });

  it("returns undefined for missing nested key", () => {
    const obj = { a: { b: 1 } };
    expect(HistoricalAnalyzer.getNestedValue(obj as Record<string, unknown>, "a.c")).toBeUndefined();
  });

  it("returns undefined for deeply missing path", () => {
    const obj = { a: 1 };
    expect(HistoricalAnalyzer.getNestedValue(obj, "a.b.c")).toBeUndefined();
  });

  it("handles null intermediate values", () => {
    const obj = { a: null };
    expect(HistoricalAnalyzer.getNestedValue(obj as Record<string, unknown>, "a.b")).toBeUndefined();
  });
});

/* ============= determineDirection ============= */

describe("determineDirection", () => {
  it("returns stable for single value", () => {
    const values = [makeTrendValue({ numericAmount: 1000 })];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("stable");
  });

  it("returns stable for empty array", () => {
    expect(HistoricalAnalyzer.determineDirection([])).toBe("stable");
  });

  it("returns increasing for ascending values", () => {
    const values = [
      makeTrendValue({ numericAmount: 100 }),
      makeTrendValue({ numericAmount: 200 }),
      makeTrendValue({ numericAmount: 300 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("increasing");
  });

  it("returns decreasing for descending values", () => {
    const values = [
      makeTrendValue({ numericAmount: 300 }),
      makeTrendValue({ numericAmount: 200 }),
      makeTrendValue({ numericAmount: 100 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("decreasing");
  });

  it("returns stable when first equals last", () => {
    const values = [
      makeTrendValue({ numericAmount: 100 }),
      makeTrendValue({ numericAmount: 200 }),
      makeTrendValue({ numericAmount: 100 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("stable");
  });

  it("returns mixed for fluctuating values", () => {
    const values = [
      makeTrendValue({ numericAmount: 100 }),
      makeTrendValue({ numericAmount: 300 }),
      makeTrendValue({ numericAmount: 200 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("mixed");
  });

  it("returns increasing for two ascending values", () => {
    const values = [
      makeTrendValue({ numericAmount: 50 }),
      makeTrendValue({ numericAmount: 100 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("increasing");
  });

  it("returns decreasing for two descending values", () => {
    const values = [
      makeTrendValue({ numericAmount: 100 }),
      makeTrendValue({ numericAmount: 50 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("decreasing");
  });

  it("returns stable for two equal values", () => {
    const values = [
      makeTrendValue({ numericAmount: 100 }),
      makeTrendValue({ numericAmount: 100 }),
    ];
    expect(HistoricalAnalyzer.determineDirection(values)).toBe("stable");
  });
});

/* ============= buildSummary ============= */

describe("buildSummary", () => {
  it("returns no-data message when all inputs are null/empty", () => {
    const result = HistoricalAnalyzer.buildSummary(null, null, [], []);
    expect(result).toContain("No historical data");
  });

  it("includes counterparty history when provided", () => {
    const history: CounterpartyHistory = {
      counterpartyName: "Acme Corp",
      totalSessions: 5,
      settledSessions: 3,
      abandonedSessions: 1,
      activeSessions: 1,
      avgRoundsPerSession: 4,
      sessions: [],
    };

    const result = HistoricalAnalyzer.buildSummary(history, null, [], []);
    expect(result).toContain("Acme Corp");
    expect(result).toContain("5 past negotiation");
    expect(result).toContain("3 settled");
    expect(result).toContain("1 abandoned");
  });

  it("includes acceptance rates when provided", () => {
    const rates: AcceptanceRateResult = {
      overallRate: 73,
      totalChangesAnalyzed: 50,
      byCategory: { substantive: 60, editorial: 90, structural: 50 },
      byRiskLevel: { low: 95, medium: 70, high: 40, critical: 10 },
    };

    const result = HistoricalAnalyzer.buildSummary(null, rates, [], []);
    expect(result).toContain("73%");
    expect(result).toContain("50 resolved changes");
  });

  it("includes substantive rate when different from overall", () => {
    const rates: AcceptanceRateResult = {
      overallRate: 73,
      totalChangesAnalyzed: 50,
      byCategory: { substantive: 50, editorial: 90, structural: 70 },
      byRiskLevel: { low: 95, medium: 70, high: 40, critical: 10 },
    };

    const result = HistoricalAnalyzer.buildSummary(null, rates, [], []);
    expect(result).toContain("Substantive changes acceptance: 50%");
  });

  it("includes amount trends when provided", () => {
    const trends: AmountTrend[] = [
      {
        term: "liability_cap",
        values: [
          makeTrendValue({ numericAmount: 1000000, amount: "$1M" }),
          makeTrendValue({ numericAmount: 750000, amount: "$750K" }),
        ],
        direction: "decreasing",
      },
    ];

    const result = HistoricalAnalyzer.buildSummary(null, null, trends, []);
    expect(result).toContain("Amount trends");
    expect(result).toContain("liability_cap");
    expect(result).toContain("decreasing");
  });

  it("includes similar past changes summary", () => {
    const similar: SimilarPastChange[] = [
      {
        changeId: "c1",
        sessionId: "s1",
        sessionTitle: "Past Deal",
        counterpartyName: "Acme",
        originalText: "old",
        proposedText: "new",
        category: "substantive",
        status: "accepted",
        riskLevel: "medium",
        similarity: 0.8,
      },
      {
        changeId: "c2",
        sessionId: "s2",
        sessionTitle: "Another Deal",
        counterpartyName: "Beta",
        originalText: "old",
        proposedText: "new",
        category: "substantive",
        status: "rejected",
        riskLevel: "high",
        similarity: 0.6,
      },
    ];

    const result = HistoricalAnalyzer.buildSummary(null, null, [], similar);
    expect(result).toContain("2 similar past change");
    expect(result).toContain("1 accepted");
    expect(result).toContain("1 rejected");
  });

  it("combines all sections when all data is provided", () => {
    const history: CounterpartyHistory = {
      counterpartyName: "Acme",
      totalSessions: 3,
      settledSessions: 2,
      abandonedSessions: 0,
      activeSessions: 1,
      avgRoundsPerSession: 3,
      sessions: [],
    };
    const rates: AcceptanceRateResult = {
      overallRate: 80,
      totalChangesAnalyzed: 30,
      byCategory: { substantive: 80, editorial: 80, structural: 80 },
      byRiskLevel: { low: 90, medium: 80, high: 50, critical: 20 },
    };

    const result = HistoricalAnalyzer.buildSummary(history, rates, [], []);
    expect(result).toContain("Acme");
    expect(result).toContain("80%");
  });
});

/* ============= export structure ============= */

describe("HistoricalAnalyzer export", () => {
  it("exports all expected methods", () => {
    expect(typeof HistoricalAnalyzer.getHistoricalContext).toBe("function");
    expect(typeof HistoricalAnalyzer.findCounterpartyHistory).toBe("function");
    expect(typeof HistoricalAnalyzer.calculateAcceptanceRates).toBe("function");
    expect(typeof HistoricalAnalyzer.findAmountTrends).toBe("function");
    expect(typeof HistoricalAnalyzer.findSimilarPastChanges).toBe("function");
    expect(typeof HistoricalAnalyzer.findRelatedEntities).toBe("function");
    expect(typeof HistoricalAnalyzer.buildSummary).toBe("function");
    expect(typeof HistoricalAnalyzer.extractKeywords).toBe("function");
    expect(typeof HistoricalAnalyzer.jaccardSimilarity).toBe("function");
    expect(typeof HistoricalAnalyzer.extractQueryTerms).toBe("function");
    expect(typeof HistoricalAnalyzer.parseMonetaryString).toBe("function");
    expect(typeof HistoricalAnalyzer.getNestedValue).toBe("function");
    expect(typeof HistoricalAnalyzer.determineDirection).toBe("function");
  });
});
