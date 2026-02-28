import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DocLinkGraph from '../components/knowledge/DocLinkGraph';

/* ---------- Mocks ---------- */

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockDocsList = vi.fn();

vi.mock('../api', () => ({
  DocsAPI: {
    list: (...args: unknown[]) => mockDocsList(...args),
  },
}));

const mockListLinks = vi.fn();

vi.mock('../api/docLinks', () => ({
  docLinksApi: {
    listLinks: (...args: unknown[]) => mockListLinks(...args),
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

const sampleDocs = [
  { id: 'doc_1', title: 'Contract A', updatedAt: Date.now() },
  { id: 'doc_2', title: 'Contract B', updatedAt: Date.now() - 1000 },
  { id: 'doc_3', title: 'NDA', updatedAt: Date.now() - 2000 },
];

const sampleLinks = [
  { id: 1, fromDocId: 'doc_1', toDocId: 'doc_2', linkText: 'See also' },
  { id: 2, fromDocId: 'doc_1', toDocId: 'doc_3', linkText: 'Related NDA' },
];

const defaultProps = {
  workspaceId: 'ws_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDocsList.mockResolvedValue(sampleDocs);
  mockListLinks.mockImplementation((docId: string) => {
    const links = sampleLinks.filter(l => l.fromDocId === docId);
    return Promise.resolve({ links });
  });
});

/* ---------- Tests ---------- */

describe('DocLinkGraph', () => {
  it('renders the graph container and SVG', async () => {
    const { container } = render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      expect(mockDocsList).toHaveBeenCalled();
    });

    // SVG should be rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('loads docs and links on mount', async () => {
    render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      expect(mockDocsList).toHaveBeenCalled();
    });

    await waitFor(() => {
      // Should call listLinks for each doc
      expect(mockListLinks).toHaveBeenCalled();
    });
  });

  it('renders nodes as circles in the SVG', async () => {
    const { container } = render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      const circles = container.querySelectorAll('circle');
      // At least the 3 document nodes
      expect(circles.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('renders edges as lines in the SVG', async () => {
    const { container } = render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      const lines = container.querySelectorAll('line');
      // 2 links
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders filter slider for min link count', async () => {
    render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Min Links:')).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    });
  });

  it('renders focus search input', async () => {
    render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Search doc title...');
      expect(input).toBeInTheDocument();
    });
  });

  it('renders reset view button', async () => {
    render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/reset/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no docs', async () => {
    mockDocsList.mockResolvedValue([]);

    render(<DocLinkGraph {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/no documents/i)).toBeInTheDocument();
    });
  });
});
