// KACHERI BACKEND/src/aiActions.ts
export type AiActionName = "summarize" | "extract_tasks" | "rewrite_for_clarity";

export function runAiAction(
  name: AiActionName,
  input: { text: string }
): { output: string; notes: string[] } {
  const text = (input.text || "").trim();

  if (name === "summarize") {
    // naive: pick first ~3 sentences as "summary"
    const sentences = text.split(/(?<=[.!?])\s+/).slice(0, 3);
    const summary = sentences.join(" ");
    return {
      output: `Summary:\n- ${summary.replace(/\n/g, " ").trim()}`,
      notes: ["heuristic summary (first ~3 sentences)"],
    };
  }

  if (name === "extract_tasks") {
    // find lines that look like tasks or sentences with "should/need to"
    const lines = text.split(/\r?\n/);
    const tasks = lines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter(
        (l) =>
          /^(-|\*|\[ \]|\[\]|todo:)/i.test(l) ||
          /\b(should|need to|todo|next step|action item)\b/i.test(l)
      )
      .map((l) => l.replace(/^(-|\*|\[ \]|\[\]|todo:)\s*/i, ""))
      .slice(0, 10);
    const out =
      tasks.length > 0
        ? `Tasks:\n${tasks.map((t) => `- [ ] ${t}`).join("\n")}`
        : "Tasks:\n- [ ] (none found)";
    return { output: out, notes: ["heuristic task extractor"] };
  }

  if (name === "rewrite_for_clarity") {
    // gentle rewrite: collapse spaces, remove filler words, shorter sentences
    const pass = text
      .replace(/\s+/g, " ")
      .replace(/\b(really|very|actually|basically|just)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const sentences = pass.split(/(?<=[.!?])\s+/).map((s) => s.trim());
    const shorter = sentences
      .map((s) => (s.length > 160 ? s.slice(0, 160) + "…" : s))
      .join(" ");
    return { output: shorter, notes: ["lightweight clarity pass"] };
  }

  throw new Error(`Unknown AI action: ${name}`);
}
