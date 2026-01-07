// Minimal types for the CJS utility we use
declare module '@y/websocket-server/dist/utils.cjs' {
  // We only need the signature for setupWSConnection
  // Avoid importing 'ws' types here to keep it resilient.
  export function setupWSConnection(
    ws: any,
    req: any,
    opts?: { docName?: string; gc?: boolean }
  ): void;
}
