/* === KCL Version Registry === */

export interface KCLVersionEntry {
  version: string;
  date: string;
  changelog: string[];
}

/** Current KCL version — used by the runtime and build system */
export const CURRENT_VERSION = '1.0.0';

/** Registry of all KCL versions with release metadata */
export const KCL_VERSIONS: KCLVersionEntry[] = [
  {
    version: '1.0.0',
    date: '2026-02-22',
    changelog: [
      'Initial KCL release',
      '12 core components: kcl-slide, kcl-text, kcl-layout, kcl-image, kcl-list, kcl-quote, kcl-metric, kcl-icon, kcl-animate, kcl-code, kcl-embed, kcl-source',
      '4 data visualization components: kcl-chart, kcl-table, kcl-timeline, kcl-compare',
      'Data binding via <script data-for> blocks',
      'CSS custom properties theming',
      'WCAG AA accessible defaults',
      'Error overlay for invalid component usage',
    ],
  },
];

/** Returns list of available version strings */
export function getAvailableVersions(): string[] {
  return KCL_VERSIONS.map((v) => v.version);
}

/** Checks whether a given version string is in the registry */
export function isValidVersion(version: string): boolean {
  return KCL_VERSIONS.some((v) => v.version === version);
}

/** Returns the version entry for a given version string, or undefined */
export function getVersionEntry(version: string): KCLVersionEntry | undefined {
  return KCL_VERSIONS.find((v) => v.version === version);
}
