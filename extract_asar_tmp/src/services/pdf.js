import * as pdfjsLib from 'pdfjs-dist';

// Use CDN for worker to avoid build/bundler issues with Vite
// This version must match the installed version roughly, or be compatible.
// For simplicity in this environment, we set it to a stable compatible version.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const extractTextFromPDF = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = "";
        const maxPages = 50; // Safety limit
        const numPages = Math.min(pdf.numPages, maxPages);

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `\n--- Page ${i} ---\n${pageText}\n`;
        }

        if (pdf.numPages > maxPages) {
            fullText += `\n\n[Warning: Only first ${maxPages} pages extracted.]`;
        }

        return fullText;
    } catch (error) {
        console.error("PDF Extraction Error:", error);
        throw new Error("Failed to extract text from PDF. " + error.message);
    }
};
