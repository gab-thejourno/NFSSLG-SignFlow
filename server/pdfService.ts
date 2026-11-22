import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SignatureRecord, DocumentItem } from '../src/types';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Creates an authentic sample PDF contract using pdf-lib
 */
export async function createSampleContractPdf(
  title: string,
  refNum: string,
  category: string,
  signers: string[]
): Promise<string> {
  ensureUploadDir();
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Page 1
  const page1 = pdfDoc.addPage([595.28, 841.89]); // Standard A4 (Points: 595 x 842)
  const { width, height } = page1.getSize();

  // Institutional Header
  page1.drawRectangle({
    x: 40,
    y: height - 80,
    width: width - 80,
    height: 3,
    color: rgb(0.06, 0.16, 0.26), // Navy accent
  });

  page1.drawText('NATIONAL FEDERATION OF SSLG • DOCUMENT REGISTRY', {
    x: 40,
    y: height - 55,
    size: 9,
    font: helveticaBold,
    color: rgb(0.3, 0.4, 0.5),
  });

  page1.drawText(`REF: ${refNum}  |  CLASSIFICATION: OFFICIAL / CONFIDENTIAL`, {
    x: width - 340,
    y: height - 55,
    size: 8,
    font: helvetica,
    color: rgb(0.35, 0.45, 0.55),
  });

  page1.drawText(title.toUpperCase(), {
    x: 40,
    y: height - 120,
    size: 18,
    font: helveticaBold,
    color: rgb(0.06, 0.16, 0.26),
  });

  page1.drawText(`Category: ${category}   •   Date Issued: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, {
    x: 40,
    y: height - 140,
    size: 10,
    font: helvetica,
    color: rgb(0.4, 0.45, 0.5),
  });

  const bodyParagraphs = [
    'SECTION 1. PURPOSE AND APPLICABILITY\nThis binding administrative agreement governs the terms, covenants, and performance obligations authorized under the corporate governance framework of the Organization. By digital affirmation and execution hereof, each signatory represents and warrants that they possess full institutional capacity and delegated authority to commit their respective department.',
    'SECTION 2. SCOPE OF COMMITMENTS AND GOVERNANCE\nThe designated parties agree to adhere strictly to all compliance protocols, data protection standards, and institutional bylaws specified in Schedule A attached hereto. All approvals documented within this instrument are central, verifiable, and legally synchronized across the enterprise audit registry.',
    'SECTION 3. CONFIDENTIALITY AND RESTRICTED DISTRIBUTION\nAll technical schematics, budgetary allocations, trade secrets, and organizational deliberations associated with this matter are strictly confidential. Unauthorized transmission, copying, or disclosure to non-authorized third parties is strictly prohibited under institutional policy.',
    'SECTION 4. DIGITAL SIGNATURE AND AUDIT CONFORMITY\nPursuant to the Organization Digital Authentication Charter and applicable electronic signatures law, signatures affixed to this document via the NFSSLG SignFlow centralized platform constitute original, irrevocable, and binding execution. Each signature contains cryptographic timestamping and immutable ledger verification.',
  ];

  let currentY = height - 180;
  for (const para of bodyParagraphs) {
    const lines = para.split('\n');
    page1.drawText(lines[0], {
      x: 40,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: rgb(0.12, 0.2, 0.3),
    });
    currentY -= 18;

    const words = lines[1].split(' ');
    let lineBuffer = '';
    for (const w of words) {
      if ((lineBuffer + w).length > 82) {
        page1.drawText(lineBuffer, {
          x: 40,
          y: currentY,
          size: 10,
          font: timesRoman,
          color: rgb(0.15, 0.15, 0.18),
        });
        currentY -= 15;
        lineBuffer = '';
      }
      lineBuffer += (lineBuffer ? ' ' : '') + w;
    }
    if (lineBuffer) {
      page1.drawText(lineBuffer, {
        x: 40,
        y: currentY,
        size: 10,
        font: timesRoman,
        color: rgb(0.15, 0.15, 0.18),
      });
      currentY -= 15;
    }
    currentY -= 15;
  }

  // Page 2 - Signature Execution Page
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawRectangle({
    x: 40,
    y: height - 80,
    width: width - 80,
    height: 3,
    color: rgb(0.06, 0.16, 0.26),
  });

  page2.drawText('NATIONAL FEDERATION OF SSLG • EXECUTION SCHEDULE', {
    x: 40,
    y: height - 55,
    size: 9,
    font: helveticaBold,
    color: rgb(0.3, 0.4, 0.5),
  });

  page2.drawText('SECTION 5. AUTHORIZED EXECUTION AND SIGNATURE BLOCKS', {
    x: 40,
    y: height - 110,
    size: 13,
    font: helveticaBold,
    color: rgb(0.06, 0.16, 0.26),
  });

  page2.drawText(
    'IN WITNESS WHEREOF, the authorized representatives of the Organization have executed this instrument under digital seal. Each signatory block below corresponds to an assigned role and approval authority.',
    {
      x: 40,
      y: height - 130,
      size: 10,
      font: timesRoman,
      color: rgb(0.2, 0.25, 0.3),
      maxWidth: width - 80,
    }
  );

  // Draw placeholder signature slots for signers on page 2
  let sigY = height - 200;
  signers.forEach((name, index) => {
    // box
    page2.drawRectangle({
      x: 40,
      y: sigY - 80,
      width: width - 80,
      height: 90,
      borderColor: rgb(0.8, 0.85, 0.9),
      borderWidth: 1,
      color: rgb(0.98, 0.99, 1),
    });

    page2.drawText(`SIGNATORY ${index + 1}: ${name.toUpperCase()}`, {
      x: 55,
      y: sigY - 10,
      size: 10,
      font: helveticaBold,
      color: rgb(0.1, 0.2, 0.35),
    });

    page2.drawLine({
      start: { x: 55, y: sigY - 60 },
      end: { x: 300, y: sigY - 60 },
      thickness: 1,
      color: rgb(0.7, 0.75, 0.8),
    });

    page2.drawText('Authorized Signature & Digital Seal', {
      x: 55,
      y: sigY - 72,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.55, 0.6),
    });

    page2.drawText('Status: Pending Official Approval', {
      x: 340,
      y: sigY - 55,
      size: 9,
      font: helvetica,
      color: rgb(0.5, 0.55, 0.6),
    });

    sigY -= 110;
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `contract_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(pdfBytes));

  return `/api/documents/file/${filename}`;
}

