// KACHERI BACKEND/src/routes/config.ts
// Slices M3 + P3: Platform Config Endpoint
//
// Public endpoint returning enabled products, platform version,
// and feature availability. Used by frontend and external clients
// to discover what is available in this deployment.
//
// P3: Replaced local isMemoryGraphEnabled() with registry's isFeatureEnabled().

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getProductRegistry, isProductEnabled, isFeatureEnabled } from '../modules/registry';
import pkg from '../../package.json';

/** Response shape for GET /config */
export interface PlatformConfigResponse {
  products: string[];
  version: string;
  features: {
    docs: { enabled: boolean };
    designStudio: { enabled: boolean };
    jaal: { enabled: boolean };
    memoryGraph: { enabled: boolean };
  };
}

/* ---------- Route Registration ---------- */
export default async function configRoutes(app: FastifyInstance) {
  /**
   * GET /config
   * Public endpoint — no auth required.
   * Returns platform configuration: enabled products, version, feature flags.
   */
  app.get(
    '/config',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const registry = getProductRegistry();

      const response: PlatformConfigResponse = {
        products: [...registry.enabledProducts],
        version: pkg.version,
        features: {
          docs: { enabled: isProductEnabled('docs') },
          designStudio: { enabled: isProductEnabled('design-studio') },
          jaal: { enabled: isProductEnabled('jaal') },
          memoryGraph: { enabled: isFeatureEnabled('memoryGraph') },
        },
      };

      return reply.send(response);
    }
  );
}
