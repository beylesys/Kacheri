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
import WorkspaceStandardsPage from "./pages/WorkspaceStandardsPage"; // Slice 15
import WorkspaceCompliancePage from "./pages/WorkspaceCompliancePage"; // Slice A11
import WorkspaceClausesPage from "./pages/WorkspaceClausesPage"; // Slice B14
import WorkspaceKnowledgeExplorerPage from "./pages/WorkspaceKnowledgeExplorerPage"; // Slice 14
import WorkspaceNegotiationsPage from "./pages/WorkspaceNegotiationsPage"; // Slice 18
import { ProductGuard } from "./modules/ProductGuard"; // Slice M2
import DesignStudioPage from "./DesignStudioPage"; // Slice C2
import HomePage from "./HomePage"; // Slice S2
import { DeploymentProvider } from "./platform/context"; // Slice S1
import JaalBrowserView from "./components/jaal/JaalBrowserView"; // Slice S4
import PlatformSettingsPage from "./components/PlatformSettingsPage"; // Slice S23

export default function App() {
  return (
    <DeploymentProvider>
      <AppLayout>
        <Routes>
          {/* Auth routes (public) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Invite accept page (requires auth but shows its own login prompt) */}
          <Route path="/invite/:token" element={<InviteAcceptPage />} />

          {/* Homepage — universal product launcher (Slice S2) */}
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          {/* Shared protected routes (always available) */}
          <Route path="/files" element={<ProtectedRoute><FileManagerPage /></ProtectedRoute>} />
          <Route path="/ai-watch" element={<ProtectedRoute><AIDashboard /></ProtectedRoute>} />
          <Route path="/workspaces/:id/ai-safety" element={<ProtectedRoute><WorkspaceAISafetyPage /></ProtectedRoute>} />
          <Route path="/help/proofs" element={<ProtectedRoute><ProofSystemDocsPage /></ProtectedRoute>} />
          <Route path="/workspaces/:id/knowledge" element={<ProtectedRoute><WorkspaceKnowledgeExplorerPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><PlatformSettingsPage /></ProtectedRoute>} />

          {/* Docs product routes (guarded by ProductGuard) */}
          <Route path="/docs" element={<ProtectedRoute><ProductGuard product="docs"><DocList /></ProductGuard></ProtectedRoute>} />
          <Route path="/doc/:id" element={<ProtectedRoute><ProductGuard product="docs"><EditorPage /></ProductGuard></ProtectedRoute>} />
          <Route path="/workspaces/:id/extraction-standards" element={<ProtectedRoute><ProductGuard product="docs"><WorkspaceStandardsPage /></ProductGuard></ProtectedRoute>} />
          <Route path="/workspaces/:id/compliance-policies" element={<ProtectedRoute><ProductGuard product="docs"><WorkspaceCompliancePage /></ProductGuard></ProtectedRoute>} />
          <Route path="/workspaces/:id/clauses" element={<ProtectedRoute><ProductGuard product="docs"><WorkspaceClausesPage /></ProductGuard></ProtectedRoute>} />
          <Route path="/workspaces/:id/negotiations" element={<ProtectedRoute><ProductGuard product="docs"><WorkspaceNegotiationsPage /></ProductGuard></ProtectedRoute>} />

          {/* Design Studio product routes (Slice C2) */}
          <Route path="/workspaces/:id/studio/:cid" element={<ProtectedRoute><ProductGuard product="design-studio"><DesignStudioPage /></ProductGuard></ProtectedRoute>} />

          {/* JAAL product routes (Slice S4) */}
          <Route path="/jaal" element={<ProtectedRoute><ProductGuard product="jaal"><JaalBrowserView /></ProductGuard></ProtectedRoute>} />
          <Route path="/jaal/session/:sid" element={<ProtectedRoute><ProductGuard product="jaal"><JaalBrowserView /></ProductGuard></ProtectedRoute>} />

          {/* Fallback: anything unknown → home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </DeploymentProvider>
  );
}
