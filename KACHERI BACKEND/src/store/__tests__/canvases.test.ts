import { describe, it, expect } from 'vitest';
import { validateCompositionMode, CanvasStore } from '../canvases.js';
import { CanvasFrameStore } from '../canvasFrames.js';
import { CanvasVersionStore } from '../canvasVersions.js';
import { CanvasConversationStore } from '../canvasConversations.js';

/* ============= validateCompositionMode ============= */

describe('validateCompositionMode', () => {
  it('accepts "deck"', () => {
    expect(validateCompositionMode('deck')).toBe(true);
  });

  it('accepts "page"', () => {
    expect(validateCompositionMode('page')).toBe(true);
  });

  it('accepts "notebook"', () => {
    expect(validateCompositionMode('notebook')).toBe(true);
  });

  it('accepts "widget"', () => {
    expect(validateCompositionMode('widget')).toBe(true);
  });

  it('rejects invalid mode', () => {
    expect(validateCompositionMode('slideshow')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateCompositionMode('')).toBe(false);
  });

  it('rejects uppercase variant', () => {
    expect(validateCompositionMode('Deck')).toBe(false);
  });

  it('rejects partial match', () => {
    expect(validateCompositionMode('note')).toBe(false);
  });
});

/* ============= CanvasStore exports ============= */

describe('CanvasStore exports', () => {
  it('exports expected CRUD methods', () => {
    expect(typeof CanvasStore.create).toBe('function');
    expect(typeof CanvasStore.getById).toBe('function');
    expect(typeof CanvasStore.getIncludingDeleted).toBe('function');
    expect(typeof CanvasStore.getPublishedById).toBe('function');
    expect(typeof CanvasStore.listByWorkspace).toBe('function');
    expect(typeof CanvasStore.update).toBe('function');
    expect(typeof CanvasStore.softDelete).toBe('function');
    expect(typeof CanvasStore.restore).toBe('function');
  });

  it('exports lock management methods', () => {
    expect(typeof CanvasStore.lock).toBe('function');
    expect(typeof CanvasStore.unlock).toBe('function');
  });

  it('exports publish methods', () => {
    expect(typeof CanvasStore.publish).toBe('function');
    expect(typeof CanvasStore.unpublish).toBe('function');
  });

  it('exports search and count methods', () => {
    expect(typeof CanvasStore.search).toBe('function');
    expect(typeof CanvasStore.exists).toBe('function');
    expect(typeof CanvasStore.count).toBe('function');
  });

  it('exports validator methods', () => {
    expect(typeof CanvasStore.validateCompositionMode).toBe('function');
  });
});

/* ============= CanvasFrameStore exports ============= */

describe('CanvasFrameStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof CanvasFrameStore.create).toBe('function');
    expect(typeof CanvasFrameStore.getById).toBe('function');
    expect(typeof CanvasFrameStore.getByCanvas).toBe('function');
    expect(typeof CanvasFrameStore.update).toBe('function');
    expect(typeof CanvasFrameStore.delete).toBe('function');
    expect(typeof CanvasFrameStore.deleteAllByCanvas).toBe('function');
    expect(typeof CanvasFrameStore.reorder).toBe('function');
    expect(typeof CanvasFrameStore.updateCode).toBe('function');
    expect(typeof CanvasFrameStore.updateThumbnail).toBe('function');
    expect(typeof CanvasFrameStore.countByCanvas).toBe('function');
  });
});

/* ============= CanvasVersionStore exports ============= */

describe('CanvasVersionStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof CanvasVersionStore.create).toBe('function');
    expect(typeof CanvasVersionStore.getById).toBe('function');
    expect(typeof CanvasVersionStore.listByCanvas).toBe('function');
    expect(typeof CanvasVersionStore.delete).toBe('function');
    expect(typeof CanvasVersionStore.countByCanvas).toBe('function');
  });
});

/* ============= CanvasConversationStore exports ============= */

describe('CanvasConversationStore exports', () => {
  it('exports expected methods', () => {
    expect(typeof CanvasConversationStore.append).toBe('function');
    expect(typeof CanvasConversationStore.getById).toBe('function');
    expect(typeof CanvasConversationStore.getByCanvas).toBe('function');
    expect(typeof CanvasConversationStore.getByFrame).toBe('function');
    expect(typeof CanvasConversationStore.countByCanvas).toBe('function');
  });
});
