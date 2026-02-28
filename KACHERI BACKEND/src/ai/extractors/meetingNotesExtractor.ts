// KACHERI BACKEND/src/ai/extractors/meetingNotesExtractor.ts
// Document Intelligence: Meeting notes-specific data extraction
//
// Extracts: attendees, agenda, discussions, action items, next meeting, etc.

import { composeText } from '../modelRouter';
import {
  extractJsonFromResponse,
  normalizeDate,
  normalizeStringArray,
  buildFieldConfidences,
  extractTitleHeuristic,
  OUT_START,
  OUT_END,
  type ExtractorOptions,
  type ExtractorResult,
  type MeetingNotesExtraction,
  type MeetingDiscussion,
  type MeetingActionItem,
  type NextMeeting,
  type GenericExtraction,
} from './types';

/* ============= System Prompt ============= */

const MEETING_NOTES_SYSTEM_PROMPT = `You are Kacheri's meeting notes data extractor.

Extract the following fields from the meeting notes:
- title: The meeting title or subject
- date: Meeting date (YYYY-MM-DD format)
- attendees: Array of attendee names
- absentees: Array of people who were absent (if mentioned)
- agenda: Array of agenda items
- discussions: Array of {topic, summary, decisions?: string[]}
- actionItems: Array of {task, assignee?, dueDate?, status?}
- nextMeeting: Object with {date?, agenda?: string[]}

IMPORTANT:
1. Return ONLY valid JSON, no explanations outside the markers
2. Use null for fields you cannot find or extract
3. Use YYYY-MM-DD format for all dates
4. Include confidence scores (0.0 to 1.0) for each extracted field
5. Action items are critical - extract all tasks with assignees and due dates when available
6. The document may be in any language. Extract field values in the original language. Normalize dates to YYYY-MM-DD and amounts to numbers regardless of language.

Return your response wrapped in markers:
${OUT_START}
{
  "extraction": {
    "title": "Weekly Team Sync",
    "date": "2026-01-15",
    "attendees": ["Alice", "Bob", "Carol"],
    "agenda": ["Project updates", "Blockers", "Next steps"],
    "discussions": [{"topic": "Project Alpha", "summary": "On track for Q2 launch", "decisions": ["Proceed with Phase 2"]}],
    "actionItems": [{"task": "Prepare demo", "assignee": "Bob", "dueDate": "2026-01-20"}],
    ...
  },
  "confidences": {
    "title": 0.95,
    "attendees": 0.90,
    "actionItems": 0.85,
    ...
  }
}
${OUT_END}`;

/* ============= Field List for Confidence Tracking ============= */

const MEETING_NOTES_FIELDS = [
  'title',
  'date',
  'attendees',
  'absentees',
  'agenda',
  'discussions',
  'actionItems',
  'nextMeeting',
];

/* ============= Normalization Functions ============= */

function normalizeDiscussions(raw: unknown): MeetingDiscussion[] {
  if (!Array.isArray(raw)) return [];
  const result: MeetingDiscussion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const topic = typeof obj.topic === 'string' ? obj.topic.trim() : '';
    const summary = typeof obj.summary === 'string' ? obj.summary : '';

    if (!topic && !summary) continue;

    const discussion: MeetingDiscussion = {
      topic: topic || 'Discussion',
      summary: summary || 'No summary provided',
    };
    const decisions = normalizeStringArray(obj.decisions);
    if (decisions) discussion.decisions = decisions;
    result.push(discussion);
  }
  return result;
}

function normalizeActionItems(raw: unknown): MeetingActionItem[] {
  if (!Array.isArray(raw)) return [];
  const result: MeetingActionItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const task = typeof obj.task === 'string' ? obj.task.trim() : '';
    if (!task) continue;

    const actionItem: MeetingActionItem = { task };
    if (typeof obj.assignee === 'string') actionItem.assignee = obj.assignee;
    const dueDate = normalizeDate(obj.dueDate);
    if (dueDate) actionItem.dueDate = dueDate;
    if (typeof obj.status === 'string') actionItem.status = obj.status;
    result.push(actionItem);
  }
  return result;
}

function normalizeNextMeeting(raw: unknown): NextMeeting | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const next: NextMeeting = {};
  const date = normalizeDate(obj.date);
  const agenda = normalizeStringArray(obj.agenda);

  if (date) next.date = date;
  if (agenda) next.agenda = agenda;

  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeMeetingNotesExtraction(raw: unknown): MeetingNotesExtraction {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  return {
    documentType: 'meeting_notes',
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title.trim()
        : 'Untitled Meeting Notes',
    date: normalizeDate(obj.date) || 'Unknown',
    attendees: normalizeStringArray(obj.attendees) || [],
    absentees: normalizeStringArray(obj.absentees),
    agenda: normalizeStringArray(obj.agenda),
    discussions: normalizeDiscussions(obj.discussions),
    actionItems: normalizeActionItems(obj.actionItems),
    nextMeeting: normalizeNextMeeting(obj.nextMeeting),
  };
}

/* ============= Fallback Extraction ============= */

function createFallbackResult(text: string, rawResponse?: string, error?: string): ExtractorResult {
  const title = extractTitleHeuristic(text);

  const fallback: GenericExtraction = {
    documentType: 'other',
    title,
    summary: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
    keyPoints: [],
    entities: [],
    dates: [],
    amounts: [],
  };

  return {
    extraction: fallback,
    fieldConfidences: { title: 0.3, summary: 0.2 },
    rawResponse,
    notes: error ? [`error: ${error}`] : undefined,
  };
}

/* ============= Main Extraction Function ============= */

/**
 * Extract meeting notes data from text using AI.
 *
 * @param text - The meeting notes text to extract from
 * @param options - Provider, model, seed options
 * @returns Extraction result with meeting notes data and confidence scores
 */
export async function extractMeetingNotes(
  text: string,
  options: ExtractorOptions = {}
): Promise<ExtractorResult> {
  const notes: string[] = [];

  const prompt = `Extract meeting notes data from this document:\n\n---\n${text}\n---`;

  try {
    const result = await composeText(prompt, {
      systemPrompt: MEETING_NOTES_SYSTEM_PROMPT,
      maxTokens: 2000,
      provider: options.provider,
      model: options.model,
      seed: options.seed,
    });

    const { json, parseError, usedMarkers } = extractJsonFromResponse(result.text);

    if (!usedMarkers) {
      notes.push('model_output_missing_markers');
    }

    if (parseError || !json) {
      notes.push(`parse_error: ${parseError}`);
      return createFallbackResult(text, result.text, parseError);
    }

    const obj = json as Record<string, unknown>;
    const rawExtraction = obj.extraction || obj;
    const rawConfidences = (obj.confidences || {}) as Record<string, number>;

    const extraction = normalizeMeetingNotesExtraction(rawExtraction);
    const fieldConfidences = buildFieldConfidences(
      extraction as unknown as Record<string, unknown>,
      rawConfidences,
      MEETING_NOTES_FIELDS
    );

    return {
      extraction,
      fieldConfidences,
      rawResponse: result.text,
      notes: notes.length > 0 ? notes : undefined,
    };
  } catch (err) {
    notes.push(`extraction_error: ${String(err)}`);
    return createFallbackResult(text, undefined, String(err));
  }
}