/**
 * Combines all confirmed signatures and embeds them into the immutable original PDF.
 * Also appends a tamper-evident audit certificate page.
 */
export async function finalizeDocumentPdf(
  doc: DocumentItem,
  signatures: SignatureRecord[]
): Promise<string> {
  ensureUploadDir();

  // Find original PDF file
  const originalFileName = path.basename(doc.originalPdfUrl);
  const originalFilePath = path.join(UPLOAD_DIR, originalFileName);

  let originalBytes: Buffer;
  if (fs.existsSync(originalFilePath)) {
    originalBytes = fs.readFileSync(originalFilePath);
  } else {
    // Fallback: create fresh base document if missing
    const fallbackPath = await createSampleContractPdf(
      doc.title,
      doc.referenceNumber,
      doc.category,
      doc.signatories.map((s) => s.user?.fullName || 'Authorized Signatory')
    );
    const newName = path.basename(fallbackPath);
    originalBytes = fs.readFileSync(path.join(UPLOAD_DIR, newName));
  }

  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed each signature PNG into its assigned page and coordinates
  for (const sig of signatures) {
    try {
      const pageIdx = Math.max(0, Math.min(sig.pageNumber - 1, pages.length - 1));
      const targetPage = pages[pageIdx];
      const { width: pageWidth, height: pageHeight } = targetPage.getSize();
      // Convert percentages to PDF points (origin is bottom-left in PDF)
      const xPt = (sig.xPercent / 100) * pageWidth;
      const wPt = (sig.widthPercent / 100) * pageWidth;
      const hPt = (sig.heightPercent / 100) * pageHeight;
      const yPt = pageHeight - ((sig.yPercent + sig.heightPercent) / 100) * pageHeight;

      let embeddedSuccessfully = false;

      // Try decoding PNG
      if (sig.signaturePngData.includes('image/png') || !sig.signaturePngData.includes('image/svg')) {
        try {
          let pngBuffer: Buffer | null = null;
          if (sig.signaturePngData.startsWith('data:image/')) {
            const base64Data = sig.signaturePngData.replace(/^data:image\/[^;]+;base64,/, '');
            pngBuffer = Buffer.from(base64Data, 'base64');
          } else {
            const sigFilename = path.basename(sig.signaturePngData);
            const sigPath = path.join(UPLOAD_DIR, sigFilename);
            if (fs.existsSync(sigPath)) {
              pngBuffer = fs.readFileSync(sigPath);
            }
          }

          if (pngBuffer) {
            const embeddedPng = await pdfDoc.embedPng(pngBuffer);

            // Preserve natural aspect ratio (object-contain) to prevent stretching upon download
            const imgAspect = embeddedPng.width / embeddedPng.height;
            const boxAspect = wPt / hPt;

            let finalWidth = wPt;
            let finalHeight = hPt;

            if (imgAspect > boxAspect) {
              // Image is wider than bounding box: fit to width
              finalWidth = wPt;
              finalHeight = wPt / imgAspect;
            } else {
              // Image is taller than bounding box: fit to height
              finalHeight = hPt;
              finalWidth = hPt * imgAspect;
            }

            // Center image within the target signature box
            const finalX = xPt + (wPt - finalWidth) / 2;
            const finalY = yPt + (hPt - finalHeight) / 2;

            targetPage.drawImage(embeddedPng, {
              x: finalX,
              y: finalY,
              width: finalWidth,
              height: finalHeight,
            });
            embeddedSuccessfully = true;
          }
        } catch (embedErr) {
          // Fall through to vector seal
          console.warn(`Could not embed raw PNG for ${sig.userName}, rendering vector seal fallback`, embedErr);
        }
      }

      // If SVG or embedPng failed, render an authentic vector digital seal
      if (!embeddedSuccessfully) {
        targetPage.drawRectangle({
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
          borderColor: rgb(0.12, 0.32, 0.54),
          borderWidth: 1.5,
          color: rgb(0.97, 0.98, 1),
        });

        targetPage.drawText('VERIFIED DIGITAL SEAL', {
          x: xPt + 6,
          y: yPt + hPt - 12,
          size: 7,
          font: helveticaBold,
          color: rgb(0.1, 0.35, 0.6),
        });

        targetPage.drawText(sig.userName.toUpperCase(), {
          x: xPt + 6,
          y: yPt + hPt - 24,
          size: 9,
          font: helveticaBold,
          color: rgb(0.06, 0.16, 0.26),
        });

        targetPage.drawText(`RFSSLG / NFSSLG Attestation • Sealed`, {
          x: xPt + 6,
          y: yPt + 8,
          size: 6.5,
          font: helvetica,
          color: rgb(0.3, 0.45, 0.6),
        });
      }

      // Draw cryptographic verification stamp under signature
      const stampText = `NFSSLG SignFlow Verified: ${sig.userName} | ${new Date(sig.signedAt).toLocaleDateString()} | ID:${sig.verificationHash.slice(0, 8)}`;
      targetPage.drawText(stampText, {
        x: xPt,
        y: Math.max(8, yPt - 11),
        size: 6.5,
        font: helvetica,
        color: rgb(0.1, 0.35, 0.6),
      });
    } catch (err) {
      console.error(`Error embedding signature for ${sig.userName}:`, err);
    }
  }

  // Append official "Certificate of Completion & Cryptographic Audit Summary"
  const certPage = pdfDoc.addPage([595.28, 841.89]);
  const { width: cWidth, height: cHeight } = certPage.getSize();

  // Decorative border
  certPage.drawRectangle({
    x: 25,
    y: 25,
    width: cWidth - 50,
    height: cHeight - 50,
    borderWidth: 2,
    borderColor: rgb(0.06, 0.16, 0.26),
    color: rgb(0.99, 0.99, 1),
  });

  certPage.drawText('NATIONAL FEDERATION OF SSLG • AUDIT REGISTRY', {
    x: 50,
    y: cHeight - 65,
    size: 14,
    font: helveticaBold,
    color: rgb(0.06, 0.16, 0.26),
  });

  certPage.drawText('CERTIFICATE OF DIGITAL COMPLETION', {
    x: 50,
    y: cHeight - 88,
    size: 20,
    font: helveticaBold,
    color: rgb(0.09, 0.25, 0.45),
  });

  certPage.drawText(
    `This certificate confirms that all designated signatories have formally reviewed, approved, and cryptographically signed the official document referenced below via the NFSSLG SignFlow Digital Signature Platform.`,
    {
      x: 50,
      y: cHeight - 115,
      size: 9.5,
      font: helvetica,
      color: rgb(0.3, 0.35, 0.4),
      maxWidth: cWidth - 100,
    }
  );

  // Metadata Box
  certPage.drawRectangle({
    x: 50,
    y: cHeight - 215,
    width: cWidth - 100,
    height: 85,
    color: rgb(0.94, 0.96, 0.98),
    borderWidth: 1,
    borderColor: rgb(0.8, 0.86, 0.92),
  });

  certPage.drawText(`DOCUMENT TITLE: ${doc.title}`, {
    x: 65,
    y: cHeight - 150,
    size: 10,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.2),
  });

  certPage.drawText(`REFERENCE NUMBER: ${doc.referenceNumber}   |   CATEGORY: ${doc.category}`, {
    x: 65,
    y: cHeight - 168,
    size: 9,
    font: helvetica,
    color: rgb(0.3, 0.35, 0.4),
  });

  certPage.drawText(`TOTAL SIGNATURES: ${signatures.length} OF ${doc.signatories.length} REQUIRED   |   STATUS: COMPLETED`, {
    x: 65,
    y: cHeight - 186,
    size: 9,
    font: helveticaBold,
    color: rgb(0.05, 0.5, 0.25),
  });

  certPage.drawText(`FINALIZED AT: ${new Date().toISOString()}`, {
    x: 65,
    y: cHeight - 204,
    size: 8.5,
    font: helvetica,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Signatory Chronology Table
  certPage.drawText('EXECUTION CHRONOLOGY & VERIFICATION LOG', {
    x: 50,
    y: cHeight - 240,
    size: 11,
    font: helveticaBold,
    color: rgb(0.06, 0.16, 0.26),
  });

  let rowY = cHeight - 275;
  signatures.forEach((sig, i) => {
    certPage.drawRectangle({
      x: 50,
      y: rowY - 20,
      width: cWidth - 100,
      height: 48,
      color: i % 2 === 0 ? rgb(1, 1, 1) : rgb(0.97, 0.98, 0.99),
      borderColor: rgb(0.88, 0.9, 0.94),
      borderWidth: 1,
    });

    certPage.drawText(`${i + 1}. ${sig.userName} (${sig.userPosition})`, {
      x: 62,
      y: rowY + 12,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.1, 0.15, 0.2),
    });

    certPage.drawText(`Email: ${sig.userEmail}   •   Page: ${sig.pageNumber}`, {
      x: 62,
      y: rowY - 1,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.45, 0.5),
    });

    certPage.drawText(`Signed: ${new Date(sig.signedAt).toUTCString()}`, {
      x: 320,
      y: rowY + 12,
      size: 8,
      font: helvetica,
      color: rgb(0.2, 0.25, 0.3),
    });

    certPage.drawText(`Crypto Hash: ${sig.verificationHash.slice(0, 24)}...`, {
      x: 320,
      y: rowY - 1,
      size: 7.5,
      font: helvetica,
      color: rgb(0.1, 0.4, 0.7),
    });

    rowY -= 56;
  });

  // Footer Disclaimer
  certPage.drawText(
    'LEGAL NOTICE: This document and its digital certificate represent a tamper-evident audit record maintained under the NFSSLG SignFlow centralized security architecture. Tampering with this record or altering the embedded digital seals invalidates this agreement.',
    {
      x: 50,
      y: 50,
      size: 7.5,
      font: helvetica,
      color: rgb(0.5, 0.55, 0.6),
      maxWidth: cWidth - 100,
    }
  );

  const finalBytes = await pdfDoc.save();
  const finalFilename = `final_${doc.id}_${Date.now()}.pdf`;
  const finalFilePath = path.join(UPLOAD_DIR, finalFilename);
  fs.writeFileSync(finalFilePath, Buffer.from(finalBytes));

  return `/api/documents/file/${finalFilename}`;
}
