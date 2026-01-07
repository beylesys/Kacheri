declare module 'ollama' {
  export class Ollama {
    constructor(options?: { host?: string });
    chat(input: any): Promise<any>;
  }
}
declare module 'html-to-docx' {
  function htmlToDocx(html: string, options?: any): Promise<Buffer>;
  export default htmlToDocx;
}
