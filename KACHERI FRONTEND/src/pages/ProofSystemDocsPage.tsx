// KACHERI FRONTEND/src/pages/ProofSystemDocsPage.tsx
// Comprehensive documentation page for the Proof System with FAQ section

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './proofSystemDocsPage.css';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What does "Verified" mean?',
    answer: 'A "Verified" status means the cryptographic hash of the file or content matches the hash recorded when the proof was created. This confirms the content has not been modified since the proof was generated.',
  },
  {
    question: 'What causes a "Stale" status?',
    answer: 'A proof becomes "Stale" when it hasn\'t been re-verified recently (typically more than 7 days). While the proof itself is still valid, re-verification is recommended to ensure ongoing integrity. Use the "Verify Now" button to refresh the status.',
  },
  {
    question: 'How do I fix a "Failed" verification?',
    answer: 'A "Failed" verification indicates the file has been modified since the proof was created. This could happen if someone edited an exported file externally. To resolve this, re-export the document to create a new, valid proof. The old proof will remain for audit purposes.',
  },
  {
    question: 'What is compose determinism?',
    answer: 'Compose determinism measures whether AI-generated content is reproducible. When you use AI to compose text, we record the exact prompt and output. Determinism checks verify that re-running the same prompt produces consistent results. A "pass" means the AI output was reproducible; "drift" indicates different output on re-run.',
  },
  {
    question: 'How does the AI heatmap work?',
    answer: 'The AI heatmap visually highlights sections of your document that were generated or modified by AI. Enable the "Show AI" toggle in the editor to see color-coded overlays: green for AI compose, blue for AI rewrites, and yellow for translations. This helps you quickly identify AI-touched content.',
  },
  {
    question: 'Where are proofs stored?',
    answer: 'All proofs are stored in Kacheri\'s database alongside your documents. Each proof contains: the SHA-256 hash of the content, timestamp of creation, the type of action (export, compose, rewrite), and metadata about the AI model if applicable. Proofs are immutable once created.',
  },
  {
    question: 'Can proofs be deleted or modified?',
    answer: 'No, proofs are immutable by design. Once created, they cannot be modified or deleted. This ensures a complete audit trail of all document actions. Even if you delete a document, its proof history is retained for compliance purposes.',
  },
  {
    question: 'What file formats support export proofs?',
    answer: 'Export proofs are generated for PDF and DOCX exports. When you export a document, Kacheri automatically computes a SHA-256 hash of the file and stores it as a proof. You can later verify any copy of the exported file against this hash.',
  },
];

function FAQ({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="faq-list">
      {items.map((item, index) => (
        <div key={index} className="faq-item">
          <button
            className={`faq-question ${openIndex === index ? 'open' : ''}`}
            onClick={() => toggle(index)}
            aria-expanded={openIndex === index}
            aria-controls={`faq-answer-${index}`}
          >
            <span className="faq-icon">{openIndex === index ? '−' : '+'}</span>
            <span>{item.question}</span>
          </button>
          <div
            id={`faq-answer-${index}`}
            className={`faq-answer ${openIndex === index ? 'open' : ''}`}
            role="region"
            aria-labelledby={`faq-question-${index}`}
          >
            <p>{item.answer}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProofSystemDocsPage() {
  const navigate = useNavigate();

  return (
    <div className="proof-docs-page">
      <div className="proof-docs-container">
        {/* Header */}
        <header className="proof-docs-header">
          <button
            className="proof-docs-back"
            onClick={() => navigate(-1)}
            title="Go back"
          >
            <span className="back-arrow">←</span>
            <span>Back</span>
          </button>
          <h1>Proof System Documentation</h1>
        </header>

        {/* Content */}
        <main className="proof-docs-content">
          {/* Overview Section */}
          <section className="proof-docs-section">
            <h2>What is the Proof System?</h2>
            <p>
              Kacheri's Proof System creates cryptographic evidence for every significant
              document action. Each export, AI composition, and rewrite generates an
              immutable proof record containing SHA-256 hashes, timestamps, and metadata.
              This provides complete auditability and allows you to verify document
              integrity at any time.
            </p>
          </section>

          {/* Proof Types Section */}
          <section className="proof-docs-section">
            <h2>Proof Types</h2>
            <div className="proof-types-grid">
              <div className="proof-type-card">
                <div className="proof-type-icon">📄</div>
                <h3>Export Proofs</h3>
                <p>
                  Generated when you export to PDF or DOCX. Contains the file's SHA-256
                  hash, allowing verification that the file hasn't been modified since export.
                </p>
              </div>
              <div className="proof-type-card">
                <div className="proof-type-icon">🤖</div>
                <h3>Compose Proofs</h3>
                <p>
                  Records AI-generated content including the provider, model, full prompt,
                  and output hash. Enables determinism checks to verify reproducibility.
                </p>
              </div>
              <div className="proof-type-card">
                <div className="proof-type-icon">✏️</div>
                <h3>Rewrite Proofs</h3>
                <p>
                  Tracks AI-assisted text modifications with before/after hashes and the
                  exact selection range. Shows what was changed and by which AI model.
                </p>
              </div>
            </div>
          </section>

          {/* Health Badges Section */}
          <section className="proof-docs-section">
            <h2>Understanding Health Badges</h2>
            <p>
              Every document displays a health badge indicating its proof verification status.
              Here's what each status means:
            </p>
            <div className="health-badges-list">
              <div className="health-badge-item">
                <span className="badge-indicator healthy"></span>
                <div className="badge-info">
                  <strong>Healthy</strong>
                  <span>All proofs verified successfully. Document integrity confirmed.</span>
                </div>
              </div>
              <div className="health-badge-item">
                <span className="badge-indicator stale"></span>
                <div className="badge-info">
                  <strong>Stale</strong>
                  <span>Proofs exist but haven't been re-verified recently. Consider re-verifying.</span>
                </div>
              </div>
              <div className="health-badge-item">
                <span className="badge-indicator unverified"></span>
                <div className="badge-info">
                  <strong>Unverified</strong>
                  <span>Some exports or AI actions lack verification proofs.</span>
                </div>
              </div>
              <div className="health-badge-item">
                <span className="badge-indicator failed"></span>
                <div className="badge-info">
                  <strong>Failed</strong>
                  <span>One or more proof verifications failed. Review in Proofs panel.</span>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ Section */}
          <section className="proof-docs-section">
            <h2>Frequently Asked Questions</h2>
            <FAQ items={FAQ_ITEMS} />
          </section>

          {/* Quick Actions */}
          <section className="proof-docs-section proof-docs-actions">
            <h2>Quick Actions</h2>
            <div className="quick-actions-row">
              <button
                className="quick-action-btn"
                onClick={() => navigate('/ai-watch')}
              >
                View AI Dashboard
              </button>
              <button
                className="quick-action-btn secondary"
                onClick={() => navigate('/')}
              >
                Go to Documents
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
