// KACHERI BACKEND/src/store/templates.ts
// Template store for loading built-in document templates from JSON files.

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  content: object; // Tiptap JSON content
}

export interface TemplateListItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

// In-memory cache of loaded templates
let templatesCache: Template[] | null = null;

/**
 * Get the path to the templates directory.
 * Resolves relative to the project root (one level up from src/).
 */
function getTemplatesDir(): string {
  return join(__dirname, '..', '..', 'templates');
}

/**
 * Load all templates from JSON files in the templates directory.
 * Results are cached in memory for performance.
 */
function loadTemplates(): Template[] {
  if (templatesCache !== null) {
    return templatesCache;
  }

  const templatesDir = getTemplatesDir();
  const templates: Template[] = [];

  try {
    const files = readdirSync(templatesDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = join(templatesDir, file);
        const raw = readFileSync(filePath, 'utf8');
        const template = JSON.parse(raw) as Template;

        // Validate required fields
        if (
          template.id &&
          template.name &&
          template.description &&
          template.icon &&
          template.category &&
          template.content
        ) {
          templates.push(template);
        } else {
          console.warn(`[templates] Invalid template file: ${file} - missing required fields`);
        }
      } catch (err) {
        console.warn(`[templates] Failed to load template file: ${file}`, err);
      }
    }

    // Sort by category then name for consistent ordering
    templates.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    templatesCache = templates;
    console.log(`[templates] Loaded ${templates.length} templates`);
  } catch (err) {
    console.error('[templates] Failed to read templates directory:', err);
    templatesCache = [];
  }

  return templatesCache;
}

/**
 * List all available templates (without content).
 * Returns metadata for display in template gallery.
 */
export function listTemplates(): TemplateListItem[] {
  const templates = loadTemplates();
  return templates.map(({ id, name, description, icon, category }) => ({
    id,
    name,
    description,
    icon,
    category,
  }));
}

/**
 * Get a single template by ID (with content).
 * Returns null if template not found.
 */
export function getTemplate(id: string): Template | null {
  const templates = loadTemplates();
  return templates.find(t => t.id === id) || null;
}

/**
 * Clear the templates cache.
 * Useful for testing or if templates are updated at runtime.
 */
export function clearTemplatesCache(): void {
  templatesCache = null;
}

/**
 * Check if a template exists by ID.
 */
export function templateExists(id: string): boolean {
  return getTemplate(id) !== null;
}
