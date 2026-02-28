import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewersPanel } from '../components/ReviewersPanel';

/* ---------- Mocks ---------- */

const mockRefetch = vi.fn();
const mockUseReviewers = vi.fn();

vi.mock('../hooks/useReviewers', () => ({
  useReviewers: (...args: unknown[]) => mockUseReviewers(...args),
}));

const mockAssign = vi.fn();
const mockUpdateStatus = vi.fn();
const mockRemove = vi.fn();

vi.mock('../api/reviewers', () => ({
  reviewersApi: {
    assign: (...args: unknown[]) => mockAssign(...args),
    updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    remove: (...args: unknown[]) => mockRemove(...args),
  },
}));

const mockListMembers = vi.fn();

vi.mock('../api/workspaces', () => ({
  workspacesApi: {
    listMembers: (...args: unknown[]) => mockListMembers(...args),
  },
}));

/* ---------- Helpers ---------- */

const sampleReviewers = [
  {
    id: 'rev_1',
    docId: 'doc_1',
    userId: 'test-user',
    status: 'pending' as const,
    assignedBy: 'admin',
    assignedAt: Date.now(),
    completedAt: null,
    notes: null,
  },
  {
    id: 'rev_2',
    docId: 'doc_1',
    userId: 'user_2',
    status: 'in_review' as const,
    assignedBy: 'admin',
    assignedAt: Date.now(),
    completedAt: null,
    notes: null,
  },
  {
    id: 'rev_3',
    docId: 'doc_1',
    userId: 'user_3',
    status: 'completed' as const,
    assignedBy: 'admin',
    assignedAt: Date.now(),
    completedAt: Date.now(),
    notes: 'Looks good',
  },
];

const defaultHookReturn = {
  reviewers: sampleReviewers,
  count: 3,
  loading: false,
  error: null,
  refetch: mockRefetch,
  stats: { total: 3, pending: 1, inReview: 1, completed: 1 },
};

const defaultProps = {
  docId: 'doc_1',
  open: true,
  onClose: vi.fn(),
  refreshKey: 0,
  currentUserId: 'test-user',
  workspaceId: 'ws_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseReviewers.mockReturnValue(defaultHookReturn);
  mockListMembers.mockResolvedValue([
    { userId: 'test-user', role: 'editor' },
    { userId: 'user_2', role: 'editor' },
    { userId: 'user_3', role: 'editor' },
    { userId: 'user_4', role: 'editor' },
  ]);
  mockAssign.mockResolvedValue({});
  mockUpdateStatus.mockResolvedValue({});
  mockRemove.mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

/* ---------- Tests ---------- */

describe('ReviewersPanel', () => {
  it('returns null when not open', () => {
    const { container } = render(<ReviewersPanel {...defaultProps} open={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders header and stats bar', () => {
    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('Reviewers')).toBeInTheDocument();
    expect(screen.getByText('Total: 3')).toBeInTheDocument();
    expect(screen.getByText('Pending: 1')).toBeInTheDocument();
    expect(screen.getByText('In Review: 1')).toBeInTheDocument();
    expect(screen.getByText('Completed: 1')).toBeInTheDocument();
  });

  it('renders reviewer user IDs', () => {
    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('test-user')).toBeInTheDocument();
    expect(screen.getByText('user_2')).toBeInTheDocument();
    expect(screen.getByText('user_3')).toBeInTheDocument();
  });

  it('renders status badges', () => {
    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('In Review')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows "Start Review" button for self when status is pending', () => {
    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('Start Review')).toBeInTheDocument();
  });

  it('calls updateStatus on Start Review click', async () => {
    render(<ReviewersPanel {...defaultProps} />);

    fireEvent.click(screen.getByText('Start Review'));

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith('doc_1', 'test-user', 'in_review', undefined);
    });
  });

  it('renders completion notes and notes display', () => {
    render(<ReviewersPanel {...defaultProps} />);

    // user_3 has completed with notes
    expect(screen.getByText('Looks good')).toBeInTheDocument();
  });

  it('shows assign section with available members only', async () => {
    render(<ReviewersPanel {...defaultProps} />);

    // Wait for workspace members to load
    await waitFor(() => {
      // user_4 should be in dropdown (not already assigned)
      expect(screen.getByText('user_4')).toBeInTheDocument();
    });
  });

  it('assigns a reviewer on button click', async () => {
    render(<ReviewersPanel {...defaultProps} />);

    // Wait for members to load
    await waitFor(() => {
      expect(screen.getByText('user_4')).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue('Select user...');
    fireEvent.change(select, { target: { value: 'user_4' } });

    fireEvent.click(screen.getByText('Assign'));

    await waitFor(() => {
      expect(mockAssign).toHaveBeenCalledWith('doc_1', 'user_4');
    });
  });

  it('shows remove button for each reviewer', () => {
    render(<ReviewersPanel {...defaultProps} />);

    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons).toHaveLength(3);
  });

  it('calls remove API on Remove click', async () => {
    render(<ReviewersPanel {...defaultProps} />);

    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith('doc_1', 'test-user');
    });
  });

  it('shows loading state', () => {
    mockUseReviewers.mockReturnValue({ ...defaultHookReturn, loading: true });

    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('Loading reviewers...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseReviewers.mockReturnValue({
      ...defaultHookReturn,
      error: 'Server error',
    });

    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('shows empty state when no reviewers', () => {
    mockUseReviewers.mockReturnValue({
      ...defaultHookReturn,
      reviewers: [],
      stats: { total: 0, pending: 0, inReview: 0, completed: 0 },
    });

    render(<ReviewersPanel {...defaultProps} />);

    expect(screen.getByText('No reviewers assigned yet.')).toBeInTheDocument();
  });
});
