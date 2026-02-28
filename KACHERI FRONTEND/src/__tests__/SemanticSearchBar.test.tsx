import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SemanticSearchBar from '../components/knowledge/SemanticSearchBar';

/* ---------- Mocks ---------- */

const mockSemanticSearch = vi.fn();
const mockKeywordSearch = vi.fn();

vi.mock('../api/knowledge', () => ({
  knowledgeApi: {
    semanticSearch: (...args: unknown[]) => mockSemanticSearch(...args),
    keywordSearch: (...args: unknown[]) => mockKeywordSearch(...args),
  },
}));

/* Stub the CSS import */
vi.mock('../components/knowledge/knowledge.css', () => ({}));

/* ---------- Helpers ---------- */

const defaultProps = {
  workspaceId: 'ws_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSemanticSearch.mockResolvedValue({ results: [], total: 0 });
  mockKeywordSearch.mockResolvedValue({ results: [], total: 0 });
});

/* ---------- Tests ---------- */

describe('SemanticSearchBar', () => {
  it('renders mode toggle buttons and input', () => {
    render(<SemanticSearchBar {...defaultProps} />);

    expect(screen.getByRole('button', { name: /semantic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask about your documents/i)).toBeInTheDocument();
  });

  it('semantic mode is active by default', () => {
    render(<SemanticSearchBar {...defaultProps} />);

    const semanticBtn = screen.getByRole('button', { name: /semantic/i });
    expect(semanticBtn.className).toContain('active');
  });

  it('switches to quick mode on click', () => {
    render(<SemanticSearchBar {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /quick/i }));

    const quickBtn = screen.getByRole('button', { name: /quick/i });
    expect(quickBtn.className).toContain('active');
    expect(screen.getByPlaceholderText(/search entities and documents/i)).toBeInTheDocument();
  });

  it('submit button shows "Ask" in semantic mode and "Search" in quick mode', () => {
    render(<SemanticSearchBar {...defaultProps} initialQuery="test" />);

    // Semantic mode default
    expect(screen.getByRole('button', { name: /ask/i })).toBeInTheDocument();

    // Switch to quick
    fireEvent.click(screen.getByRole('button', { name: /quick/i }));
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('submit button is disabled when input is empty', () => {
    render(<SemanticSearchBar {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    const submitBtn = buttons.find(b => b.textContent === 'Ask');
    expect(submitBtn).toBeDisabled();
  });

  it('calls semanticSearch on submit in semantic mode', async () => {
    const onSemanticResult = vi.fn();
    render(
      <SemanticSearchBar
        {...defaultProps}
        initialQuery="what is liability?"
        onSemanticResult={onSemanticResult}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => {
      expect(mockSemanticSearch).toHaveBeenCalledWith('ws_1', {
        query: 'what is liability?',
        limit: 10,
      });
    });

    await waitFor(() => {
      expect(onSemanticResult).toHaveBeenCalled();
    });
  });

  it('calls keywordSearch on submit in quick mode', async () => {
    const onKeywordResult = vi.fn();
    render(
      <SemanticSearchBar
        {...defaultProps}
        initialQuery="liability"
        onKeywordResult={onKeywordResult}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /quick/i }));
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => {
      expect(mockKeywordSearch).toHaveBeenCalledWith('ws_1', 'liability', 20);
    });

    await waitFor(() => {
      expect(onKeywordResult).toHaveBeenCalled();
    });
  });

  it('submits on Enter key press', async () => {
    render(<SemanticSearchBar {...defaultProps} initialQuery="test query" />);

    const input = screen.getByPlaceholderText(/ask about your documents/i);
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(mockSemanticSearch).toHaveBeenCalled();
    });
  });

  it('shows clear button when text is present and clears on click', () => {
    const onClear = vi.fn();
    render(
      <SemanticSearchBar {...defaultProps} initialQuery="test" onClear={onClear} />,
    );

    const clearBtn = screen.getByTitle('Clear search');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it('displays error message with retry button on API failure', async () => {
    mockSemanticSearch.mockRejectedValueOnce(new Error('Network error'));

    render(<SemanticSearchBar {...defaultProps} initialQuery="test" />);

    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onLoadingChange when loading state changes', async () => {
    const onLoadingChange = vi.fn();
    render(
      <SemanticSearchBar
        {...defaultProps}
        initialQuery="test"
        onLoadingChange={onLoadingChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ask/i }));

    await waitFor(() => {
      expect(onLoadingChange).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(onLoadingChange).toHaveBeenCalledWith(false);
    });
  });
});
