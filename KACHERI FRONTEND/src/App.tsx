// KACHERI FRONTEND/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import DocList from "./DocList";
import EditorPage from "./EditorPage";
import AIDashboard from "./AIDashboard"; // Global AI Watch UI
import WorkspaceAISafetyPage from "./WorkspaceAISafetyPage"; // Phase 5 - P2.1
import FileManagerPage from "./FileManagerPage"; // Workspace home: folders + docs
import { LoginPage, RegisterPage, ProtectedRoute } from "./auth";
import { AppLayout } from "./components/AppLayout";
import { InviteAcceptPage } from "./pages/InviteAcceptPage";
import ProofSystemDocsPage from "./pages/ProofSystemDocsPage"; // Phase 5 - P3.3

export default function App() {
  return (
    <AppLayout>
      <Routes>
        {/* Auth routes (public) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Invite accept page (requires auth but shows its own login prompt) */}
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        {/* Protected routes */}
        <Route path="/" element={<ProtectedRoute><FileManagerPage /></ProtectedRoute>} />
        <Route path="/docs" element={<ProtectedRoute><DocList /></ProtectedRoute>} />
        <Route path="/doc/:id" element={<ProtectedRoute><EditorPage /></ProtectedRoute>} />
        <Route path="/files" element={<ProtectedRoute><FileManagerPage /></ProtectedRoute>} />
        <Route path="/ai-watch" element={<ProtectedRoute><AIDashboard /></ProtectedRoute>} />
        <Route path="/workspaces/:id/ai-safety" element={<ProtectedRoute><WorkspaceAISafetyPage /></ProtectedRoute>} />
        <Route path="/help/proofs" element={<ProtectedRoute><ProofSystemDocsPage /></ProtectedRoute>} />

        {/* Fallback: anything unknown → home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}
