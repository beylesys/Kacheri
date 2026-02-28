import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttachmentPanel } from '../components/AttachmentPanel';

/* ---------- Mocks ---------- */

const mockRefetch = vi.fn();
const mockUseAttachments = vi.fn();

vi.mock('../hooks/useAttachments', () => ({
  useAttachments: (...args: unknown[]) => mockUseAttachments(...args),
}));

const mockUpload = vi.fn();
const mockDelete = vi.fn();

vi.mock('../api/attachments', () => ({
  attachmentsApi: {
    upload: (...args: unknown[]) => mockUpload(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock('../components/attachmentPanel.css', () => ({}));

/* ---------- Helpers ---------- */

const sampleAttachment = {
  id: 'att_1',
  docId: 'doc_1',
  filename: 'contract.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1048576, // 1 MB
  uploadedBy: 'test-user',
  uploadedAt: Date.now(),
  storageKey: 'ws_1/attachments/doc_1/contract.pdf',
};

const defaultHookReturn = {
  attachments: [sampleAttachment],
  totalSize: 1048576,
  count: 1,
  limits: { maxCount: 20, maxTotalBytes: 104857600 }, // 100 MB
  loading: false,
  error: null,
  refetch: mockRefetch,
};

const defaultProps = {
  docId: 'doc_1',
  open: true,
  onClose: vi.fn(),
  currentUserId: 'test-user',
  workspaceId: 'ws_1',
  onViewAttachment: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAttachments.mockReturnValue(defaultHookReturn);
  mockUpload.mockResolvedValue({ id: 'att_2' });
  mockDelete.mockResolvedValue(undefined);
  mockRefetch.mockResolvedValue(undefined);
  // Stub confirm for delete tests
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

/* ---------- Tests ---------- */

describe('AttachmentPanel', () => {
  it('renders header and attachment list', () => {
    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
  });

  it('shows file type badge for PDF', () => {
    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('renders storage usage bar', () => {
    render(<AttachmentPanel {...defaultProps} />);

    // formatBytes(1048576) = "1.0 MB", formatBytes(104857600) = "100 MB"
    // All rendered in a single div: "1.0 MB / 100 MB (1/20 files)"
    const usageText = screen.getByText(/1\.0 MB \/ 100 MB/);
    expect(usageText).toBeInTheDocument();
    expect(usageText.textContent).toMatch(/1\/20 files/);
  });

  it('shows warning when usage >= 80%', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultHookReturn,
      totalSize: 83886080, // 80 MB = 80%
    });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Storage nearly full')).toBeInTheDocument();
  });

  it('shows critical warning when usage >= 95%', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultHookReturn,
      totalSize: 99614720, // 95 MB = 95%
    });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Storage almost at capacity')).toBeInTheDocument();
  });

  it('shows "Attachment limit reached" when at capacity', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultHookReturn,
      count: 20,
      totalSize: 104857600,
    });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Attachment limit reached')).toBeInTheDocument();
  });

  it('shows empty state when no attachments', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultHookReturn,
      attachments: [],
      totalSize: 0,
      count: 0,
    });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('No attachments yet. Upload a file above.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseAttachments.mockReturnValue({ ...defaultHookReturn, loading: true });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Loading attachments...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultHookReturn,
      error: 'Network error',
    });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('renders View button that calls onViewAttachment', () => {
    const onViewAttachment = vi.fn();
    render(<AttachmentPanel {...defaultProps} onViewAttachment={onViewAttachment} />);

    fireEvent.click(screen.getByText('View'));

    expect(onViewAttachment).toHaveBeenCalledWith(sampleAttachment);
  });

  it('shows delete button for own uploads', () => {
    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('hides delete button for other users uploads', () => {
    mockUseAttachments.mockReturnValue({
      ...defaultHookReturn,
      attachments: [{ ...sampleAttachment, uploadedBy: 'other-user' }],
    });

    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.queryByText('Del')).not.toBeInTheDocument();
  });

  it('calls delete API with confirmation', async () => {
    render(<AttachmentPanel {...defaultProps} />);

    fireEvent.click(screen.getByText('Del'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('doc_1', 'att_1');
    });
  });

  it('renders dropzone with hint text', () => {
    render(<AttachmentPanel {...defaultProps} />);

    expect(screen.getByText(/drop file here/i)).toBeInTheDocument();
    expect(screen.getByText('PDF, images, Office docs (max 25 MB)')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<AttachmentPanel {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByTitle('Close'));

    expect(onClose).toHaveBeenCalled();
  });
});
