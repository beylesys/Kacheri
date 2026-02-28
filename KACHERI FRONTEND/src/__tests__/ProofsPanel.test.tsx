import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProofsPanel from '../ProofsPanel';

/* ---------- Mocks ---------- */

const mockListExports = vi.fn();
const mockListProvenance = vi.fn();
const mockVerifyExport = vi.fn();

vi.mock('../api', () => ({
  EvidenceAPI: {
    listExports: (...args: unknown[]) => mockListExports(...args),
    listProvenance: (...args: unknown[]) => mockListProvenance(...args),
  },
  ProofHealthAPI: {
    verifyExport: (...args: unknown[]) => mockVerifyExport(...args),
  },
}));

vi.mock('../utils/tooltipHelpers', () => ({
  PROOF_TOOLTIPS: {
    proofTypes: { pdf: 'PDF proof', docx: 'DOCX proof', export: 'Export proof' },
    verificationBadges: {
      pass: 'Hash matches',
      fail: 'Hash mismatch',
      miss: 'File not found',
      pending: 'Not yet verified',
    },
    features: {
      proofHealth: 'Document proof health',
      verifyNow: 'Verify this export now',
    },
  },
}));

/* ---------- Helpers ---------- */

const sampleExports = [
  {
    id: 'exp_1',
    ts: Date.now(),
    kind: 'pdf',
    sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    verified: true,
    verificationStatus: 'pass',
    verifiedAt: new Date().toISOString(),
    fileName: 'document.pdf',
    size: 102400,
  },
  {
    id: 'exp_2',
    ts: Date.now() - 3600000,
    kind: 'docx',
    sha256: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    verified: false,
    verificationStatus: 'pending',
    verifiedAt: null,
    fileName: 'document.docx',
    size: 51200,
  },
];

const sampleProvenance = [
  {
    id: 'prov_1',
    ts: Date.now(),
    actor: 'test-user',
    action: 'create',
    preview: 'Document created',
  },
  {
    id: 'prov_2',
    ts: Date.now() - 1000,
    actor: 'test-user',
    action: 'ai:extraction',
    preview: null,
    details: {
      documentType: 'contract',
      typeConfidence: 0.92,
      anomalyCount: 0,
      provider: 'openai',
      model: 'gpt-4',
      proofHash: 'abc123def456abc123def456abc123def456',
    },
  },
  {
    id: 'prov_3',
    ts: Date.now() - 2000,
    actor: 'test-user',
    action: 'compliance:check',
    preview: null,
    details: {
      status: 'passed',
      totalPolicies: 3,
      passed: 3,
      violations: 0,
      warnings: 1,
      triggeredBy: 'manual',
      proofHash: 'def456abc123def456abc123def456abc123',
    },
  },
];

const defaultProps = {
  docId: 'doc_1',
  open: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListExports.mockResolvedValue(sampleExports);
  mockListProvenance.mockResolvedValue(sampleProvenance);
  mockVerifyExport.mockResolvedValue({ verified: true });
});

/* ---------- Tests ---------- */

describe('ProofsPanel', () => {
  it('renders panel heading and sections', async () => {
    render(<ProofsPanel {...defaultProps} />);

    expect(screen.getByText('Proofs & Activity')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Exports')).toBeInTheDocument();
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });
  });

  it('loads and displays exports', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(mockListExports).toHaveBeenCalledWith('doc_1');
    });

    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
      expect(screen.getByText('document.docx')).toBeInTheDocument();
    });
  });

  it('shows verification badges — Verified and Unverified', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Verified')).toBeInTheDocument();
      expect(screen.getByText('Unverified')).toBeInTheDocument();
    });
  });

  it('shows hash badges for exports', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/hash abcdef12345678/)).toBeInTheDocument();
      expect(screen.getByText(/hash 1234567890abcdef/)).toBeInTheDocument();
    });
  });

  it('renders Verify Now button and calls API', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getAllByText('Verify Now')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByText('Verify Now')[0]);

    await waitFor(() => {
      expect(mockVerifyExport).toHaveBeenCalledWith('doc_1', 'exp_1');
    });
  });

  it('renders Download links for exports with files', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      const downloadLinks = screen.getAllByText('Download');
      expect(downloadLinks.length).toBeGreaterThan(0);
    });
  });

  it('renders timeline provenance events', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('AI Extraction')).toBeInTheDocument();
      expect(screen.getByText('Compliance Check')).toBeInTheDocument();
    });
  });

  it('renders extraction detail card with doc type and confidence', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Contract')).toBeInTheDocument();
      expect(screen.getByText('92%')).toBeInTheDocument();
    });
  });

  it('renders compliance detail card with status', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Passed')).toBeInTheDocument();
      expect(screen.getByText('3/3 passed')).toBeInTheDocument();
      expect(screen.getByText('1 warning')).toBeInTheDocument();
    });
  });

  it('renders action filter buttons', async () => {
    render(<ProofsPanel {...defaultProps} />);

    expect(screen.getByText('all')).toBeInTheDocument();
    expect(screen.getByText('create')).toBeInTheDocument();
    expect(screen.getByText('ai:extraction')).toBeInTheDocument();
  });

  it('clicking a filter button reloads provenance', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(mockListProvenance).toHaveBeenCalled();
    });

    const createFilter = screen.getByText('create');
    fireEvent.click(createFilter);

    await waitFor(() => {
      expect(mockListProvenance).toHaveBeenCalledWith('doc_1', expect.objectContaining({
        action: 'create',
      }));
    });
  });

  it('Load older button triggers pagination', async () => {
    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Load older')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Load older'));

    // Should have called listProvenance at least twice (initial + load older)
    await waitFor(() => {
      expect(mockListProvenance.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows empty exports state', async () => {
    mockListExports.mockResolvedValue([]);

    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No exports yet.')).toBeInTheDocument();
    });
  });

  it('shows empty timeline state', async () => {
    mockListProvenance.mockResolvedValue([]);

    render(<ProofsPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('No events yet.')).toBeInTheDocument();
    });
  });
});
