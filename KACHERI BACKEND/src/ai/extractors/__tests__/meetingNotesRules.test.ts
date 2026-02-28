import { describe, it, expect } from 'vitest';
import { meetingNotesRules } from '../rules/meetingNotesRules.js';
import type { RuleContext } from '../rules/types.js';
import type { MeetingNotesExtraction } from '../types.js';

function makeMeetingCtx(
  extraction: Partial<MeetingNotesExtraction>,
  fieldConfidences: Record<string, number> = {}
): RuleContext {
  return {
    extraction: {
      documentType: 'meeting_notes',
      title: 'Team Standup',
      date: '2026-01-15',
      attendees: [],
      discussions: [],
      actionItems: [],
      ...extraction,
    } as MeetingNotesExtraction,
    fieldConfidences,
  };
}

function findRule(code: string) {
  const rule = meetingNotesRules.find((r) => r.meta.code === code);
  if (!rule) throw new Error(`Rule ${code} not found`);
  return rule;
}

/* ============= NO_ACTION_ITEMS ============= */

describe('NO_ACTION_ITEMS rule', () => {
  const rule = findRule('NO_ACTION_ITEMS');

  it('triggers when actionItems is empty', () => {
    const ctx = makeMeetingCtx({ actionItems: [] });
    expect(rule.evaluate(ctx)).toHaveLength(1);
    expect(rule.evaluate(ctx)[0].code).toBe('NO_ACTION_ITEMS');
  });

  it('does not trigger when actionItems exist', () => {
    const ctx = makeMeetingCtx({
      actionItems: [{ task: 'Follow up with client' }],
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('skips non-meeting documents', () => {
    const ctx: RuleContext = {
      extraction: { documentType: 'contract' } as any,
      fieldConfidences: {},
    };
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= ACTION_ITEMS_WITHOUT_ASSIGNEES ============= */

describe('ACTION_ITEMS_WITHOUT_ASSIGNEES rule', () => {
  const rule = findRule('ACTION_ITEMS_WITHOUT_ASSIGNEES');

  it('triggers when action items lack assignees', () => {
    const ctx = makeMeetingCtx({
      actionItems: [
        { task: 'Send report' },
        { task: 'Review code', assignee: 'Alice' },
      ],
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('1 action item(s)');
    expect(anomalies[0].message).toContain('Send report');
  });

  it('does not trigger when all have assignees', () => {
    const ctx = makeMeetingCtx({
      actionItems: [
        { task: 'Send report', assignee: 'Bob' },
        { task: 'Review code', assignee: 'Alice' },
      ],
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('truncates message for >3 unassigned items', () => {
    const ctx = makeMeetingCtx({
      actionItems: [
        { task: 'Task 1' },
        { task: 'Task 2' },
        { task: 'Task 3' },
        { task: 'Task 4' },
        { task: 'Task 5' },
      ],
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('and 2 more');
  });

  it('does not trigger for empty action items', () => {
    const ctx = makeMeetingCtx({ actionItems: [] });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('treats empty string assignee as unassigned', () => {
    const ctx = makeMeetingCtx({
      actionItems: [{ task: 'Send report', assignee: '   ' }],
    });
    expect(rule.evaluate(ctx)).toHaveLength(1);
  });
});

/* ============= ACTION_ITEMS_WITHOUT_DUE_DATES ============= */

describe('ACTION_ITEMS_WITHOUT_DUE_DATES rule', () => {
  const rule = findRule('ACTION_ITEMS_WITHOUT_DUE_DATES');

  it('triggers when action items lack due dates', () => {
    const ctx = makeMeetingCtx({
      actionItems: [
        { task: 'Send report' },
        { task: 'Review code', dueDate: '2026-02-01' },
      ],
    });
    const anomalies = rule.evaluate(ctx);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].message).toContain('1 action item(s)');
  });

  it('does not trigger when all have due dates', () => {
    const ctx = makeMeetingCtx({
      actionItems: [
        { task: 'Send report', dueDate: '2026-02-01' },
        { task: 'Review code', dueDate: '2026-02-15' },
      ],
    });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });

  it('does not trigger for empty action items', () => {
    const ctx = makeMeetingCtx({ actionItems: [] });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});

/* ============= NO_ATTENDEES_LISTED ============= */

describe('NO_ATTENDEES_LISTED rule', () => {
  const rule = findRule('NO_ATTENDEES_LISTED');

  it('triggers when attendees is empty', () => {
    const ctx = makeMeetingCtx({ attendees: [] });
    expect(rule.evaluate(ctx)).toHaveLength(1);
    expect(rule.evaluate(ctx)[0].code).toBe('NO_ATTENDEES_LISTED');
  });

  it('does not trigger when attendees exist', () => {
    const ctx = makeMeetingCtx({ attendees: ['Alice', 'Bob'] });
    expect(rule.evaluate(ctx)).toHaveLength(0);
  });
});
