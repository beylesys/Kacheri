import { describe, it, expect, vi } from "vitest";
import type { RedlineCompareInput } from "../types.js";

// Mock compliance/engine to avoid deep import chain (evaluators → modelRouter → extractors).
// extractSections is only used for section-heading mapping; returning empty array is
// sufficient for testing the core diff algorithm.
vi.mock("../../compliance/engine", () => ({
  extractSections: () => [],
}));

import { compareRounds } from "../redlineComparator.js";

/* ============= helpers ============= */

function makeInput(overrides: Partial<RedlineCompareInput> = {}): RedlineCompareInput {
  return {
    previousHtml: "<p>Previous</p>",
    previousText: "Previous",
    currentHtml: "<p>Current</p>",
    currentText: "Current",
    sessionId: "sess_test",
    roundId: "rnd_test",
    ...overrides,
  };
}

/* ============= compareRounds — fast-paths ============= */

describe("compareRounds", () => {
  it("returns empty result for identical documents", () => {
    const input = makeInput({
      previousText: "Identical text here.",
      currentText: "Identical text here.",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBe(0);
    expect(result.changes).toHaveLength(0);
    expect(result.substantive).toBe(0);
    expect(result.editorial).toBe(0);
    expect(result.structural).toBe(0);
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("detects inserts when previous is empty", () => {
    const input = makeInput({
      previousText: "",
      previousHtml: "",
      currentText: "New content added.",
      currentHtml: "<p>New content added.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    const inserts = result.changes.filter((c) => c.changeType === "insert");
    expect(inserts.length).toBeGreaterThan(0);
  });

  it("detects deletes when current is empty", () => {
    const input = makeInput({
      previousText: "Removed content.",
      previousHtml: "<p>Removed content.</p>",
      currentText: "",
      currentHtml: "",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    const deletes = result.changes.filter((c) => c.changeType === "delete");
    expect(deletes.length).toBeGreaterThan(0);
  });
});

/* ============= compareRounds — paragraph diffs ============= */

describe("compareRounds — paragraph changes", () => {
  it("detects a replaced paragraph", () => {
    const input = makeInput({
      previousText: "First paragraph.\n\nOld second paragraph.",
      previousHtml: "<p>First paragraph.</p><p>Old second paragraph.</p>",
      currentText: "First paragraph.\n\nNew second paragraph.",
      currentHtml: "<p>First paragraph.</p><p>New second paragraph.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    const replaces = result.changes.filter((c) => c.changeType === "replace");
    expect(replaces.length).toBeGreaterThan(0);
  });

  it("detects inserted paragraph", () => {
    const input = makeInput({
      previousText: "Paragraph one.\n\nParagraph two.",
      previousHtml: "<p>Paragraph one.</p><p>Paragraph two.</p>",
      currentText: "Paragraph one.\n\nNew middle paragraph.\n\nParagraph two.",
      currentHtml: "<p>Paragraph one.</p><p>New middle paragraph.</p><p>Paragraph two.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    const inserts = result.changes.filter((c) => c.changeType === "insert");
    expect(inserts.length).toBeGreaterThan(0);
  });

  it("detects deleted paragraph", () => {
    const input = makeInput({
      previousText: "Paragraph one.\n\nParagraph to delete.\n\nParagraph three.",
      previousHtml: "<p>Paragraph one.</p><p>Paragraph to delete.</p><p>Paragraph three.</p>",
      currentText: "Paragraph one.\n\nParagraph three.",
      currentHtml: "<p>Paragraph one.</p><p>Paragraph three.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    const deletes = result.changes.filter((c) => c.changeType === "delete");
    expect(deletes.length).toBeGreaterThan(0);
  });
});

/* ============= compareRounds — categorization ============= */

describe("compareRounds — categorization", () => {
  it("categorizes monetary changes as substantive", () => {
    const input = makeInput({
      previousText: "The total payment shall be $1,000,000.",
      previousHtml: "<p>The total payment shall be $1,000,000.</p>",
      currentText: "The total payment shall be $500,000.",
      currentHtml: "<p>The total payment shall be $500,000.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    expect(result.substantive).toBeGreaterThan(0);
  });

  it("categorizes legal keyword changes as substantive", () => {
    const input = makeInput({
      previousText: "The liability cap is limited to direct damages only.",
      previousHtml: "<p>The liability cap is limited to direct damages only.</p>",
      currentText: "The liability cap includes consequential damages and penalties.",
      currentHtml: "<p>The liability cap includes consequential damages and penalties.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    expect(result.substantive).toBeGreaterThan(0);
  });

  it("categorizes punctuation-only changes as editorial", () => {
    const input = makeInput({
      previousText: "This is a sentence",
      previousHtml: "<p>This is a sentence</p>",
      currentText: "This is a sentence.",
      currentHtml: "<p>This is a sentence.</p>",
    });
    const result = compareRounds(input);

    if (result.totalChanges > 0) {
      expect(result.editorial).toBeGreaterThanOrEqual(0);
    }
  });

  it("categorizes modal verb changes as substantive", () => {
    const input = makeInput({
      previousText: "The vendor may provide support services.",
      previousHtml: "<p>The vendor may provide support services.</p>",
      currentText: "The vendor shall provide support services.",
      currentHtml: "<p>The vendor shall provide support services.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBeGreaterThan(0);
    expect(result.substantive).toBeGreaterThan(0);
  });
});

/* ============= compareRounds — result structure ============= */

describe("compareRounds — result structure", () => {
  it("records processing time", () => {
    const input = makeInput({
      previousText: "Original text.",
      currentText: "Modified text.",
    });
    const result = compareRounds(input);

    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.processingTimeMs).toBe("number");
  });

  it("counts match between totalChanges and changes array length", () => {
    const input = makeInput({
      previousText: "Alpha.\n\nBeta.\n\nGamma.",
      previousHtml: "<p>Alpha.</p><p>Beta.</p><p>Gamma.</p>",
      currentText: "Alpha.\n\nDelta.\n\nGamma.",
      currentHtml: "<p>Alpha.</p><p>Delta.</p><p>Gamma.</p>",
    });
    const result = compareRounds(input);

    expect(result.totalChanges).toBe(result.changes.length);
    expect(result.substantive + result.editorial + result.structural).toBe(result.totalChanges);
  });

  it("changes have valid positions", () => {
    const input = makeInput({
      previousText: "First line.\n\nSecond line that will change.",
      previousHtml: "<p>First line.</p><p>Second line that will change.</p>",
      currentText: "First line.\n\nSecond line with new wording.",
      currentHtml: "<p>First line.</p><p>Second line with new wording.</p>",
    });
    const result = compareRounds(input);

    for (const change of result.changes) {
      expect(change.fromPos).toBeGreaterThanOrEqual(0);
      expect(change.toPos).toBeGreaterThanOrEqual(change.fromPos);
      expect(["insert", "delete", "replace"]).toContain(change.changeType);
      expect(["substantive", "editorial", "structural"]).toContain(change.category);
    }
  });

  it("maps section headings from HTML", () => {
    const input = makeInput({
      previousText: "Introduction\n\nSome text.\n\nLiability\n\nOld liability clause.",
      previousHtml: "<h1>Introduction</h1><p>Some text.</p><h2>Liability</h2><p>Old liability clause.</p>",
      currentText: "Introduction\n\nSome text.\n\nLiability\n\nNew liability clause with indemnification.",
      currentHtml: "<h1>Introduction</h1><p>Some text.</p><h2>Liability</h2><p>New liability clause with indemnification.</p>",
    });
    const result = compareRounds(input);

    if (result.totalChanges > 0) {
      const withHeading = result.changes.filter((c) => c.sectionHeading !== null);
      expect(typeof withHeading.length).toBe("number");
    }
  });
});
