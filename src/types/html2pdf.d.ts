declare module 'html2pdf.js' {
  export type Html2PdfMargin = number | [number, number] | [number, number, number, number];

  export interface Html2PdfOptions {
    margin?: Html2PdfMargin;
    filename?: string;
    image?: { type?: 'jpeg' | 'png' | 'webp'; quality?: number };
    enableLinks?: boolean;
    html2canvas?: { scale?: number; useCORS?: boolean; logging?: boolean; letterRendering?: boolean };
    jsPDF?: { unit?: string; format?: string | number[]; orientation?: 'portrait' | 'landscape' };
  }

  export interface Html2PdfWorker {
    from(element: HTMLElement | string): Html2PdfWorker;
    set(options: Html2PdfOptions): Html2PdfWorker;
    save(): Promise<void>;
    output(type: 'blob' | 'arraybuffer' | 'string'): Promise<any>;
    toPdf(): Html2PdfWorker;
    get(type: string): Promise<any>;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(element: HTMLElement, options?: Html2PdfOptions): Html2PdfWorker;

  export default html2pdf;
}
