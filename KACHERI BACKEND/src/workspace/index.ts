/**
 * Workspace Module - Barrel Export
 *
 * Single entry point for workspace functionality.
 */

// Types
export {
  type Workspace,
  type WorkspaceMember,
  type WorkspaceWithRole,
  type WorkspaceRole,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
  type AddMemberInput,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  hasPermission,
} from './types';

// Store
export {
  createWorkspaceStore,
  type WorkspaceStore,
} from './store';

// Routes
export { createWorkspaceRoutes } from './routes';

// Middleware
export {
  registerWorkspaceMiddleware,
  requireWorkspaceRole,
  hasWorkspaceWriteAccess,
  hasWorkspaceReadAccess,
  getWorkspaceStore,
} from './middleware';
