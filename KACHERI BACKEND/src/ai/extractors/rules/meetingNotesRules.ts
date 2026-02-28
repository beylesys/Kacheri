// KACHERI BACKEND/src/ai/extractors/rules/meetingNotesRules.ts
// Document Intelligence: Meeting notes-specific anomaly detection rules
//
// See: Docs/Roadmap/document-intelligence-work-scope.md - Slice 3

import type { Anomaly } from '../../../store/extractions';
import type { MeetingNotesExtraction } from '../types';
import type { Rule, RuleContext } from './types';
import { createAnomaly } from './types';

/* ============= Type Guard ============= */

function isMeetingNotesExtraction(ext: unknown): ext is MeetingNotesExtraction {
  return (ext as MeetingNotesExtraction)?.documentType === 'meeting_notes';
}

/* ============= Rule: No Action Items ============= */

const noActionItemsRule: Rule = {
  meta: {
    code: 'NO_ACTION_ITEMS',
    name: 'No Action Items',
    description: 'Meeting notes have no action items',
    documentTypes: ['meeting_notes'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isMeetingNotesExtraction(ctx.extraction)) return [];

    const { actionItems } = ctx.extraction;
    if (!actionItems || actionItems.length === 0) {
      return [
        createAnomaly(
          'NO_ACTION_ITEMS',
          'info',
          'No action items identified from this meeting',
          'Consider if any follow-up tasks should be captured'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Action Items Without Assignees ============= */

const actionItemsWithoutAssigneesRule: Rule = {
  meta: {
    code: 'ACTION_ITEMS_WITHOUT_ASSIGNEES',
    name: 'Action Items Without Assignees',
    description: 'Some action items have no assigned owner',
    documentTypes: ['meeting_notes'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isMeetingNotesExtraction(ctx.extraction)) return [];

    const { actionItems } = ctx.extraction;
    if (!actionItems || actionItems.length === 0) return [];

    const unassigned = actionItems.filter(
      (item) => !item.assignee || item.assignee.trim() === ''
    );

    if (unassigned.length > 0) {
      const taskPreviews = unassigned
        .slice(0, 3) // Limit to first 3 to keep message concise
        .map((i) => `"${i.task.slice(0, 30)}${i.task.length > 30 ? '...' : ''}"`)
        .join(', ');

      const suffix =
        unassigned.length > 3 ? ` and ${unassigned.length - 3} more` : '';

      return [
        createAnomaly(
          'ACTION_ITEMS_WITHOUT_ASSIGNEES',
          'warning',
          `${unassigned.length} action item(s) have no assignee: ${taskPreviews}${suffix}`,
          'Assign owners to ensure accountability for follow-up tasks'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: Action Items Without Due Dates ============= */

const actionItemsWithoutDueDatesRule: Rule = {
  meta: {
    code: 'ACTION_ITEMS_WITHOUT_DUE_DATES',
    name: 'Action Items Without Due Dates',
    description: 'Some action items have no due date',
    documentTypes: ['meeting_notes'],
    defaultSeverity: 'info',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isMeetingNotesExtraction(ctx.extraction)) return [];

    const { actionItems } = ctx.extraction;
    if (!actionItems || actionItems.length === 0) return [];

    const noDueDate = actionItems.filter((item) => !item.dueDate);

    if (noDueDate.length > 0) {
      return [
        createAnomaly(
          'ACTION_ITEMS_WITHOUT_DUE_DATES',
          'info',
          `${noDueDate.length} action item(s) have no due date`,
          'Setting due dates helps track progress and ensure timely completion'
        ),
      ];
    }
    return [];
  },
};

/* ============= Rule: No Attendees Listed ============= */

const noAttendeesRule: Rule = {
  meta: {
    code: 'NO_ATTENDEES_LISTED',
    name: 'No Attendees Listed',
    description: 'Meeting notes have no attendees listed',
    documentTypes: ['meeting_notes'],
    defaultSeverity: 'warning',
  },
  evaluate: (ctx: RuleContext): Anomaly[] => {
    if (!isMeetingNotesExtraction(ctx.extraction)) return [];

    const { attendees } = ctx.extraction;
    if (!attendees || attendees.length === 0) {
      return [
        createAnomaly(
          'NO_ATTENDEES_LISTED',
          'warning',
          'No meeting attendees were identified',
          'Recording attendees helps establish context and accountability'
        ),
      ];
    }
    return [];
  },
};

/* ============= Export All Meeting Notes Rules ============= */

export const meetingNotesRules: Rule[] = [
  noActionItemsRule,
  actionItemsWithoutAssigneesRule,
  actionItemsWithoutDueDatesRule,
  noAttendeesRule,
];
