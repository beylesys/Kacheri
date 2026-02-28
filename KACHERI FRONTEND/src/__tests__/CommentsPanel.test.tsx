import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommentsPanel } from '../components/CommentsPanel';
import type { CommentThread } from '../hooks/useComments';

/* ---------- Mocks ---------- */

const mockFilterThreads = vi.fn();
const mockRefetch = vi.fn();
const mockUseComments = vi.fn();

vi.mock('../hooks/useComments', () => ({
  useComments: (...args: unknown[]) => mockUseComments(...args),
}));

const mockCreateComment = vi.fn();
const mockBulkResolve = vi.fn();

vi.mock('../api/comments', () => ({
  commentsApi: {
    create: (...args: unknown[]) => mockCreateComment(...args),
    bulkResolve: (...args: unknown[]) => mockBulkResolve(...args),
  },
}));

const mockListMembers = vi.fn();

vi.mock('../api/workspaces', () => ({
  workspacesApi: {
    listMembers: (...args: unknown[]) => mockListMembers(...args),
  },
}));

vi.mock('../components/commentsPanel.css', () => ({}));
vi.mock('../components/CommentThread', () => ({
  CommentThread: ({ thread }: { thread: CommentThread }) => (
    <div data-testid={`thread-${thread.threadId}`}>{thread.rootComment.content}</div>
  ),
}));
vi.mock('../components/MentionInput', () => ({
  __esModule: true,
  default: ({ placeholder }: { placeholder: string }) => (
    <textarea data-testid="mention-input" placeholder={placeholder} />
  ),
}));

/* ---------- Helpers ---------- */

const sampleThread: CommentThread = {
  threadId: 'thread_1',
  rootComment: {
    id: 1,
    docId: 'doc_1',
    content: 'Test comment',
    authorId: 'user_1',
    anchorFrom: 0,
    anchorTo: 10,
    anchorText: 'Hello',
    resolved: false,
    parentId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any,
  replies: [],
  isResolved: false,
};

const defaultHookReturn = {
  threads: [sampleThread],
  loading: false,
  error: null,
  refetch: mockRefetch,
  filterThreads: mockFilterThreads,
  stats: { total: 3, open: 2, resolved: 1 },
};

const defaultProps = {
  docId: 'doc_1',
  open: true,
  onClose: vi.fn(),
  editorApi: null,
  currentUserId: 'test-user',
  workspaceId: 'ws_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseComments.mockReturnValue(defaultHookReturn);
  mockFilterThreads.mockReturnValue([sampleThread]);
  mockListMembers.mockResolvedValue([]);
  mockCreateComment.mockResolvedValue({ id: 2 });
  mockBulkResolve.mockResolvedValue({ resolved: 2 });
});

/* ---------- Tests ---------- */

describe('CommentsPanel', () => {
  it('renders filter tabs with counts', () => {
    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('renders the "All" tab as active by default', () => {
    render(<CommentsPanel {...defaultProps} />);

    const allTab = screen.getByText('All').closest('button');
    expect(allTab?.className).toContain('active');
  });

  it('switches filter tab on click', () => {
    render(<CommentsPanel {...defaultProps} />);

    fireEvent.click(screen.getByText('Open'));

    // filterThreads should be called with 'open' on next render
    expect(mockFilterThreads).toHaveBeenCalledWith('open');
  });

  it('shows "Resolve All" button when open comments exist', () => {
    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByText('Resolve All (2)')).toBeInTheDocument();
  });

  it('hides "Resolve All" button when no open comments', () => {
    mockUseComments.mockReturnValue({
      ...defaultHookReturn,
      stats: { total: 1, open: 0, resolved: 1 },
    });

    render(<CommentsPanel {...defaultProps} />);

    expect(screen.queryByText(/resolve all/i)).not.toBeInTheDocument();
  });

  it('renders comment threads', () => {
    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByTestId('thread-thread_1')).toBeInTheDocument();
    expect(screen.getByText('Test comment')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseComments.mockReturnValue({ ...defaultHookReturn, loading: true });

    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByText('Loading comments...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseComments.mockReturnValue({
      ...defaultHookReturn,
      error: 'Failed to load',
    });

    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('shows empty message when no threads match filter', () => {
    mockFilterThreads.mockReturnValue([]);
    mockUseComments.mockReturnValue({
      ...defaultHookReturn,
      threads: [],
      stats: { total: 0, open: 0, resolved: 0 },
    });

    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByText('No comments yet. Select text and add a comment.')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByPlaceholderText('Search comments...')).toBeInTheDocument();
  });

  it('renders author filter dropdown', () => {
    render(<CommentsPanel {...defaultProps} />);

    expect(screen.getByText('All authors')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<CommentsPanel {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByTitle('Close');
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
