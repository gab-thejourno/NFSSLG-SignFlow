import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
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
import { requireSupabase, supabase, isSupabaseConfigured } from './supabaseClient';
import {
  processSignatureImageToTransparentPng,
  imageSourceToPngBlob,
} from './signatureProcessor';

// ==================== LOCAL EVENT BUS FOR IMMEDIATE UI SYNC ====================
type RealtimeListener = (event: any) => void;
const uiListeners = new Set<RealtimeListener>();

function emitUiEvent(event: any) {
  uiListeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // ignore
    }
  });
}

// ==================== HELPERS ====================
function isMissingColumnError(err: any): boolean {
  const code = err?.code || '';
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

function sanitizeWinAnsi(text: string): string {
  return (text || '')
    .replace(/•/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
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
  } catch {
    // ignore
  }
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(64, 'a');
}

function mapSupabaseUser(authUser: SupabaseAuthUser, profile?: any): User {
  const meta = (authUser.user_metadata || {}) as Record<string, any>;
  const email = profile?.email || authUser.email || '';
  const fallbackName = email ? email.split('@')[0] : 'SignFlow User';

  return {
    id: authUser.id,
    email,
    fullName: profile?.full_name || meta.full_name || fallbackName,
    username: profile?.username || meta.username || fallbackName,
    department: profile?.department || meta.department || 'National Federation of SSLG',
    position: profile?.position || meta.position || 'Authorized Signatory',
    role: (profile?.role || meta.role || 'user') as 'admin' | 'user',
    status: (profile?.status || meta.status || 'active') as 'active' | 'pending' | 'disabled',
    signaturePngUrl: profile?.signature_png_url || meta.signature_png_url || undefined,
    createdAt: profile?.created_at || authUser.created_at || new Date().toISOString(),
    updatedAt: profile?.updated_at || authUser.updated_at || new Date().toISOString(),
  };
}

function mapProfileRowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email || '',
    fullName: row.full_name || row.email?.split('@')[0] || 'SignFlow User',
    username: row.username || row.email?.split('@')[0] || 'user',
    department: row.department || 'National Federation of SSLG',
    position: row.position || 'Authorized Signatory',
    role: (row.role || 'user') as 'admin' | 'user',
    status: (row.status || 'active') as 'active' | 'pending' | 'disabled',
    signaturePngUrl: row.signature_png_url || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

async function fetchOrSyncProfile(authUser: SupabaseAuthUser): Promise<User> {
  const client = requireSupabase();
  try {
    const { data: existing } = await client
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (existing) {
      return mapSupabaseUser(authUser, existing);
    }

    const mapped = mapSupabaseUser(authUser);
    const { data: inserted } = await client
      .from('profiles')
      .upsert(
        {
          id: mapped.id,
          email: mapped.email,
          full_name: mapped.fullName,
          username: mapped.username,
          department: mapped.department,
          position: mapped.position,
          role: mapped.role,
          status: mapped.status,
          signature_png_url: mapped.signaturePngUrl || null,
        },
        { onConflict: 'id' }
      )
      .select('*')
      .maybeSingle();

    return mapSupabaseUser(authUser, inserted || undefined);
  } catch {
    return mapSupabaseUser(authUser);
  }
}

function mapDbSignatureRow(row: any, documentId: string): SignatureRecord {
  const posX = Number(row.pos_x ?? row.x_percent ?? 15);
  const posY = Number(row.pos_y ?? row.y_percent ?? 30);
  const width = Number(row.width ?? row.width_percent ?? 34);
  const height = Number(row.height ?? row.height_percent ?? 9);
  const pageNumber = Number(row.page_number ?? 1);
  const sigUrl = row.signature_url || row.signature_png_data || '';

  return {
    id: row.id || `sig-${row.user_id}-${pageNumber}`,
    documentId: row.document_id || documentId,
    signatoryId: `signtry-${row.user_id}`,
    userId: row.user_id,
    userName: row.signer_name || row.user_name || 'Authorized Signatory',
    userEmail: row.signer_email || row.user_email || '',
    userPosition: row.signer_position || row.user_position || 'Signatory',
    signatureFieldId: `fld-${row.user_id}`,
    signaturePngData: sigUrl,
    pageNumber,
    xPercent: posX,
    yPercent: posY,
    widthPercent: width,
    heightPercent: height,
    signedAt: row.signed_at || row.created_at || new Date().toISOString(),
    verificationHash: row.verification_hash || String(row.id || row.user_id || '').slice(0, 16),
  };
}

function mapDbDocumentRow(row: any, sigRows: any[] = []): DocumentItem {
  const signatures: SignatureRecord[] = sigRows.map((s) => mapDbSignatureRow(s, row.id));

  let signatories: DocumentSignatory[] = Array.isArray(row.signatories) ? row.signatories : [];
  if (signatories.length === 0 && signatures.length > 0) {
    signatories = signatures.map((s, idx) => ({
      id: `signtry-${s.userId}`,
      documentId: row.id,
      userId: s.userId,
      user: {
        id: s.userId,
        email: s.userEmail,
        fullName: s.userName,
        username: s.userEmail.split('@')[0] || 'signer',
        department: 'National Federation of SSLG',
        position: s.userPosition,
        role: 'user',
        status: 'active',
        createdAt: s.signedAt,
        updatedAt: s.signedAt,
      },
      signingOrder: idx + 1,
      status: 'signed',
      signedAt: s.signedAt,
    }));
  } else {
    signatories = signatories.map((sig) => {
      const matchedSig = signatures.find((s) => s.userId === sig.userId);
      if (matchedSig) {
        return { ...sig, status: 'signed', signedAt: matchedSig.signedAt };
      }
      return sig;
    });
  }

  const fields: SignatureField[] = Array.isArray(row.fields) ? row.fields : [];
  const allSigned =
    signatories.length > 0 && signatories.every((s) => s.status === 'signed');

  const computedStatus =
    row.status ||
    (allSigned
      ? 'completed'
      : signatures.length > 0
      ? 'in_progress'
      : 'pending_signatures');

  return {
    id: row.id,
    title: row.title || 'Untitled Document',
    description: row.description || '',
    category: row.category || 'Resolution',
    referenceNumber: row.reference_number || `DOC-${String(row.id).slice(0, 8).toUpperCase()}`,
    deadline: row.deadline || undefined,
    instructions: row.instructions || undefined,
    status: computedStatus,
    signingOrderType: (row.signing_order_type || 'parallel') as 'sequential' | 'parallel',
    initiatorId: row.initiator_id || '',
    initiator: row.initiator_name
      ? {
          id: row.initiator_id || '',
          email: row.initiator_email || '',
          fullName: row.initiator_name,
          username: (row.initiator_email || 'initiator').split('@')[0],
          department: 'National Federation of SSLG',
          position: 'Document Initiator',
          role: 'user',
          status: 'active',
          createdAt: row.created_at || new Date().toISOString(),
          updatedAt: row.updated_at || new Date().toISOString(),
        }
      : undefined,
    signatories,
    fields,
    signatures,
    originalPdfUrl: row.original_file_url || row.original_pdf_url || '',
    finalPdfUrl: row.final_file_url || row.final_pdf_url || row.original_file_url || '',
    currentVersion: 1,
    pageCount: row.page_count || 1,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

async function fetchDocumentSignaturesRows(documentId: string): Promise<any[]> {
  const client = requireSupabase();
  let res = await client
    .from('document_signatures')
    .select('*')
    .eq('document_id', documentId)
    .order('signed_at', { ascending: true });

  if (res.error && isMissingColumnError(res.error)) {
    res = await client
      .from('document_signatures')
      .select('*')
      .eq('document_id', documentId);
  }

  if (res.error) {
    console.warn('Could not fetch public.document_signatures rows:', res.error.message);
    return [];
  }
  return res.data || [];
}

async function buildSamplePdfBytes(
  title: string,
  refNum: string,
  category: string,
  signers: string[] = []
): Promise<Uint8Array> {
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

  page1.drawText(sanitizeWinAnsi(`REF: ${refNum}  |  CLASSIFICATION: OFFICIAL`), {
    x: width - 290,
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
    'SECTION 3. DIGITAL SIGNATURE AND AUDIT CONFORMITY\nPursuant to applicable electronic signatures rules, signatures affixed via the NFSSLG SignFlow platform constitute original, irrevocable, and binding execution.',
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

  page2.drawText('SECTION 4. AUTHORIZED EXECUTION AND SIGNATURE BLOCKS', {
    x: 40,
    y: height - 110,
    size: 13,
    font: helveticaBold,
    color: rgb(0.06, 0.16, 0.26),
  });

  const signerList = signers.length ? signers : ['Authorized Signatory'];
  let boxY = height - 200;
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

  return pdfDoc.save();
}

/**
 * Fetches original_file_url + all rows in public.document_signatures,
 * embeds every signature PNG onto the base PDF using pdf-lib,
 * uploads the merged PDF to documents/final/{documentId}.pdf (upsert: true),
 * and returns its public URL.
 */
async function mergeAllSignaturesOntoPdf(
  documentId: string,
  originalFileUrl: string,
  signatureRows: any[]
): Promise<string> {
  const client = requireSupabase();

  // 1. Fetch base PDF from original_file_url
  const basePdfRes = await fetch(originalFileUrl, { cache: 'no-store' });
  if (!basePdfRes.ok) {
    throw new Error(`Failed to fetch base PDF from original_file_url (HTTP ${basePdfRes.status}).`);
  }
  const basePdfBytes = await basePdfRes.arrayBuffer();
  const pdfDoc = await PDFDocument.load(basePdfBytes);
  const pages = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // 2. Embed every signature PNG row from public.document_signatures
  for (const sig of signatureRows) {
    const sigUrl: string = sig.signature_url;
    if (!sigUrl) continue;

    const pageIdx = Math.max(0, Math.min((Number(sig.page_number) || 1) - 1, pages.length - 1));
    const targetPage = pages[pageIdx];
    const { width: pageWidth, height: pageHeight } = targetPage.getSize();

    const posX = Number(sig.pos_x ?? 15);
    const posY = Number(sig.pos_y ?? 30);
    const boxWPercent = Number(sig.width ?? 34);
    const boxHPercent = Number(sig.height ?? 9);

    const xPt = (posX / 100) * pageWidth;
    const wPt = (boxWPercent / 100) * pageWidth;
    const hPt = (boxHPercent / 100) * pageHeight;
    const yPt = pageHeight - ((posY + boxHPercent) / 100) * pageHeight;

    // Fetch signature PNG from Supabase Storage (cache-busted so upserts always read fresh bytes)
    const fetchUrl = sigUrl.includes('?') ? `${sigUrl}&t=${Date.now()}` : `${sigUrl}?t=${Date.now()}`;
    const imgRes = await fetch(fetchUrl, { cache: 'no-store' });
    if (!imgRes.ok) {
      console.warn(`Could not fetch signature image ${sigUrl}: HTTP ${imgRes.status}`);
      continue;
    }

    const imgBytes = await imgRes.arrayBuffer();
    let embeddedImage;
    try {
      embeddedImage = await pdfDoc.embedPng(imgBytes);
    } catch {
      try {
        embeddedImage = await pdfDoc.embedJpg(imgBytes);
      } catch (embedErr) {
        console.warn('Could not embed signature image into PDF:', embedErr);
        continue;
      }
    }

    // Preserve natural image aspect ratio cleanly inside the target box
    const imgAspect = embeddedImage.width / embeddedImage.height;
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

    targetPage.drawImage(embeddedImage, {
      x: finalX,
      y: finalY,
      width: finalWidth,
      height: finalHeight,
    });

    const signerLabel = sig.signer_name || 'Verified Signatory';
    const signedDate = sig.signed_at
      ? new Date(sig.signed_at).toLocaleDateString()
      : new Date().toLocaleDateString();

    targetPage.drawText(
      sanitizeWinAnsi(`Signed: ${signerLabel} | ${signedDate}`),
      {
        x: xPt,
        y: Math.max(8, yPt - 10),
        size: 6.5,
        font: helvetica,
        color: rgb(0.1, 0.35, 0.6),
      }
    );
  }

  // 3. Export merged PDF bytes
  const mergedBytes = await pdfDoc.save();
  const mergedBlob = new Blob(
    [
      mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength
      ) as ArrayBuffer,
    ],
    { type: 'application/pdf' }
  );

  // 4. Upload to documents/final/{document_id}.pdf (upsert: true)
  const finalStoragePath = `final/${documentId}.pdf`;
  const { error: uploadErr } = await client.storage
    .from('documents')
    .upload(finalStoragePath, mergedBlob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload merged final PDF: ${uploadErr.message}`);
  }

  const { data: finalPublicUrlData } = client.storage
    .from('documents')
    .getPublicUrl(finalStoragePath);

  return finalPublicUrlData.publicUrl;
}

// ==================== PUBLIC SUPABASE API ====================
export const supabaseApi = {
  isConfigured(): boolean {
    return isSupabaseConfigured;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error(error.message);
    }
    if (!data.user || !data.session) {
      throw new Error('Authentication failed. Please confirm your email and password.');
    }

    const user = await fetchOrSyncProfile(data.user);
    return { user, token: data.session.access_token };
  },

  async register(userData: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    position: string;
    username?: string;
  }): Promise<{ user: User; requiresApproval: boolean; sessionActive: boolean; message: string }> {
    const client = requireSupabase();
    const username = userData.username || userData.email.split('@')[0];

    const { data, error } = await client.auth.signUp({
      email: userData.email.trim(),
      password: userData.password,
      options: {
        data: {
          full_name: userData.fullName.trim(),
          username,
          department: userData.department.trim() || 'National Federation of SSLG',
          position: userData.position.trim() || 'Authorized Signatory',
          role: 'user',
          status: 'active',
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }
    if (!data.user) {
      throw new Error('Sign up did not return a user record.');
    }

    const mapped = data.session
      ? await fetchOrSyncProfile(data.user)
      : mapSupabaseUser(data.user);

    const sessionActive = Boolean(data.session);
    return {
      user: mapped,
      sessionActive,
      requiresApproval: !sessionActive,
      message: sessionActive
        ? 'Account created and signed in.'
        : 'Account created! Please check your email to confirm your address before signing in.',
    };
  },

  async logout(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  async getMe(): Promise<{ user: User }> {
    const client = requireSupabase();
    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error || !session?.user) {
      throw new Error('Not authenticated');
    }

    const user = await fetchOrSyncProfile(session.user);
    return { user };
  },

  async updateProfile(updates: Partial<User>): Promise<{ user: User }> {
    const client = requireSupabase();
    const {
      data: { user: authUser },
      error: userErr,
    } = await client.auth.getUser();

    if (userErr || !authUser) {
      throw new Error('You must be signed in to update your profile.');
    }

    const nextMeta: Record<string, any> = {
      ...(authUser.user_metadata || {}),
    };
    if (updates.fullName !== undefined) nextMeta.full_name = updates.fullName;
    if (updates.department !== undefined) nextMeta.department = updates.department;
    if (updates.position !== undefined) nextMeta.position = updates.position;
    if (updates.username !== undefined) nextMeta.username = updates.username;
    if (updates.signaturePngUrl !== undefined) nextMeta.signature_png_url = updates.signaturePngUrl;

    const { data: updatedAuth, error: updateErr } = await client.auth.updateUser({
      data: nextMeta,
    });
    if (updateErr) {
      throw new Error(updateErr.message);
    }

    try {
      const dbPatch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (updates.fullName !== undefined) dbPatch.full_name = updates.fullName;
      if (updates.department !== undefined) dbPatch.department = updates.department;
      if (updates.position !== undefined) dbPatch.position = updates.position;
      if (updates.username !== undefined) dbPatch.username = updates.username;
      if (updates.signaturePngUrl !== undefined) dbPatch.signature_png_url = updates.signaturePngUrl;

      await client.from('profiles').update(dbPatch).eq('id', authUser.id);
    } catch {
      // ignore if profiles table is not created
    }

    const freshUser = await fetchOrSyncProfile(updatedAuth.user || authUser);
    return { user: freshUser };
  },

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const client = requireSupabase();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();

    if (!authUser?.email) {
      throw new Error('You must be signed in to change your password.');
    }

    if (currentPassword) {
      const { error: verifyErr } = await client.auth.signInWithPassword({
        email: authUser.email,
        password: currentPassword,
      });
      if (verifyErr) {
        throw new Error('Current password is incorrect.');
      }
    }

    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }

    return { success: true, message: 'Password updated successfully!' };
  },

  async getUsers(): Promise<{ users: User[] }> {
    const client = requireSupabase();
    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return { users: data.map(mapProfileRowToUser) };
      }
    } catch {
      // fallback to current user if profiles table doesn't exist yet
    }

    const me = await this.getMe();
    return { users: [me.user] };
  },

  async updateUser(id: string, updates: Partial<User>): Promise<{ user: User }> {
    const client = requireSupabase();
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.status !== undefined) patch.status = updates.status;
    if (updates.fullName !== undefined) patch.full_name = updates.fullName;
    if (updates.department !== undefined) patch.department = updates.department;
    if (updates.position !== undefined) patch.position = updates.position;

    const { data, error } = await client
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { user: mapProfileRowToUser(data) };
  },

  async uploadPdf(
    file?: File,
    templateData?: {
      templateTitle: string;
      templateRef: string;
      category: string;
      signers?: string[];
    }
  ): Promise<{ fileUrl: string; filename: string; size?: number; pageCount: number }> {
    const client = requireSupabase();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();
    if (!authUser) {
      throw new Error('Please sign in before uploading a document.');
    }

    let uploadBlob: Blob;
    let filename: string;
    let pageCount = 2;

    if (file) {
      const arrayBuf = await file.arrayBuffer();
      try {
        const pdf = await PDFDocument.load(arrayBuf);
        pageCount = pdf.getPageCount();
      } catch {
        pageCount = 1;
      }
      uploadBlob = new Blob([arrayBuf], { type: 'application/pdf' });
      filename = file.name.endsWith('.pdf') ? file.name : `${file.name}.pdf`;
    } else {
      const pdfBytes = await buildSamplePdfBytes(
        templateData?.templateTitle || 'Official Document',
        templateData?.templateRef || `NFSSLG-${Date.now().toString().slice(-4)}`,
        templateData?.category || 'Resolution',
        templateData?.signers || ['Authorized Signatory']
      );
      uploadBlob = new Blob(
        [pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer],
        { type: 'application/pdf' }
      );
      filename = `${(templateData?.templateTitle || 'Document').replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`;
      pageCount = 2;
    }

    const safeFileName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storagePath = `originals/${authUser.id}/${Date.now()}_${safeFileName}`;

    const { error: uploadErr } = await client.storage
      .from('documents')
      .upload(storagePath, uploadBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Failed to upload PDF to Supabase Storage "documents" bucket: ${uploadErr.message}`);
    }

    const { data: urlData } = client.storage.from('documents').getPublicUrl(storagePath);

    return {
      fileUrl: urlData.publicUrl,
      filename,
      size: uploadBlob.size,
      pageCount,
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
    const client = requireSupabase();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();
    if (!authUser) {
      throw new Error('Please sign in to create a document.');
    }

    const currentUser = await fetchOrSyncProfile(authUser);
    const { users: allUsers } = await this.getUsers();
    const docId = crypto.randomUUID();
    const now = new Date().toISOString();

    const signatories: DocumentSignatory[] = data.signatoryUserIds.map((uid, idx) => {
      const target = allUsers.find((u) => u.id === uid) || (uid === currentUser.id ? currentUser : undefined);
      return {
        id: `signtry-${uid}`,
        documentId: docId,
        userId: uid,
        user: target,
        signingOrder: idx + 1,
        status: data.signingOrderType === 'sequential' && idx > 0 ? 'waiting' : 'pending',
      };
    });

    const fields: SignatureField[] = (data.fields || []).map((f, idx) => ({
      id: f.id || `fld-${idx}-${Date.now()}`,
      documentId: docId,
      signatoryId: `signtry-${f.userId || currentUser.id}`,
      userId: f.userId || currentUser.id,
      pageNumber: f.pageNumber || 1,
      xPercent: f.xPercent ?? 15,
      yPercent: f.yPercent ?? 30,
      widthPercent: f.widthPercent ?? 34,
      heightPercent: f.heightPercent ?? 9,
      fieldLabel: f.fieldLabel || 'Signature',
      isRequired: f.isRequired ?? true,
      isSigned: false,
    }));

    const fullPayload = {
      id: docId,
      title: data.title,
      description: data.description || '',
      category: data.category || 'Resolution',
      reference_number:
        data.referenceNumber || `NFSSLG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      deadline: data.deadline || null,
      instructions: data.instructions || '',
      status: 'pending_signatures',
      signing_order_type: data.signingOrderType || 'parallel',
      initiator_id: currentUser.id,
      initiator_name: currentUser.fullName,
      initiator_email: currentUser.email,
      signatories,
      fields,
      original_file_url: data.pdfUrl,
      final_file_url: data.pdfUrl,
      page_count: 2,
      created_at: now,
      updated_at: now,
    };

    let insertRes = await client
      .from('documents')
      .insert(fullPayload)
      .select('*')
      .single();

    // Minimal schema resilience fallback if user's public.documents only has core columns
    if (insertRes.error && isMissingColumnError(insertRes.error)) {
      insertRes = await client
        .from('documents')
        .insert({
          id: docId,
          title: data.title,
          original_file_url: data.pdfUrl,
          final_file_url: data.pdfUrl,
        })
        .select('*')
        .single();
    }

    if (insertRes.error) {
      throw new Error(`Failed to insert row in public.documents: ${insertRes.error.message}`);
    }

    const mapped = mapDbDocumentRow(insertRes.data, []);
    emitUiEvent({ type: 'DOCUMENT_CREATED', payload: { document: mapped } });
    return { document: mapped };
  },

  async getDocuments(params?: {
    scope?: string;
    filterStatus?: string;
    search?: string;
  }): Promise<{ documents: DocumentItem[] }> {
    const client = requireSupabase();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();
    if (!authUser) throw new Error('Unauthorized');

    const { data: docRows, error } = await client
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch public.documents: ${error.message}`);
    }

    const rows = docRows || [];
    const docIds = rows.map((d) => d.id);

    let allSigRows: any[] = [];
    if (docIds.length > 0) {
      const sigRes = await client
        .from('document_signatures')
        .select('*')
        .in('document_id', docIds);
      if (!sigRes.error && sigRes.data) {
        allSigRows = sigRes.data;
      }
    }

    let docs = rows.map((row) =>
      mapDbDocumentRow(
        row,
        allSigRows.filter((s) => s.document_id === row.id)
      )
    );

    const scope = params?.scope;
    if (scope === 'assigned') {
      docs = docs.filter(
        (d) =>
          d.signatories.length === 0 ||
          d.signatories.some((s) => s.userId === authUser.id)
      );
    } else if (scope === 'mine') {
      docs = docs.filter((d) => !d.initiatorId || d.initiatorId === authUser.id);
    } else if (scope === 'completed') {
      docs = docs.filter((d) => d.status === 'completed');
    } else if (scope === 'drafts') {
      docs = docs.filter((d) => d.status === 'draft');
    } else if (scope === 'archived') {
      docs = docs.filter((d) => d.status === 'archived');
    }

    if (params?.filterStatus && params.filterStatus !== 'all') {
      const fs = params.filterStatus;
      if (fs === 'pending') {
        docs = docs.filter((d) => {
          const sig = d.signatories.find((s) => s.userId === authUser.id);
          return sig
            ? sig.status === 'pending'
            : d.status === 'pending_signatures' || d.status === 'in_progress';
        });
      } else if (fs === 'signed') {
        docs = docs.filter(
          (d) =>
            d.signatories.find((s) => s.userId === authUser.id)?.status === 'signed' ||
            d.signatures.some((s) => s.userId === authUser.id)
        );
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

    return { documents: docs };
  },

  async getDocument(id: string): Promise<{ document: DocumentItem }> {
    const client = requireSupabase();
    const { data: row, error } = await client
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) {
      throw new Error(error?.message || 'Document not found');
    }

    const sigRows = await fetchDocumentSignaturesRows(id);
    return { document: mapDbDocumentRow(row, sigRows) };
  },

  async signeePlaceField(
    docId: string,
    coordinates: {
      pageNumber: number;
      xPercent: number;
      yPercent: number;
      widthPercent?: number;
      heightPercent?: number;
    }
  ): Promise<{ success: boolean; document: DocumentItem; field: SignatureField }> {
    const client = requireSupabase();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();
    if (!authUser) throw new Error('Unauthorized');

    const { document: currentDoc } = await this.getDocument(docId);
    const currentUser = await fetchOrSyncProfile(authUser);

    const updatedFields = [...currentDoc.fields];
    let field = updatedFields.find((f) => f.userId === authUser.id && !f.isSigned);

    if (!field) {
      field = {
        id: `fld-${authUser.id}-${Date.now()}`,
        documentId: docId,
        signatoryId: `signtry-${authUser.id}`,
        userId: authUser.id,
        pageNumber: coordinates.pageNumber,
        xPercent: coordinates.xPercent,
        yPercent: coordinates.yPercent,
        widthPercent: coordinates.widthPercent ?? 34,
        heightPercent: coordinates.heightPercent ?? 9,
        fieldLabel: `${currentUser.fullName} Signature`,
        isRequired: true,
        isSigned: false,
      };
      updatedFields.push(field);
    } else {
      field.pageNumber = coordinates.pageNumber;
      field.xPercent = coordinates.xPercent;
      field.yPercent = coordinates.yPercent;
      if (coordinates.widthPercent !== undefined) field.widthPercent = coordinates.widthPercent;
      if (coordinates.heightPercent !== undefined) field.heightPercent = coordinates.heightPercent;
    }

    try {
      await client
        .from('documents')
        .update({ fields: updatedFields, updated_at: new Date().toISOString() })
        .eq('id', docId);
    } catch {
      // ignore if fields column is not present
    }

    const updatedDoc = { ...currentDoc, fields: updatedFields };
    emitUiEvent({ type: 'FIELDS_UPDATED', payload: { documentId: docId, document: updatedDoc } });
    return { success: true, document: updatedDoc, field };
  },

  async signDocument(
    docId: string,
    payload: {
      signaturePng?: string;
      signatureFile?: File;
      fieldId?: string;
      coordinates?: {
        pageNumber: number;
        xPercent: number;
        yPercent: number;
        widthPercent: number;
        heightPercent: number;
      };
    }
  ): Promise<{ success: boolean; document: DocumentItem; signature: SignatureRecord; completed: boolean }> {
    const client = requireSupabase();
    const {
      data: { user: authUser },
    } = await client.auth.getUser();
    if (!authUser) throw new Error('Unauthorized');

    const currentUser = await fetchOrSyncProfile(authUser);

    // 1. Convert signature image/file to transparent PNG Blob on HTML Canvas
    let pngBlob: Blob;
    if (payload.signatureFile) {
      const processed = await processSignatureImageToTransparentPng(payload.signatureFile);
      pngBlob = processed.blob;
    } else if (payload.signaturePng) {
      pngBlob = await imageSourceToPngBlob(payload.signaturePng);
    } else if (currentUser.signaturePngUrl) {
      pngBlob = await imageSourceToPngBlob(currentUser.signaturePngUrl);
    } else {
      throw new Error('Please upload, draw, or type your signature before confirming.');
    }

    // 2. Upload transparent PNG to signatures/{document_id}/{user_id}.png (upsert: true)
    const sigStoragePath = `${docId}/${authUser.id}.png`;
    const { error: sigUploadErr } = await client.storage
      .from('signatures')
      .upload(sigStoragePath, pngBlob, {
        contentType: 'image/png',
        upsert: true,
      });

    if (sigUploadErr) {
      throw new Error(`Failed to upload signature PNG to "signatures" bucket: ${sigUploadErr.message}`);
    }

    const { data: sigUrlData } = client.storage.from('signatures').getPublicUrl(sigStoragePath);
    const signaturePublicUrl = sigUrlData.publicUrl;

    // 3. Determine coordinates
    const { document: existingDoc } = await this.getDocument(docId);
    const targetField =
      existingDoc.fields.find((f) => f.id === payload.fieldId) ||
      existingDoc.fields.find((f) => f.userId === authUser.id && !f.isSigned);

    const pageNumber = payload.coordinates?.pageNumber ?? targetField?.pageNumber ?? 1;
    const posX = payload.coordinates?.xPercent ?? targetField?.xPercent ?? 15;
    const posY = payload.coordinates?.yPercent ?? targetField?.yPercent ?? 30;
    const width = payload.coordinates?.widthPercent ?? targetField?.widthPercent ?? 34;
    const height = payload.coordinates?.heightPercent ?? targetField?.heightPercent ?? 9;

    const now = new Date().toISOString();
    const verificationHash = await computeSha256Hex(`${authUser.id}-${docId}-${now}`);

    // 4. Save signature public URL, page_number, and (pos_x, pos_y, width, height) into public.document_signatures
    const existingSigCheck = await client
      .from('document_signatures')
      .select('id')
      .eq('document_id', docId)
      .eq('user_id', authUser.id)
      .maybeSingle();

    const fullSigRow = {
      document_id: docId,
      user_id: authUser.id,
      signature_url: signaturePublicUrl,
      page_number: pageNumber,
      pos_x: posX,
      pos_y: posY,
      width,
      height,
      signer_name: currentUser.fullName,
      signer_email: currentUser.email,
      signer_position: currentUser.position,
      verification_hash: verificationHash,
      signed_at: now,
    };

    const minimalSigRow = {
      document_id: docId,
      user_id: authUser.id,
      signature_url: signaturePublicUrl,
      page_number: pageNumber,
      pos_x: posX,
      pos_y: posY,
      width,
      height,
    };

    let savedSigRow: any;
    if (existingSigCheck.data?.id) {
      let updRes = await client
        .from('document_signatures')
        .update(fullSigRow)
        .eq('id', existingSigCheck.data.id)
        .select('*')
        .single();

      if (updRes.error && isMissingColumnError(updRes.error)) {
        updRes = await client
          .from('document_signatures')
          .update(minimalSigRow)
          .eq('id', existingSigCheck.data.id)
          .select('*')
          .single();
      }
      if (updRes.error) {
        throw new Error(`Failed to update public.document_signatures: ${updRes.error.message}`);
      }
      savedSigRow = updRes.data;
    } else {
      let insRes = await client
        .from('document_signatures')
        .insert(fullSigRow)
        .select('*')
        .single();

      if (insRes.error && isMissingColumnError(insRes.error)) {
        insRes = await client
          .from('document_signatures')
          .insert(minimalSigRow)
          .select('*')
          .single();
      }
      if (insRes.error) {
        throw new Error(`Failed to insert into public.document_signatures: ${insRes.error.message}`);
      }
      savedSigRow = insRes.data;
    }

    // 5. Immediately fetch original_file_url AND all rows in public.document_signatures for that document
    const { data: freshDocRow, error: fetchDocErr } = await client
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();

    if (fetchDocErr || !freshDocRow) {
      throw new Error(`Failed to fetch document original_file_url: ${fetchDocErr?.message}`);
    }

    const allSigRows = await fetchDocumentSignaturesRows(docId);

    // 6. Use pdf-lib to merge EVERY signature PNG onto the base PDF & upload to documents/final/{document_id}.pdf
    const finalFileUrl = await mergeAllSignaturesOntoPdf(
      docId,
      freshDocRow.original_file_url,
      allSigRows
    );

    // 7. Update signatories/status metadata + final_file_url in public.documents
    let updatedSignatories: DocumentSignatory[] = Array.isArray(freshDocRow.signatories)
      ? freshDocRow.signatories
      : [];

    if (updatedSignatories.length > 0) {
      const idx = updatedSignatories.findIndex((s) => s.userId === authUser.id);
      if (idx >= 0) {
        updatedSignatories[idx] = {
          ...updatedSignatories[idx],
          status: 'signed',
          signedAt: now,
        };
      }
      if (freshDocRow.signing_order_type === 'sequential') {
        const nextWaiting = updatedSignatories
          .filter((s) => s.status === 'waiting')
          .sort((a, b) => a.signingOrder - b.signingOrder)[0];
        if (nextWaiting) {
          nextWaiting.status = 'pending';
        }
      }
    }

    const updatedFields = (Array.isArray(freshDocRow.fields) ? freshDocRow.fields : []).map(
      (f: SignatureField) => (f.userId === authUser.id ? { ...f, isSigned: true } : f)
    );

    const completed =
      updatedSignatories.length > 0
        ? updatedSignatories.every((s) => s.status === 'signed')
        : false;

    const newStatus = completed ? 'completed' : 'in_progress';

    let updateDocRes = await client
      .from('documents')
      .update({
        final_file_url: finalFileUrl,
        signatories: updatedSignatories,
        fields: updatedFields,
        status: newStatus,
        updated_at: now,
      })
      .eq('id', docId)
      .select('*')
      .single();

    if (updateDocRes.error && isMissingColumnError(updateDocRes.error)) {
      updateDocRes = await client
        .from('documents')
        .update({ final_file_url: finalFileUrl })
        .eq('id', docId)
        .select('*')
        .single();
    }

    if (updateDocRes.error) {
      throw new Error(`Failed to update final_file_url in public.documents: ${updateDocRes.error.message}`);
    }

    const finalMappedDoc = mapDbDocumentRow(updateDocRes.data, allSigRows);
    const mappedSig = mapDbSignatureRow(savedSigRow, docId);

    emitUiEvent({
      type: 'SIGNATURE_ADDED',
      payload: { documentId: docId, document: finalMappedDoc, completed },
    });

    return {
      success: true,
      document: finalMappedDoc,
      signature: mappedSig,
      completed,
    };
  },

  async updateDocumentFields(docId: string, fields: SignatureField[]): Promise<{ document: DocumentItem }> {
    const client = requireSupabase();
    try {
      await client
        .from('documents')
        .update({ fields, updated_at: new Date().toISOString() })
        .eq('id', docId);
    } catch {
      // ignore
    }
    const { document } = await this.getDocument(docId);
    emitUiEvent({ type: 'FIELDS_UPDATED', payload: { documentId: docId, document } });
    return { document };
  },

  async cancelDocument(docId: string): Promise<{ document: DocumentItem }> {
    const client = requireSupabase();
    await client
      .from('documents')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', docId);
    return this.getDocument(docId);
  },

  async rejectDocument(docId: string, _reason?: string): Promise<{ document: DocumentItem }> {
    const client = requireSupabase();
    await client
      .from('documents')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', docId);
    return this.getDocument(docId);
  },

  async uploadSignaturePng(dataUrlOrFile: string | File): Promise<{ url: string }> {
    const processed = await processSignatureImageToTransparentPng(dataUrlOrFile);
    return { url: processed.dataUrl };
  },

  async getEvents(): Promise<{ events: DocumentEvent[] }> {
    if (!supabase) return { events: [] };
    try {
      const { data: docs } = await supabase
        .from('documents')
        .select('id, title, initiator_id, initiator_name, initiator_email, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: sigs } = await supabase
        .from('document_signatures')
        .select('*')
        .order('signed_at', { ascending: false })
        .limit(20);

      const events: DocumentEvent[] = [];

      (sigs || []).forEach((s: any) => {
        events.push({
          id: `evt-sig-${s.id}`,
          documentId: s.document_id,
          userId: s.user_id,
          userName: s.signer_name || 'Authorized Signatory',
          userEmail: s.signer_email || '',
          action: 'SIGNATURE_CONFIRMED',
          details: `Signed Page ${s.page_number || 1} and merged signature into final PDF.`,
          timestamp: s.signed_at || new Date().toISOString(),
        });
      });

      (docs || []).forEach((d: any) => {
        events.push({
          id: `evt-doc-${d.id}`,
          documentId: d.id,
          documentTitle: d.title,
          userId: d.initiator_id || '',
          userName: d.initiator_name || 'Document Initiator',
          userEmail: d.initiator_email || '',
          action: 'DOCUMENT_UPLOADED',
          details: `Uploaded "${d.title}" to Supabase documents registry.`,
          timestamp: d.created_at || new Date().toISOString(),
        });
      });

      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return { events };
    } catch {
      return { events: [] };
    }
  },

  async getNotifications(): Promise<{ notifications: AppNotification[] }> {
    if (!supabase) return { notifications: [] };
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return { notifications: [] };

      const { documents } = await this.getDocuments({ scope: 'assigned', filterStatus: 'pending' });
      const notifications: AppNotification[] = documents.map((d) => ({
        id: `notif-${d.id}`,
        userId: authUser.id,
        title: 'Document Signature Pending',
        message: `"${d.title}" is awaiting your signature.`,
        link: `/documents/${d.id}/sign`,
        read: false,
        createdAt: d.createdAt,
      }));
      return { notifications };
    } catch {
      return { notifications: [] };
    }
  },

  async markNotificationRead(_id: string): Promise<{ success: boolean }> {
    return { success: true };
  },

  async markAllNotificationsRead(): Promise<{ success: boolean }> {
    return { success: true };
  },

  async getSettings(): Promise<{ settings: OrganizationSettings }> {
    return {
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
  },

  async updateSettings(updates: Partial<OrganizationSettings>): Promise<{ settings: OrganizationSettings }> {
    const current = (await this.getSettings()).settings;
    return { settings: { ...current, ...updates } };
  },

  subscribeToRealtime(_userId: string | undefined, onEvent: (event: any) => void): () => void {
    uiListeners.add(onEvent);

    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel(`signflow-realtime-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'documents' },
          (payload) => {
            onEvent({ type: 'DOCUMENT_UPDATED', payload });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'document_signatures' },
          (payload: any) => {
            onEvent({
              type: 'DOCUMENT_UPDATED',
              payload: { documentId: payload?.new?.document_id || payload?.old?.document_id },
            });
          }
        )
        .subscribe();
    }

    return () => {
      uiListeners.delete(onEvent);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  },
};
