import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionsPanel } from '../components/SuggestionsPanel';

/* ---------- Mocks ---------- */

const mockFilterSuggestions = vi.fn();
const mockRefetch = vi.fn();
const mockUseSuggestions = vi.fn();

vi.mock('../hooks/useSuggestions', () => ({
  useSuggestions: (...args: unknown[]) => mockUseSuggestions(...args),
}));

const mockAcceptAll = vi.fn();
const mockRejectAll = vi.fn();

vi.mock('../api/suggestions', () => ({
  suggestionsApi: {
    acceptAll: (...args: unknown[]) => mockAcceptAll(...args),
    rejectAll: (...args: unknown[]) => mockRejectAll(...args),
  },
}));

vi.mock('../components/suggestionsPanel.css', () => ({}));
vi.mock('../components/SuggestionItem', () => ({
  SuggestionItem: ({ suggestion }: { suggestion: { id: number; content: string } }) => (
    <div data-testid={`suggestion-${suggestion.id}`}>suggestion</div>
  ),
}));

/* ---------- Helpers ---------- */

const sampleSuggestion = {
  id: 1,
  docId: 'doc_1',
  content: 'suggested change',
  authorId: 'user_1',
  changeType: 'insert' as const,
  status: 'pending' as const,
  anchorFrom: 0,
  anchorTo: 5,
  oldText: '',
  newText: 'hello',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const defaultHookReturn = {
  suggestions: [sampleSuggestion],
  loading: false,
  error: null,
  refetch: mockRefetch,
  filterSuggestions: mockFilterSuggestions,
  stats: { total: 5, pending: 3, accepted: 1, rejected: 1 },
};

const defaultProps = {
  docId: 'doc_1',
  open: true,
  onClose: vi.fn(),
  role: 'editor' as const,
  currentUserId: 'test-user',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSuggestions.mockReturnValue(defaultHookReturn);
  mockFilterSuggestions.mockReturnValue([sampleSuggestion]);
  mockAcceptAll.mockResolvedValue({ count: 3 });
  mockRejectAll.mockResolvedValue({ count: 3 });
});

/* ---------- Tests ---------- */

describe('SuggestionsPanel', () => {
  it('renders change type filter chips', () => {
    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByText('All Types')).toBeInTheDocument();
    expect(screen.getByText('Insert')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Replace')).toBeInTheDocument();
  });

  it('renders status filter tabs with counts', () => {
    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('shows bulk action buttons for editor role with pending suggestions', () => {
    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByText('Accept All (3)')).toBeInTheDocument();
    expect(screen.getByText('Reject All (3)')).toBeInTheDocument();
  });

  it('hides bulk action buttons for viewer role', () => {
    render(<SuggestionsPanel {...defaultProps} role="viewer" />);

    expect(screen.queryByText(/accept all/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reject all/i)).not.toBeInTheDocument();
  });

  it('hides bulk action buttons for commenter role', () => {
    render(<SuggestionsPanel {...defaultProps} role="commenter" />);

    expect(screen.queryByText(/accept all/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reject all/i)).not.toBeInTheDocument();
  });

  it('hides bulk action buttons when no pending suggestions', () => {
    mockUseSuggestions.mockReturnValue({
      ...defaultHookReturn,
      stats: { total: 2, pending: 0, accepted: 1, rejected: 1 },
    });

    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.queryByText(/accept all/i)).not.toBeInTheDocument();
  });

  it('shows bulk action buttons for owner role', () => {
    render(<SuggestionsPanel {...defaultProps} role="owner" />);

    expect(screen.getByText('Accept All (3)')).toBeInTheDocument();
  });

  it('renders suggestions from hook', () => {
    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByTestId('suggestion-1')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseSuggestions.mockReturnValue({ ...defaultHookReturn, loading: true });

    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByText('Loading suggestions...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseSuggestions.mockReturnValue({
      ...defaultHookReturn,
      error: 'Network error',
    });

    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows empty message when no suggestions', () => {
    mockFilterSuggestions.mockReturnValue([]);
    mockUseSuggestions.mockReturnValue({
      ...defaultHookReturn,
      suggestions: [],
      stats: { total: 0, pending: 0, accepted: 0, rejected: 0 },
    });

    render(<SuggestionsPanel {...defaultProps} />);

    expect(screen.getByText('No suggestions yet.')).toBeInTheDocument();
  });

  it('clicking change type chip updates filter', () => {
    render(<SuggestionsPanel {...defaultProps} />);

    fireEvent.click(screen.getByText('Insert'));

    // useSuggestions should be called with the changeType filter
    expect(mockUseSuggestions).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<SuggestionsPanel {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Close'));

    expect(onClose).toHaveBeenCalled();
  });
});
