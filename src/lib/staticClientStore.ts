import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type {
  User,
  DocumentItem,
  DocumentEvent,
  AppNotification,
  OrganizationSettings,
  SignatureField,
  SignatureRecord,
  DocumentSignatory,
} from '../types';

const DB_STORAGE_KEY = 'nfsslg_signflow_static_db_v1';
const PDF_IDB_NAME = 'nfsslg_signflow_pdfs_v1';
const PDF_STORE_NAME = 'pdfs';
const TOKEN_KEY = 'signflow_auth_token';

interface StoredUser extends User {
  password: string;
}

interface StaticDbSchema {
  users: StoredUser[];
  documents: DocumentItem[];
  events: DocumentEvent[];
  notifications: AppNotification[];
  settings: OrganizationSettings;
}

export const REGIONAL_ACCOUNTS_DEF = [
  { code: 'region1', username: 'nfsslg-r1', label: 'Region 1', name: 'RFSSLG President - Region 1', region: 'Ilocos Region' },
  { code: 'region2', username: 'nfsslg-r2', label: 'Region 2', name: 'RFSSLG President - Region 2', region: 'Cagayan Valley' },
  { code: 'region3', username: 'nfsslg-r3', label: 'Region 3', name: 'RFSSLG President - Region 3', region: 'Central Luzon' },
  { code: 'region4a', username: 'nfsslg-r4a', label: 'Region 4A', name: 'RFSSLG President - Region 4A', region: 'CALABARZON' },
  { code: 'region4b', username: 'nfsslg-r4b', label: 'Region 4B', name: 'RFSSLG President - Region 4B', region: 'MIMAROPA' },
  { code: 'region5', username: 'nfsslg-r5', label: 'Region 5', name: 'RFSSLG President - Region 5', region: 'Bicol Region' },
  { code: 'region6', username: 'nfsslg-r6', label: 'Region 6', name: 'RFSSLG President - Region 6', region: 'Western Visayas' },
  { code: 'region7', username: 'nfsslg-r7', label: 'Region 7', name: 'RFSSLG President - Region 7', region: 'Central Visayas' },
  { code: 'region8', username: 'nfsslg-r8', label: 'Region 8', name: 'RFSSLG President - Region 8', region: 'Eastern Visayas' },
  { code: 'region9', username: 'nfsslg-r9', label: 'Region 9', name: 'RFSSLG President - Region 9', region: 'Zamboanga Peninsula' },
  { code: 'region10', username: 'nfsslg-r10', label: 'Region 10', name: 'RFSSLG President - Region 10', region: 'Northern Mindanao' },
  { code: 'region11', username: 'nfsslg-r11', label: 'Region 11', name: 'RFSSLG President - Region 11', region: 'Davao Region' },
  { code: 'region12', username: 'nfsslg-r12', label: 'Region 12', name: 'RFSSLG President - Region 12', region: 'SOCCSKSARGEN' },
  { code: 'region13', username: 'nfsslg-r13', label: 'Region 13', name: 'RFSSLG President - Region 13', region: 'Caraga Administrative Region' },
  { code: 'ncr', username: 'nfsslg-ncr', label: 'NCR', name: 'RFSSLG President - NCR', region: 'National Capital Region' },
  { code: 'car', username: 'nfsslg-car', label: 'CAR', name: 'RFSSLG President - CAR', region: 'Cordillera Administrative Region' },
  { code: 'nir', username: 'nfsslg-nir', label: 'NIR', name: 'RFSSLG President - NIR', region: 'Negros Island Region' },
  { code: 'barmm', username: 'nfsslg-barmm', label: 'BARMM', name: 'RFSSLG President - BARMM', region: 'Bangsamoro Autonomous Region' },
];

// ==================== REALTIME EVENT BUS (LOCAL + MULTI-TAB) ====================
type RealtimeListener = (event: any) => void;
const localListeners = new Set<RealtimeListener>();
let broadcastChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== 'undefined') {
  try {
    broadcastChannel = new BroadcastChannel('nfsslg_signflow_realtime');
    broadcastChannel.onmessage = (ev) => {
      localListeners.forEach((fn) => {
        try {
          fn(ev.data);
        } catch {}
      });
    };
  } catch {
    broadcastChannel = null;
  }
}

function emitLocalRealtime(event: any) {
  localListeners.forEach((fn) => {
    try {
      fn(event);
    } catch {}
  });
  try {
    broadcastChannel?.postMessage(event);
  } catch {}
}

export function subscribeStaticRealtime(onEvent: RealtimeListener): () => void {
  localListeners.add(onEvent);
  return () => {
    localListeners.delete(onEvent);
  };
}

// ==================== INDEXEDDB PDF BLOB STORE ====================
const blobUrlCache = new Map<string, string>();
const memoryPdfFallback = new Map<string, Uint8Array>();

function openPdfIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(PDF_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(PDF_STORE_NAME)) {
        idb.createObjectStore(PDF_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

async function savePdfBytes(idbKey: string, bytes: Uint8Array): Promise<string> {
  memoryPdfFallback.set(idbKey, bytes);
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'application/pdf',
  });
  const objectUrl = URL.createObjectURL(blob);
  blobUrlCache.set(idbKey, objectUrl);

  try {
    const idb = await openPdfIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(PDF_STORE_NAME, 'readwrite');
      tx.objectStore(PDF_STORE_NAME).put(bytes, idbKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback to memory map
  }
  return idbKey;
}

async function loadPdfBytes(keyOrUrl: string): Promise<Uint8Array | null> {
  if (memoryPdfFallback.has(keyOrUrl)) {
    return memoryPdfFallback.get(keyOrUrl)!;
  }
  if (keyOrUrl.startsWith('idb://')) {
    try {
      const idb = await openPdfIdb();
      const bytes = await new Promise<Uint8Array | undefined>((resolve, reject) => {
        const tx = idb.transaction(PDF_STORE_NAME, 'readonly');
        const req = tx.objectStore(PDF_STORE_NAME).get(keyOrUrl);
        req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
        req.onerror = () => reject(req.error);
      });
      if (bytes) {
        const uint = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        memoryPdfFallback.set(keyOrUrl, uint);
        return uint;
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function resolvePdfUrlForClient(keyOrUrl?: string): Promise<string | undefined> {
  if (!keyOrUrl) return undefined;
  if (!keyOrUrl.startsWith('idb://')) return keyOrUrl;

  if (blobUrlCache.has(keyOrUrl)) {
    return blobUrlCache.get(keyOrUrl)!;
  }

  const bytes = await loadPdfBytes(keyOrUrl);
  if (bytes) {
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
      type: 'application/pdf',
    });
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache.set(keyOrUrl, objectUrl);
    return objectUrl;
  }
  return undefined;
}

async function hydrateDocumentUrls(doc: DocumentItem): Promise<DocumentItem> {
  const originalResolved = (await resolvePdfUrlForClient(doc.originalPdfUrl)) || doc.originalPdfUrl;
  const finalResolved = doc.finalPdfUrl
    ? (await resolvePdfUrlForClient(doc.finalPdfUrl)) || doc.finalPdfUrl
    : undefined;

  // If missing from IndexedDB after clear, regenerate cleanly
  let safeOriginal = originalResolved;
  if (safeOriginal.startsWith('idb://')) {
    const regenerated = await createBrowserSamplePdf(
      doc.title,
      doc.referenceNumber,
      doc.category,
      doc.signatories.map((s) => s.user?.fullName || 'Authorized Signatory')
    );
    safeOriginal = (await resolvePdfUrlForClient(regenerated)) || regenerated;
  }

  return {
    ...doc,
    originalPdfUrl: safeOriginal,
    finalPdfUrl: finalResolved,
  };
}

// ==================== CLIENT PDF GENERATION & SIGNING ====================
function sanitizeWinAnsi(text: string): string {
  // pdf-lib StandardFonts (Helvetica/Times) only encode WinAnsi characters
  return (text || '')
    .replace(/•/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

async function createBrowserSamplePdf(
  title: string,
  refNum: string,
  category: string,
  signers: string[] = []
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  const page1 = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page1.getSize();

  page1.drawRectangle({
    x: 40,
    y: height - 80,
    width: width - 80,
    height: 3,
    color: rgb(0.06, 0.16, 0.26),
  });

  page1.drawText('NATIONAL FEDERATION OF SSLG - DOCUMENT REGISTRY', {
    x: 40,
    y: height - 55,
    size: 9,
    font: helveticaBold,
    color: rgb(0.3, 0.4, 0.5),
  });

  page1.drawText(sanitizeWinAnsi(`REF: ${refNum}  |  CLASSIFICATION: OFFICIAL / CONFIDENTIAL`), {
    x: width - 340,
    y: height - 55,
    size: 8,
    font: helvetica,
    color: rgb(0.35, 0.45, 0.55),
  });

  page1.drawText(sanitizeWinAnsi(title.toUpperCase()).slice(0, 62), {
    x: 40,
    y: height - 120,
    size: 16,
    font: helveticaBold,
    color: rgb(0.06, 0.16, 0.26),
  });

  page1.drawText(
    sanitizeWinAnsi(
      `Category: ${category}  |  Date Issued: ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`
    ),
    {
      x: 40,
      y: height - 140,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.45, 0.5),
    }
  );

  const bodyParagraphs = [
    'SECTION 1. PURPOSE AND APPLICABILITY\nThis binding administrative agreement governs the terms, covenants, and performance obligations authorized under the corporate governance framework of the National Federation of SSLG. By digital affirmation and execution hereof, each signatory represents and warrants that they possess full institutional capacity and delegated authority.',
    'SECTION 2. SCOPE OF COMMITMENTS AND GOVERNANCE\nThe designated parties agree to adhere strictly to all compliance protocols, data protection standards, and institutional bylaws specified in Schedule A attached hereto. All approvals documented within this instrument are central, verifiable, and synchronized across the federation registry.',
    'SECTION 3. CONFIDENTIALITY AND RESTRICTED DISTRIBUTION\nAll operational directives, budgetary allocations, and organizational deliberations associated with this matter are strictly official. Unauthorized transmission, copying, or disclosure to non-authorized third parties is strictly prohibited under institutional policy.',
    'SECTION 4. DIGITAL SIGNATURE AND AUDIT CONFORMITY\nPursuant to the Organization Digital Authentication Charter and applicable electronic signatures law, signatures affixed via the NFSSLG SignFlow platform constitute original, irrevocable, and binding execution.',
  ];

  let currentY = height - 180;
  for (const para of bodyParagraphs) {
    const lines = para.split('\n');
    page1.drawText(sanitizeWinAnsi(lines[0]), {
      x: 40,
      y: currentY,
      size: 11,
      font: helveticaBold,
      color: rgb(0.09, 0.22, 0.35),
    });
    currentY -= 18;

    const words = lines[1].split(' ');
    let lineBuffer = '';
    for (const w of words) {
      if ((lineBuffer + ' ' + w).length > 88) {
        page1.drawText(sanitizeWinAnsi(lineBuffer), {
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
      page1.drawText(sanitizeWinAnsi(lineBuffer), {
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

  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawRectangle({
    x: 40,
    y: height - 80,
    width: width - 80,
    height: 3,
    color: rgb(0.06, 0.16, 0.26),
  });

  page2.drawText('NATIONAL FEDERATION OF SSLG - EXECUTION SCHEDULE', {
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

  const signerList = signers.length ? signers : ['Authorized Representative', 'NFSSLG Officer'];
  let boxY = height - 220;
  signerList.slice(0, 4).forEach((sName, idx) => {
    page2.drawRectangle({
      x: 60,
      y: boxY - 60,
      width: 240,
      height: 75,
      borderColor: rgb(0.8, 0.84, 0.88),
      borderWidth: 1,
      color: rgb(0.98, 0.99, 1),
    });

    page2.drawText(sanitizeWinAnsi(`AUTHORIZED SIGNATORY #${idx + 1}: ${sName}`), {
      x: 70,
      y: boxY - 52,
      size: 8,
      font: helveticaBold,
      color: rgb(0.3, 0.35, 0.4),
    });

    page2.drawLine({
      start: { x: 70, y: boxY - 38 },
      end: { x: 280, y: boxY - 38 },
      thickness: 0.5,
      color: rgb(0.6, 0.65, 0.7),
    });

    boxY -= 110;
  });

  page2.drawText('Document integrity protected by NFSSLG SignFlow Cryptographic Engine', {
    x: 40,
    y: 40,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.55, 0.6),
  });

  const pdfBytes = await pdfDoc.save();
  const idbKey = `idb://sample_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`;
  return savePdfBytes(idbKey, pdfBytes);
}

async function finalizeBrowserPdf(doc: DocumentItem, signatures: SignatureRecord[]): Promise<string> {
  let originalBytes = await loadPdfBytes(doc.originalPdfUrl);
  if (!originalBytes && doc.originalPdfUrl.startsWith('blob:')) {
    try {
      const resp = await fetch(doc.originalPdfUrl);
      originalBytes = new Uint8Array(await resp.arrayBuffer());
    } catch {}
  }

  if (!originalBytes) {
    const fallbackKey = await createBrowserSamplePdf(
      doc.title,
      doc.referenceNumber,
      doc.category,
      doc.signatories.map((s) => s.user?.fullName || 'Authorized Signatory')
    );
    originalBytes = await loadPdfBytes(fallbackKey);
  }

  const pdfDoc = await PDFDocument.load(originalBytes!);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const sig of signatures) {
    try {
      const pageIdx = Math.max(0, Math.min(sig.pageNumber - 1, pages.length - 1));
      const targetPage = pages[pageIdx];
      const { width: pageWidth, height: pageHeight } = targetPage.getSize();
      const xPt = (sig.xPercent / 100) * pageWidth;
      const wPt = (sig.widthPercent / 100) * pageWidth;
      const hPt = (sig.heightPercent / 100) * pageHeight;
      const yPt = pageHeight - ((sig.yPercent + sig.heightPercent) / 100) * pageHeight;

      let embeddedSuccessfully = false;
      if (sig.signaturePngData && (sig.signaturePngData.includes('image/png') || !sig.signaturePngData.includes('image/svg'))) {
        try {
          const base64Data = sig.signaturePngData.replace(/^data:image\/[^;]+;base64,/, '');
          const binaryString = atob(base64Data);
          const pngBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            pngBytes[i] = binaryString.charCodeAt(i);
          }

          const embeddedPng = await pdfDoc.embedPng(pngBytes);
          const imgAspect = embeddedPng.width / embeddedPng.height;
          const boxAspect = wPt / hPt;

          let finalWidth = wPt;
          let finalHeight = hPt;
          if (imgAspect > boxAspect) {
            finalWidth = wPt;
            finalHeight = wPt / imgAspect;
          } else {
            finalHeight = hPt;
            finalWidth = hPt * imgAspect;
          }

          const finalX = xPt + (wPt - finalWidth) / 2;
          const finalY = yPt + (hPt - finalHeight) / 2;

          targetPage.drawImage(embeddedPng, {
            x: finalX,
            y: finalY,
            width: finalWidth,
            height: finalHeight,
          });
          embeddedSuccessfully = true;
        } catch {}
      }

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
        targetPage.drawText(sanitizeWinAnsi(sig.userName.toUpperCase()).slice(0, 32), {
          x: xPt + 6,
          y: yPt + hPt - 24,
          size: 8.5,
          font: helveticaBold,
          color: rgb(0.06, 0.16, 0.26),
        });
      }

      const stampText = sanitizeWinAnsi(
        `NFSSLG SignFlow Verified: ${sig.userName} | ${new Date(sig.signedAt).toLocaleDateString()} | ID:${sig.verificationHash.slice(0, 8)}`
      );
      targetPage.drawText(stampText, {
        x: xPt,
        y: Math.max(8, yPt - 11),
        size: 6.5,
        font: helvetica,
        color: rgb(0.1, 0.35, 0.6),
      });
    } catch {}
  }

  // Append Certificate of Digital Completion
  const certPage = pdfDoc.addPage([595.28, 841.89]);
  const { width: cWidth, height: cHeight } = certPage.getSize();
  certPage.drawRectangle({
    x: 25,
    y: 25,
    width: cWidth - 50,
    height: cHeight - 50,
    borderWidth: 2,
    borderColor: rgb(0.06, 0.16, 0.26),
    color: rgb(0.99, 0.99, 1),
  });
  certPage.drawText('NATIONAL FEDERATION OF SSLG - AUDIT REGISTRY', {
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
    'This certificate confirms that all designated signatories have formally reviewed, approved, and cryptographically signed the official document referenced below via the NFSSLG SignFlow Digital Signature Platform.',
    {
      x: 50,
      y: cHeight - 115,
      size: 9.5,
      font: helvetica,
      color: rgb(0.3, 0.35, 0.4),
      maxWidth: cWidth - 100,
    }
  );
  certPage.drawRectangle({
    x: 50,
    y: cHeight - 230,
    width: cWidth - 100,
    height: 95,
    color: rgb(0.95, 0.97, 0.99),
    borderWidth: 1,
    borderColor: rgb(0.82, 0.87, 0.92),
  });
  certPage.drawText(sanitizeWinAnsi(`Document Title: ${doc.title}`).slice(0, 75), {
    x: 65,
    y: cHeight - 158,
    size: 10,
    font: helveticaBold,
    color: rgb(0.1, 0.15, 0.2),
  });
  certPage.drawText(sanitizeWinAnsi(`Reference Number: ${doc.referenceNumber}  |  Category: ${doc.category}`), {
    x: 65,
    y: cHeight - 178,
    size: 9,
    font: helvetica,
    color: rgb(0.3, 0.35, 0.4),
  });
  certPage.drawText(sanitizeWinAnsi(`Initiator: ${doc.initiator?.fullName || 'Central Office Admin'}`), {
    x: 65,
    y: cHeight - 196,
    size: 9,
    font: helvetica,
    color: rgb(0.3, 0.35, 0.4),
  });
  certPage.drawText(`Completed On: ${new Date().toUTCString()}`, {
    x: 65,
    y: cHeight - 214,
    size: 9,
    font: helveticaBold,
    color: rgb(0.05, 0.45, 0.25),
  });

  let rowY = cHeight - 285;
  signatures.forEach((sig, i) => {
    if (rowY < 90) return;
    certPage.drawRectangle({
      x: 50,
      y: rowY - 12,
      width: cWidth - 100,
      height: 46,
      borderWidth: 0.75,
      borderColor: rgb(0.85, 0.88, 0.92),
      color: rgb(1, 1, 1),
    });
    certPage.drawText(sanitizeWinAnsi(`${i + 1}. ${sig.userName} (${sig.userPosition})`), {
      x: 62,
      y: rowY + 14,
      size: 9.5,
      font: helveticaBold,
      color: rgb(0.08, 0.14, 0.22),
    });
    certPage.drawText(`Signed At: ${new Date(sig.signedAt).toUTCString()}`, {
      x: 62,
      y: rowY - 1,
      size: 7.5,
      font: helvetica,
      color: rgb(0.4, 0.45, 0.5),
    });
    certPage.drawText(`Crypto Hash: ${sig.verificationHash.slice(0, 24)}...`, {
      x: 320,
      y: rowY - 1,
      size: 7.5,
      font: helvetica,
      color: rgb(0.1, 0.4, 0.7),
    });
    rowY -= 54;
  });

  const finalBytes = await pdfDoc.save();
  const idbKey = `idb://final_${doc.id}_${Date.now()}.pdf`;
  return savePdfBytes(idbKey, finalBytes);
}

// ==================== INITIAL SEEDING & STORAGE ====================
function generateDemoSignatureSvg(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
    <path d="M 20 58 Q 50 18 80 50 T 130 42 Q 160 22 190 62 T 250 38 Q 270 68 280 52" fill="none" stroke="#0f2942" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="25" y="84" font-family="'Brush Script MT', 'Great Vibes', cursive, sans-serif" font-size="24" font-style="italic" fill="#14365d">${name}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function buildInitialStaticDb(): StaticDbSchema {
  const now = new Date().toISOString();

  const centralOfficeUser: StoredUser = {
    id: 'usr-centraloffice',
    email: 'centraloffice@signflow.gov.ph',
    password: 'adminpassword',
    fullName: 'Central Office - Youth Formation Division (YFD)',
    username: 'nfsslg-yfd',
    department: 'National Federation of SSLG Central Office (YFD)',
    position: 'Central Office Administrator',
    role: 'admin',
    status: 'active',
    signaturePngUrl: generateDemoSignatureSvg('Central Office YFD'),
    createdAt: now,
    updatedAt: now,
  };

  const regionalUsers: StoredUser[] = REGIONAL_ACCOUNTS_DEF.map((reg) => ({
    id: `usr-${reg.code}`,
    email: `${reg.code}@signflow.gov.ph`,
    password: 'adminpassword',
    fullName: `${reg.name} (${reg.region})`,
    username: reg.username,
    department: `Regional Federation of SSLG - ${reg.label} (${reg.region})`,
    position: 'RFSSLG President',
    role: 'user',
    status: 'active',
    signaturePngUrl: generateDemoSignatureSvg(reg.name),
    createdAt: now,
    updatedAt: now,
  }));

  const users = [centralOfficeUser, ...regionalUsers];
  const r1 = regionalUsers.find((u) => u.id === 'usr-region1')!;
  const r4a = regionalUsers.find((u) => u.id === 'usr-region4a')!;
  const ncr = regionalUsers.find((u) => u.id === 'usr-ncr')!;
  const nir = regionalUsers.find((u) => u.id === 'usr-nir')!;

  const sanitize = (u: StoredUser): User => {
    const { password: _, ...safe } = u;
    return safe;
  };

  const doc1Id = 'doc-nfsslg-static-01';
  const doc1: DocumentItem = {
    id: doc1Id,
    title: 'National Federation of SSLG Inter-Regional Governance Resolution',
    description: 'Joint resolution aligning all Regional Federations of SSLG for SY 2026-2027 student leadership protocols.',
    category: 'Resolution',
    referenceNumber: 'NFSSLG-2026-RES-001',
    deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
    instructions: 'Please place your signature on Page 2 execution schedule.',
    status: 'pending_signatures',
    signingOrderType: 'parallel',
    initiatorId: centralOfficeUser.id,
    initiator: sanitize(centralOfficeUser),
    signatories: [
      { id: 'signtry-st-r1', documentId: doc1Id, userId: r1.id, user: sanitize(r1), signingOrder: 1, status: 'pending' },
      { id: 'signtry-st-ncr', documentId: doc1Id, userId: ncr.id, user: sanitize(ncr), signingOrder: 1, status: 'pending' },
      { id: 'signtry-st-r4a', documentId: doc1Id, userId: r4a.id, user: sanitize(r4a), signingOrder: 1, status: 'pending' },
      { id: 'signtry-st-nir', documentId: doc1Id, userId: nir.id, user: sanitize(nir), signingOrder: 1, status: 'pending' },
    ],
    fields: [],
    signatures: [],
    originalPdfUrl: 'idb://seed-doc-01',
    currentVersion: 1,
    pageCount: 2,
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
  };

  return {
    users,
    documents: [doc1],
    events: [
      {
        id: 'evt-st-001',
        documentId: doc1Id,
        documentTitle: doc1.title,
        userId: centralOfficeUser.id,
        userName: centralOfficeUser.fullName,
        userEmail: centralOfficeUser.email,
        action: 'DOCUMENT_UPLOADED',
        details: 'Dispatched NFSSLG resolution NFSSLG-2026-RES-001.',
        timestamp: new Date(Date.now() - 3600000 * 6).toISOString(),
        ipAddress: 'Client Browser',
      },
    ],
    notifications: [
      {
        id: 'notif-st-001',
        userId: r1.id,
        title: 'Document Signature Required',
        message: 'Central Office YFD dispatched "National Federation of SSLG Inter-Regional Governance Resolution".',
        link: `/documents/${doc1Id}/sign`,
        read: false,
        createdAt: now,
      },
    ],
    settings: {
      organizationName: 'National Federation of SSLG',
      organizationEmail: 'nfsslg@signflow.gov.ph',
      defaultDeadlineDays: 7,
      sequentialDefault: false,
      requireAdminApproval: false,
      allowSignatureDrawing: true,
      enforceTransparentPng: true,
    },
  };
}

function loadStaticDb(): StaticDbSchema {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StaticDbSchema;
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        return parsed;
      }
    }
  } catch {}
  const initial = buildInitialStaticDb();
  saveStaticDb(initial);
  return initial;
}

function saveStaticDb(data: StaticDbSchema) {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Could not persist static DB to localStorage:', err);
  }
}

function sanitizeUser(u: StoredUser): User {
  const { password: _, ...safe } = u;
  return safe;
}

function matchUserByIdentifier(users: StoredUser[], identifier: string): StoredUser | undefined {
  if (!identifier) return undefined;
  const raw = identifier.trim().toLowerCase();
  const clean = raw.replace(/[\s_\-\.]+/g, '');

  return users.find((u) => {
    const uEmail = u.email.toLowerCase();
    const uUsername = u.username.toLowerCase();
    const uCleanUsername = uUsername.replace(/[\s_\-\.]+/g, '');
    const uCleanName = u.fullName.toLowerCase().replace(/[\s_\-\.]+/g, '');

    if (
      clean === 'nfsslgyfd' ||
      clean === 'yfd' ||
      clean === 'centraloffice' ||
      clean === 'central' ||
      clean === 'co' ||
      clean === 'secretariat' ||
      clean === 'admin'
    ) {
      return uUsername === 'nfsslg-yfd';
    }

    if (clean === 'nfsslgncr' || clean === 'ncr') return uUsername === 'nfsslg-ncr';
    if (clean === 'nfsslgcar' || clean === 'car') return uUsername === 'nfsslg-car';
    if (clean === 'nfsslgnir' || clean === 'nir') return uUsername === 'nfsslg-nir';
    if (clean === 'nfsslgbarmm' || clean === 'barmm') return uUsername === 'nfsslg-barmm';
    if (clean === 'nfsslgr4a' || clean === 'r4a' || clean === 'region4a' || clean === 'calabarzon') return uUsername === 'nfsslg-r4a';
    if (clean === 'nfsslgr4b' || clean === 'r4b' || clean === 'region4b' || clean === 'mimaropa') return uUsername === 'nfsslg-r4b';

    const rMatch = clean.match(/^(?:nfsslg)?(?:r|region)(\d{1,2})$/);
    if (rMatch) {
      const num = rMatch[1];
      if (uUsername === `nfsslg-r${num}`) return true;
    }

    return (
      uEmail === raw ||
      uUsername === raw ||
      uCleanUsername === clean ||
      uCleanName.includes(clean) ||
      uEmail.split('@')[0] === raw
    );
  });
}

function getCurrentStaticUser(db: StaticDbSchema): StoredUser | undefined {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return undefined;
  return db.users.find((u) => u.id === token) || matchUserByIdentifier(db.users, token);
}

async function computeSha256Hex(input: string): Promise<string> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {}
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(64, 'a');
}

// ==================== PUBLIC STATIC CLIENT API ====================
export const staticApi = {
  async login(identifier: string, password: string): Promise<{ user: User; token: string }> {
    const db = loadStaticDb();
    const user = matchUserByIdentifier(db.users, identifier);
    if (!user) {
      throw new Error('Invalid username or region identifier. (e.g. nfsslg-yfd, nfsslg-ncr, nfsslg-r11)');
    }
    if (user.password !== password) {
      throw new Error('Invalid password. (Default password is adminpassword)');
    }
    if (user.status === 'pending') {
      throw new Error('Your account is currently pending administrator approval.');
    }
    if (user.status === 'disabled') {
      throw new Error('Your account has been deactivated.');
    }
    localStorage.setItem(TOKEN_KEY, user.id);
    return { user: sanitizeUser(user), token: user.id };
  },

  async register(_userData: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    position: string;
    username?: string;
  }): Promise<never> {
    throw new Error('Public account creation is disabled. Only pre-authorized NFSSLG accounts can sign in.');
  },

  async getMe(): Promise<{ user: User }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (!user) throw new Error('Not authenticated');
    return { user: sanitizeUser(user) };
  },

  async updateProfile(updates: Partial<User>): Promise<{ user: User }> {
    const db = loadStaticDb();
    const idx = db.users.findIndex((u) => u.id === getCurrentStaticUser(db)?.id);
    if (idx === -1) throw new Error('Unauthorized');
    db.users[idx] = {
      ...db.users[idx],
      ...updates,
      role: db.users[idx].role,
      status: db.users[idx].status,
      updatedAt: new Date().toISOString(),
    };
    saveStaticDb(db);
    return { user: sanitizeUser(db.users[idx]) };
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const db = loadStaticDb();
    const idx = db.users.findIndex((u) => u.id === getCurrentStaticUser(db)?.id);
    if (idx === -1) throw new Error('Unauthorized');
    if (db.users[idx].password !== currentPassword) {
      throw new Error('Current password is incorrect.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }
    db.users[idx].password = newPassword;
    db.users[idx].updatedAt = new Date().toISOString();
    saveStaticDb(db);
    return { success: true, message: 'Password updated successfully!' };
  },

  async switchUser(userId: string): Promise<{ user: User; token: string }> {
    const db = loadStaticDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error('User not found');
    localStorage.setItem(TOKEN_KEY, user.id);
    return { user: sanitizeUser(user), token: user.id };
  },

  async getUsers(): Promise<{ users: User[] }> {
    const db = loadStaticDb();
    return { users: db.users.map(sanitizeUser) };
  },

  async updateUser(id: string, updates: Partial<User>): Promise<{ user: User }> {
    const db = loadStaticDb();
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    db.users[idx] = { ...db.users[idx], ...updates, updatedAt: new Date().toISOString() };
    saveStaticDb(db);
    return { user: sanitizeUser(db.users[idx]) };
  },

  async getDocuments(params?: {
    scope?: string;
    filterStatus?: string;
    search?: string;
  }): Promise<{ documents: DocumentItem[] }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (!user) throw new Error('Unauthorized');

    let docs = [...db.documents];
    const scope = params?.scope;

    if (scope === 'assigned') {
      docs = docs.filter((d) => d.signatories.some((s) => s.userId === user.id));
    } else if (scope === 'mine') {
      docs = docs.filter((d) => d.initiatorId === user.id);
    } else if (scope === 'completed') {
      docs = docs.filter((d) => d.status === 'completed');
    } else if (scope === 'drafts') {
      docs = docs.filter((d) => d.status === 'draft');
    } else if (scope === 'archived') {
      docs = docs.filter((d) => d.status === 'archived');
    } else if (user.role !== 'admin') {
      docs = docs.filter((d) => d.initiatorId === user.id || d.signatories.some((s) => s.userId === user.id));
    }

    if (params?.filterStatus && params.filterStatus !== 'all') {
      const fs = params.filterStatus;
      if (fs === 'pending') {
        docs = docs.filter((d) => {
          const sig = d.signatories.find((s) => s.userId === user.id);
          return sig ? sig.status === 'pending' : d.status === 'pending_signatures' || d.status === 'in_progress';
        });
      } else if (fs === 'signed') {
        docs = docs.filter((d) => d.signatories.find((s) => s.userId === user.id)?.status === 'signed');
      } else if (fs === 'overdue') {
        const now = new Date();
        docs = docs.filter((d) => d.deadline && new Date(d.deadline) < now && d.status !== 'completed');
      } else if (fs === 'completed') {
        docs = docs.filter((d) => d.status === 'completed');
      }
    }

    if (params?.search) {
      const q = params.search.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.referenceNumber.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q)
      );
    }

    const hydrated = await Promise.all(docs.map(hydrateDocumentUrls));
    return { documents: hydrated };
  },

  async getDocument(id: string): Promise<{ document: DocumentItem }> {
    const db = loadStaticDb();
    const doc = db.documents.find((d) => d.id === id);
    if (!doc) throw new Error('Document not found');
    return { document: await hydrateDocumentUrls(doc) };
  },

  async uploadPdf(
    file?: File,
    templateData?: { templateTitle: string; templateRef: string; category: string; signers?: string[] }
  ): Promise<{ fileUrl: string; filename: string; size?: number; pageCount: number }> {
    if (file) {
      const buf = new Uint8Array(await file.arrayBuffer());
      const idbKey = `idb://upload_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`;
      await savePdfBytes(idbKey, buf);
      let pageCount = 2;
      try {
        const loaded = await PDFDocument.load(buf);
        pageCount = loaded.getPageCount();
      } catch {}
      return { fileUrl: idbKey, filename: file.name, size: file.size, pageCount };
    }

    const idbKey = await createBrowserSamplePdf(
      templateData?.templateTitle || 'Official Document',
      templateData?.templateRef || `NFSSLG-${Date.now().toString().slice(-4)}`,
      templateData?.category || 'Resolution',
      templateData?.signers || ['Authorized Signatory']
    );
    return {
      fileUrl: idbKey,
      filename: `${templateData?.templateTitle || 'Document'}.pdf`,
      pageCount: 2,
    };
  },

  async createDocument(data: {
    title: string;
    description?: string;
    category: string;
    referenceNumber?: string;
    deadline?: string;
    instructions?: string;
    signingOrderType: 'sequential' | 'parallel';
    signatoryUserIds: string[];
    fields?: Partial<SignatureField>[];
    pdfUrl: string;
  }): Promise<{ document: DocumentItem }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (!user) throw new Error('Unauthorized');

    const now = new Date().toISOString();
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const safeUser = sanitizeUser(user);

    const signatories: DocumentSignatory[] = data.signatoryUserIds.map((uid, idx) => {
      const target = db.users.find((u) => u.id === uid);
      return {
        id: `signtry-${Date.now()}-${idx}`,
        documentId: docId,
        userId: uid,
        user: target ? sanitizeUser(target) : undefined,
        signingOrder: idx + 1,
        status: data.signingOrderType === 'sequential' && idx > 0 ? 'waiting' : 'pending',
      };
    });

    const fields: SignatureField[] = (data.fields || []).map((f, idx) => {
      const sig = signatories.find((s) => s.userId === f.userId);
      return {
        id: f.id || `fld-${Date.now()}-${idx}`,
        documentId: docId,
        signatoryId: sig?.id || `signtry-${idx}`,
        userId: f.userId || user.id,
        pageNumber: f.pageNumber || 1,
        xPercent: f.xPercent ?? 15,
        yPercent: f.yPercent ?? 30,
        widthPercent: f.widthPercent ?? 35,
        heightPercent: f.heightPercent ?? 8,
        fieldLabel: f.fieldLabel || 'Signature',
        isRequired: f.isRequired ?? true,
        isSigned: false,
      };
    });

    const newDoc: DocumentItem = {
      id: docId,
      title: data.title,
      description: data.description || '',
      category: data.category || 'Resolution',
      referenceNumber: data.referenceNumber || `NFSSLG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      deadline: data.deadline,
      instructions: data.instructions,
      status: 'pending_signatures',
      signingOrderType: data.signingOrderType || 'parallel',
      initiatorId: user.id,
      initiator: safeUser,
      signatories,
      fields,
      signatures: [],
      originalPdfUrl: data.pdfUrl,
      currentVersion: 1,
      pageCount: 2,
      createdAt: now,
      updatedAt: now,
    };

    db.documents.unshift(newDoc);
    db.events.unshift({
      id: `evt-${Date.now()}`,
      documentId: docId,
      documentTitle: newDoc.title,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      action: 'DOCUMENT_UPLOADED',
      details: `Created document ${newDoc.title} with ${signatories.length} signatories.`,
      timestamp: now,
      ipAddress: 'Client Browser',
    });

    for (const sig of signatories) {
      if (sig.status === 'pending') {
        db.notifications.unshift({
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          userId: sig.userId,
          title: 'Document Signature Required',
          message: `${user.fullName} requested your signature on "${newDoc.title}".`,
          link: `/documents/${docId}/sign`,
          read: false,
          createdAt: now,
        });
      }
    }

    saveStaticDb(db);
    const hydrated = await hydrateDocumentUrls(newDoc);
    emitLocalRealtime({ type: 'DOCUMENT_CREATED', payload: { document: hydrated } });
    return { document: hydrated };
  },

  async signeePlaceField(
    docId: string,
    coordinates: { pageNumber: number; xPercent: number; yPercent: number; widthPercent?: number; heightPercent?: number }
  ): Promise<{ success: boolean; document: DocumentItem; field: SignatureField }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (!user) throw new Error('Unauthorized');

    const docIdx = db.documents.findIndex((d) => d.id === docId);
    if (docIdx === -1) throw new Error('Document not found');
    const doc = db.documents[docIdx];
    const signatory = doc.signatories.find((s) => s.userId === user.id);
    if (!signatory) throw new Error('You are not a signatory on this document.');

    let field = doc.fields.find((f) => f.userId === user.id && !f.isSigned);
    if (!field) {
      field = {
        id: `fld-${Date.now()}`,
        documentId: docId,
        signatoryId: signatory.id,
        userId: user.id,
        pageNumber: coordinates.pageNumber,
        xPercent: coordinates.xPercent,
        yPercent: coordinates.yPercent,
        widthPercent: coordinates.widthPercent ?? 34,
        heightPercent: coordinates.heightPercent ?? 9,
        fieldLabel: `${user.fullName} Signature`,
        isRequired: true,
        isSigned: false,
      };
      doc.fields.push(field);
    } else {
      field.pageNumber = coordinates.pageNumber;
      field.xPercent = coordinates.xPercent;
      field.yPercent = coordinates.yPercent;
      if (coordinates.widthPercent !== undefined) field.widthPercent = coordinates.widthPercent;
      if (coordinates.heightPercent !== undefined) field.heightPercent = coordinates.heightPercent;
    }

    doc.updatedAt = new Date().toISOString();
    saveStaticDb(db);
    const hydrated = await hydrateDocumentUrls(doc);
    emitLocalRealtime({ type: 'FIELDS_UPDATED', payload: { documentId: docId, document: hydrated } });
    return { success: true, document: hydrated, field };
  },

  async signDocument(
    docId: string,
    payload: {
      signaturePng?: string;
      fieldId?: string;
      coordinates?: { pageNumber: number; xPercent: number; yPercent: number; widthPercent: number; heightPercent: number };
    }
  ): Promise<{ success: boolean; document: DocumentItem; signature: SignatureRecord; completed: boolean }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (!user) throw new Error('Unauthorized');

    const docIdx = db.documents.findIndex((d) => d.id === docId);
    if (docIdx === -1) throw new Error('Document not found');
    const doc = db.documents[docIdx];
    const signatory = doc.signatories.find((s) => s.userId === user.id);
    if (!signatory) throw new Error('Not assigned as signatory.');
    if (signatory.status === 'signed') throw new Error('You have already signed this document.');

    const sigData = payload.signaturePng || user.signaturePngUrl;
    if (!sigData) throw new Error('Please create or upload your signature first.');

    const targetField = doc.fields.find((f) => f.id === payload.fieldId) || doc.fields.find((f) => f.userId === user.id && !f.isSigned);
    const now = new Date().toISOString();
    const verificationHash = await computeSha256Hex(`${user.id}-${doc.id}-${now}-${doc.referenceNumber}`);

    const newSig: SignatureRecord = {
      id: `sig-${Date.now()}`,
      documentId: doc.id,
      signatoryId: signatory.id,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPosition: user.position,
      signatureFieldId: targetField?.id || 'default-field',
      signaturePngData: sigData,
      pageNumber: payload.coordinates?.pageNumber || targetField?.pageNumber || 1,
      xPercent: payload.coordinates?.xPercent ?? targetField?.xPercent ?? 15,
      yPercent: payload.coordinates?.yPercent ?? targetField?.yPercent ?? 30,
      widthPercent: payload.coordinates?.widthPercent ?? targetField?.widthPercent ?? 34,
      heightPercent: payload.coordinates?.heightPercent ?? targetField?.heightPercent ?? 9,
      signedAt: now,
      verificationHash,
      ipAddress: 'Client Browser',
    };

    signatory.status = 'signed';
    signatory.signedAt = now;
    if (targetField) targetField.isSigned = true;
    doc.signatures.push(newSig);

    if (doc.signingOrderType === 'sequential') {
      const next = doc.signatories.filter((s) => s.status === 'waiting').sort((a, b) => a.signingOrder - b.signingOrder)[0];
      if (next) next.status = 'pending';
    }

    const completed = doc.signatories.every((s) => s.status === 'signed');
    doc.status = completed ? 'completed' : 'in_progress';
    doc.updatedAt = now;

    if (completed) {
      doc.finalPdfUrl = await finalizeBrowserPdf(doc, doc.signatures);
    }

    db.events.unshift({
      id: `evt-${Date.now()}`,
      documentId: doc.id,
      documentTitle: doc.title,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      action: completed ? 'DOCUMENT_COMPLETED' : 'SIGNATURE_CONFIRMED',
      details: `Affixed authorized digital signature to Page ${newSig.pageNumber} (Hash: ${verificationHash.slice(0, 12)}).`,
      timestamp: now,
      ipAddress: 'Client Browser',
    });

    saveStaticDb(db);
    const hydrated = await hydrateDocumentUrls(doc);
    emitLocalRealtime({ type: 'SIGNATURE_ADDED', payload: { documentId: doc.id, document: hydrated, completed } });
    return { success: true, document: hydrated, signature: newSig, completed };
  },

  async updateDocumentFields(docId: string, fields: SignatureField[]): Promise<{ document: DocumentItem }> {
    const db = loadStaticDb();
    const doc = db.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');
    doc.fields = fields;
    doc.updatedAt = new Date().toISOString();
    saveStaticDb(db);
    const hydrated = await hydrateDocumentUrls(doc);
    emitLocalRealtime({ type: 'FIELDS_UPDATED', payload: { documentId: docId, document: hydrated } });
    return { document: hydrated };
  },

  async cancelDocument(docId: string): Promise<{ document: DocumentItem }> {
    const db = loadStaticDb();
    const doc = db.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');
    doc.status = 'cancelled';
    doc.updatedAt = new Date().toISOString();
    saveStaticDb(db);
    return { document: await hydrateDocumentUrls(doc) };
  },

  async rejectDocument(docId: string, reason?: string): Promise<{ document: DocumentItem }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    const doc = db.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Document not found');
    const sig = doc.signatories.find((s) => s.userId === user?.id);
    if (sig) {
      sig.status = 'rejected';
      sig.rejectionReason = reason;
    }
    doc.status = 'rejected';
    doc.updatedAt = new Date().toISOString();
    saveStaticDb(db);
    return { document: await hydrateDocumentUrls(doc) };
  },

  async uploadSignaturePng(dataUrlOrFile: string | File): Promise<{ url: string }> {
    if (typeof dataUrlOrFile === 'string') {
      return { url: dataUrlOrFile };
    }
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(dataUrlOrFile);
    });
    return { url };
  },

  async getEvents(): Promise<{ events: DocumentEvent[] }> {
    const db = loadStaticDb();
    return { events: db.events };
  },

  async getNotifications(): Promise<{ notifications: AppNotification[] }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (!user) return { notifications: [] };
    return { notifications: db.notifications.filter((n) => n.userId === user.id) };
  },

  async markNotificationRead(id: string): Promise<{ success: boolean }> {
    const db = loadStaticDb();
    const n = db.notifications.find((item) => item.id === id);
    if (n) n.read = true;
    saveStaticDb(db);
    return { success: true };
  },

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    const db = loadStaticDb();
    const user = getCurrentStaticUser(db);
    if (user) {
      db.notifications.forEach((n) => {
        if (n.userId === user.id) n.read = true;
      });
      saveStaticDb(db);
    }
    return { success: true };
  },

  async getSettings(): Promise<{ settings: OrganizationSettings }> {
    const db = loadStaticDb();
    return { settings: db.settings };
  },

  async updateSettings(updates: Partial<OrganizationSettings>): Promise<{ settings: OrganizationSettings }> {
    const db = loadStaticDb();
    db.settings = { ...db.settings, ...updates };
    saveStaticDb(db);
    return { settings: db.settings };
  },
};
