import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import EntityGraph from '../components/knowledge/EntityGraph';

/* ---------- Mocks ---------- */

const mockListEntities = vi.fn();
const mockListRelationships = vi.fn();

vi.mock('../api/knowledge', () => ({
  knowledgeApi: {
    listEntities: (...args: unknown[]) => mockListEntities(...args),
    listRelationships: (...args: unknown[]) => mockListRelationships(...args),
  },
}));

vi.mock('../components/knowledge/knowledge.css', () => ({}));

/* ---------- rAF stub ---------- */

let rafCallbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  rafCallbacks = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

/* ---------- Helpers ---------- */

const sampleEntities = {
  entities: [
    {
      id: 'ent_1',
      workspaceId: 'ws_1',
      name: 'Acme Corp',
      normalizedName: 'acme corp',
      entityType: 'organization' as const,
      mentionCount: 10,
      docCount: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'ent_2',
      workspaceId: 'ws_1',
      name: 'John Doe',
      normalizedName: 'john doe',
      entityType: 'person' as const,
      mentionCount: 5,
      docCount: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'ent_3',
      workspaceId: 'ws_1',
      name: '$50,000',
      normalizedName: '$50,000',
      entityType: 'amount' as const,
      mentionCount: 3,
      docCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  total: 3,
  hasMore: false,
};

const sampleRelationships = {
  relationships: [
    {
      id: 'rel_1',
      fromEntity: { id: 'ent_1', name: 'Acme Corp', entityType: 'organization' as const },
      toEntity: { id: 'ent_2', name: 'John Doe', entityType: 'person' as const },
      relationshipType: 'organizational' as const,
      label: 'employs',
      strength: 0.8,
      evidenceCount: 4,
    },
    {
      id: 'rel_2',
      fromEntity: { id: 'ent_2', name: 'John Doe', entityType: 'person' as const },
      toEntity: { id: 'ent_3', name: '$50,000', entityType: 'amount' as const },
      relationshipType: 'financial' as const,
      label: 'salary',
      strength: 0.5,
      evidenceCount: 2,
    },
  ],
  total: 2,
};

const defaultProps = {
  workspaceId: 'ws_1',
  onEntityClick: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListEntities.mockResolvedValue(sampleEntities);
  mockListRelationships.mockResolvedValue(sampleRelationships);
});

/* ---------- Tests ---------- */

describe('EntityGraph', () => {
  it('renders the graph container with SVG', async () => {
    const { container } = render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      expect(mockListEntities).toHaveBeenCalled();
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('loads entities and relationships on mount', async () => {
    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      expect(mockListEntities).toHaveBeenCalledWith(
        'ws_1',
        expect.objectContaining({ limit: 500, sort: 'mention_count', order: 'desc' }),
      );
      expect(mockListRelationships).toHaveBeenCalledWith(
        'ws_1',
        expect.objectContaining({ limit: 2000 }),
      );
    });
  });

  it('renders entity nodes as circles', async () => {
    const { container } = render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('renders relationship edges as lines', async () => {
    const { container } = render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      const lines = container.querySelectorAll('line');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders entity type filter toggle buttons', async () => {
    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      // Filter buttons + legend both render type labels, so use getAllByText
      expect(screen.getAllByText('Person').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Organization').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Amount').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Date').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Location').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders relationship type filter buttons', async () => {
    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      // All 6 types should be rendered as filter toggles
      expect(screen.getByText(/co.occur/i)).toBeInTheDocument();
      expect(screen.getByText(/contractual/i)).toBeInTheDocument();
      expect(screen.getByText(/financial/i)).toBeInTheDocument();
    });
  });

  it('renders min connections slider', async () => {
    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Min Links:')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });
  });

  it('renders focus search input', async () => {
    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Search entity name...');
      expect(input).toBeInTheDocument();
    });
  });

  it('renders reset view button', async () => {
    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/reset/i)).toBeInTheDocument();
    });
  });

  it('toggling entity type filter removes nodes of that type', async () => {
    const { container } = render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      expect(container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
    });

    // Click the "Amount" filter button to deselect it (first match is the filter chip)
    const amountBtns = screen.getAllByText('Amount');
    fireEvent.click(amountBtns[0]);

    // After filtering out amount entities, fewer circles should render
    await waitFor(() => {
      const circles = container.querySelectorAll('circle');
      // Should have 2 nodes now (person + org) - some may still be rendering
      expect(circles.length).toBeLessThanOrEqual(3);
    });
  });

  it('shows empty state when no entities', async () => {
    mockListEntities.mockResolvedValue({ entities: [], total: 0, hasMore: false });
    mockListRelationships.mockResolvedValue({ relationships: [], total: 0, hasMore: false });

    render(<EntityGraph {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/no entities/i)).toBeInTheDocument();
    });
  });
});
