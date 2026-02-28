// KACHERI BACKEND/src/routes/workspaceAiSettings.ts
// REST endpoints for per-workspace AI provider, model, and BYOK key configuration.
//
// Endpoints:
// - GET    /workspaces/:wid/ai-settings   — Get workspace AI settings + available providers
// - PUT    /workspaces/:wid/ai-settings   — Update workspace AI settings
// - DELETE /workspaces/:wid/ai-settings   — Clear workspace AI settings (revert to defaults)

import type { FastifyPluginAsync } from "fastify";
import { WorkspaceAiSettingsStore } from "../store/workspaceAiSettings";
import { logAuditEvent } from "../store/audit";
import { hasWorkspaceAdminAccess } from "../workspace/middleware";

/* ---------- Types ---------- */

interface WorkspaceParams {
  wid: string;
}

interface UpdateBody {
  provider?: string | null;
  model?: string | null;
  apiKey?: string | null;
}

type ProviderKey = "dev" | "openai" | "anthropic" | "ollama";

interface ProviderCatalogItem {
  provider: ProviderKey;
  models: string[];
  defaultModel: string | null;
}

/* ---------- Helpers ---------- */

function getUserId(req: {
  headers: Record<string, unknown>;
  user?: { id: string };
}): string {
  if (req.user?.id) return req.user.id;
  const devUser = (
    req.headers["x-dev-user"] as string | undefined
  )
    ?.toString()
    .trim();
  if (devUser) return devUser;
  return "user:local";
}

/** Read comma-separated env var → string[] */
function readCsvEnv(name: string): string[] {
  const v = process.env[name] || "";
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Build available providers catalog from env (same logic as GET /ai/providers) */
function getProvidersCatalog(): {
  providers: ProviderCatalogItem[];
  defaults: { provider: string | null; model: string | null };
} {
  // Infer available providers from env
  const candidates: ProviderKey[] = ["dev"];
  if (process.env.OPENAI_API_KEY) candidates.push("openai");
  if (process.env.ANTHROPIC_API_KEY) candidates.push("anthropic");
  if (process.env.OLLAMA_BASE_URL) candidates.push("ollama");

  const explicit = readCsvEnv("AI_PROVIDERS") as ProviderKey[];
  const providerKeys = explicit.length ? explicit : candidates;

  const items: ProviderCatalogItem[] = providerKeys.map((p) => {
    const envName = `AI_${p.toUpperCase()}_MODELS`;
    const models = readCsvEnv(envName);
    const defaultModelEnv = process.env[`${envName}_DEFAULT`];
    return { provider: p, models, defaultModel: defaultModelEnv ?? null };
  });

  return {
    providers: items,
    defaults: {
      provider: process.env.AI_DEFAULT_PROVIDER || null,
      model: process.env.AI_DEFAULT_MODEL || null,
    },
  };
}

/* ---------- Route ---------- */

const workspaceAiSettingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /workspaces/:wid/ai-settings
  app.get<{ Params: WorkspaceParams }>(
    "/workspaces/:wid/ai-settings",
    { preHandler: [hasWorkspaceAdminAccess] },
    async (req) => {
      const { wid } = req.params;
      const settings = await WorkspaceAiSettingsStore.get(wid);
      const catalog = getProvidersCatalog();

      return {
        provider: settings?.provider ?? null,
        model: settings?.model ?? null,
        hasApiKey: settings?.hasApiKey ?? false,
        availableProviders: catalog.providers,
        serverDefaults: catalog.defaults,
      };
    }
  );

  // PUT /workspaces/:wid/ai-settings
  app.put<{ Params: WorkspaceParams; Body: UpdateBody }>(
    "/workspaces/:wid/ai-settings",
    { preHandler: [hasWorkspaceAdminAccess] },
    async (req, reply) => {
      const { wid } = req.params;
      const body = req.body || {};
      const userId = getUserId(req);

      // Validate provider if specified
      if (body.provider !== undefined && body.provider !== null) {
        const catalog = getProvidersCatalog();
        const knownProviders = catalog.providers.map((p) => p.provider);
        if (!knownProviders.includes(body.provider as ProviderKey)) {
          return reply.status(400).send({
            error: `Unknown provider: ${body.provider}. Available: ${knownProviders.join(", ")}`,
          });
        }
      }

      const settings = await WorkspaceAiSettingsStore.upsert(wid, {
        provider: body.provider,
        model: body.model,
        apiKey: body.apiKey,
      });

      logAuditEvent({
        workspaceId: wid,
        actorId: userId,
        action: "workspace:ai_settings:update",
        targetType: "workspace",
        targetId: wid,
        details: {
          provider: settings.provider,
          model: settings.model,
          hasApiKey: settings.hasApiKey,
        },
      });

      const catalog = getProvidersCatalog();
      return {
        provider: settings.provider,
        model: settings.model,
        hasApiKey: settings.hasApiKey,
        availableProviders: catalog.providers,
        serverDefaults: catalog.defaults,
      };
    }
  );

  // DELETE /workspaces/:wid/ai-settings
  app.delete<{ Params: WorkspaceParams }>(
    "/workspaces/:wid/ai-settings",
    { preHandler: [hasWorkspaceAdminAccess] },
    async (req, reply) => {
      const { wid } = req.params;
      const userId = getUserId(req);

      await WorkspaceAiSettingsStore.remove(wid);

      logAuditEvent({
        workspaceId: wid,
        actorId: userId,
        action: "workspace:ai_settings:delete",
        targetType: "workspace",
        targetId: wid,
        details: { reason: "Reset to server defaults" },
      });

      reply.status(204).send();
    }
  );
};

export default workspaceAiSettingsRoutes;
