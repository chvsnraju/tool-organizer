import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer } from 'lucide-react';

interface PrintableQRCodeProps {
  url: string;
  title: string;
  subtitle?: string;
}

export const PrintableQRCode: React.FC<PrintableQRCodeProps> = ({ url, title, subtitle }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !svgRef.current) return;

    // Use outerHTML but inject namespace to ensure it renders correctly in the raw HTML window
    let svgHtml = svgRef.current.outerHTML;
    if (!svgHtml.includes('xmlns=')) {
      svgHtml = svgHtml.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Label - ${title}</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: flex-start;
              padding-top: 50px;
              color: #000;
            }
            .label-wrapper {
              border: 1px solid #000;
              padding: 24px 32px;
              text-align: center;
              border-radius: 12px;
              max-width: 320px;
            }
            h1 { font-size: 20px; margin: 0 0 6px 0; color: #000; }
            p { font-size: 13px; color: #444; margin: 0 0 20px 0; }
            .qr-code svg { 
              width: 160px; 
              height: 160px; 
              display: inline-block; 
            }
            @media print {
              body { padding-top: 0; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <div class="label-wrapper">
            <h1>${title}</h1>
            ${subtitle ? `<p>${subtitle}</p>` : ''}
            <div class="qr-code">${svgHtml}</div>
          </div>
          <script>
            // Allow images/styles to settle before printing
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col items-center bg-card border border-border/50 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
      
      <div className="bg-white p-3 rounded-xl shadow-sm border border-black/5 ring-1 ring-black/5 mb-4 relative z-10 transition-transform group-hover:scale-105">
        {/* We use QRCodeSVG because SVG scales perfectly for print */}
        <QRCodeSVG 
          value={url} 
          size={140} 
          level="H" 
          includeMargin={false} 
          ref={svgRef}
        />
      </div>
      
      <h3 className="font-semibold text-center mb-1 relative z-10 text-foreground">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground text-center mb-5 relative z-10">{subtitle}</p>}
      
      <button
        onClick={handlePrint}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm font-medium relative z-10"
      >
        <Printer className="w-4 h-4" />
        Print QR Label
      </button>
    </div>
  );
};
