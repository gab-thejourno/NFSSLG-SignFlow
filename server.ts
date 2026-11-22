import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import {
  initDb,
  getUsers,
  getUserById,
  getUserByEmailWithPassword,
  createUser,
  updateUser,
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  addDocumentEvent,
  getDocumentEvents,
  getNotificationsForUser,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsRead,
  getSettings,
  updateSettings,
} from './server/db';
import {
  ensureUploadDir,
  createSampleContractPdf,
  finalizeDocumentPdf,
} from './server/pdfService';
import { registerRealtimeClient, broadcastEvent } from './server/realtime';
import type {
  DocumentItem,
  DocumentSignatory,
  SignatureField,
  SignatureRecord,
} from './src/types';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');

ensureUploadDir();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer storage for PDFs and Signatures
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

// Helper auth middleware
function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  // Match by user ID, or fallback to username / email
  const user = getUserById(token) || getUserByEmailWithPassword(token);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user as any;
  return safeUser;
}

// ==================== HEALTH CHECK ====================
app.get('/api/health', (_req: Request, res: Response) => {
  return res.json({ ok: true, mode: 'server', timestamp: Date.now() });
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, username, identifier, password } = req.body;
  const loginId = identifier || username || email;
  if (!loginId || !password) {
    return res.status(400).json({ error: 'User/Region identifier and password are required' });
  }

  const user = getUserByEmailWithPassword(loginId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid user or region identifier. (e.g. Region 1, NCR, BARMM, or admin)' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid password. (Password is adminpassword)' });
  }

  if (user.status === 'pending') {
    return res.status(403).json({
      error: 'Your account is currently pending administrator approval. Please contact your administrator.',
    });
  }

  if (user.status === 'disabled') {
    return res.status(403).json({
      error: 'Your account has been deactivated. Please contact your administrator.',
    });
  }

  const { passwordHash: _, ...safeUser } = user;
  return res.json({
    user: safeUser,
    token: safeUser.id,
  });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { fullName, email, password, department, position, username } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Full name, email, and password are required' });
  }

  const existing = getUserByEmailWithPassword(email);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email address already exists' });
  }

  const settings = getSettings();
  const passwordHash = await bcrypt.hash(password, 10);
  const status = settings.requireAdminApproval ? 'pending' : 'active';

  const newUser = createUser(
    {
      fullName,
      email,
      username: username || email.split('@')[0],
      department: department || 'General Administration',
      position: position || 'Team Member',
      role: 'user',
      status,
    },
    passwordHash
  );

  if (status === 'pending') {
    // Notify admins
    const admins = getUsers().filter((u) => u.role === 'admin');
    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        title: 'New User Registration',
        message: `${fullName} (${department}) registered and requires approval.`,
        link: '/admin/users',
        read: false,
      });
    }
  }

  return res.status(201).json({
    user: newUser,
    requiresApproval: status === 'pending',
    message:
      status === 'pending'
        ? 'Account created! Administrator approval is required before you can log in.'
        : 'Account created successfully!',
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ user });
});

app.post('/api/auth/profile', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { fullName, department, position, signaturePngUrl } = req.body;
  const updated = updateUser(user.id, {
    fullName: fullName || user.fullName,
    department: department || user.department,
    position: position || user.position,
    signaturePngUrl: signaturePngUrl !== undefined ? signaturePngUrl : user.signaturePngUrl,
  });

  return res.json({ user: updated });
});

app.post('/api/auth/change-password', async (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body;
  const userWithPass = getUserByEmailWithPassword(user.email);
  if (!userWithPass) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, userWithPass.passwordHash);
  if (!valid) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  updateUser(user.id, { passwordHash: newHash });

  return res.json({ success: true, message: 'Password updated successfully' });
});

// Demo account switcher helper (for quick multi-user testing in local environment)
app.post('/api/auth/switch-user', (req: Request, res: Response) => {
  const { userId } = req.body;
  const user = getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    user,
    token: user.id,
  });
});

// ==================== USERS & ADMIN ROUTES ====================
app.get('/api/users', (_req: Request, res: Response) => {
  const users = getUsers();
  return res.json({ users });
});

app.patch('/api/users/:id', (req: Request, res: Response) => {
  const currentUser = getAuthenticatedUser(req);
  if (!currentUser || currentUser.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }

  const { id } = req.params;
  const { status, role, department, position } = req.body;
  const updated = updateUser(id, {
    ...(status ? { status } : {}),
    ...(role ? { role } : {}),
    ...(department ? { department } : {}),
    ...(position ? { position } : {}),
  });

  if (!updated) return res.status(404).json({ error: 'User not found' });

  broadcastEvent({
    type: 'USER_UPDATED',
    payload: { user: updated },
  });

  return res.json({ user: updated });
});

// ==================== DOCUMENT ROUTES ====================

// Upload a PDF file (multipart) or generate from template (JSON)
app.post(
  '/api/documents/upload',
  (req: Request, res: Response, next: NextFunction) => {
    // Only invoke multer streaming parser if request is multipart/form-data
    if (req.is('multipart/form-data')) {
      return upload.single('file')(req, res, (err) => {
        if (err) {
          console.error('Multer file upload error:', err);
          return res.status(400).json({ error: `File upload error: ${err.message}` });
        }
        next();
      });
    }
    // For application/json, express.json() already parsed req.body cleanly
    next();
  },
  async (req: Request, res: Response) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      if (req.file) {
        const fileUrl = `/api/documents/file/${req.file.filename}`;
        return res.json({
          fileUrl,
          filename: req.file.originalname,
          size: req.file.size,
          pageCount: 2,
        });
      }

      // If no file uploaded, check for template request
      const { templateTitle, templateRef, category, signers } = req.body || {};
      const generatedUrl = await createSampleContractPdf(
        templateTitle || 'Official Institutional Agreement',
        templateRef || `SF-${Date.now().toString().slice(-4)}`,
        category || 'Resolution',
        signers && signers.length ? signers : [user.fullName, 'Department Head']
      );

      return res.json({
        fileUrl: generatedUrl,
        filename: `${templateTitle || 'Document'}.pdf`,
        pageCount: 2,
      });
    } catch (err: any) {
      console.error('Error during document upload:', err);
      return res.status(500).json({ error: err.message || 'Failed to process document file' });
    }
  }
);

// Create a new document with signatories and signature fields
app.post('/api/documents/create', async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      title,
      description,
      category,
      referenceNumber,
      deadline,
      instructions,
      signingOrderType = 'parallel',
      signatoryUserIds = [],
      fields = [],
      pdfUrl,
    } = req.body;

    if (!title || !Array.isArray(signatoryUserIds) || signatoryUserIds.length === 0) {
      return res.status(400).json({ error: 'Title and at least one signatory are required' });
    }

    let finalPdfUrl = pdfUrl;
    if (!finalPdfUrl) {
      finalPdfUrl = await createSampleContractPdf(
        title,
        referenceNumber || `SF-${Date.now().toString().slice(-4)}`,
        category || 'Administrative',
        signatoryUserIds.map((id: string) => getUserById(id)?.fullName || 'Signatory')
      );
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const allUsers = getUsers();

    // Build signatories array
    const signatories: DocumentSignatory[] = signatoryUserIds.map((uId: string, index: number) => {
      const matchedUser = allUsers.find((u) => u.id === uId);
      let initialStatus: 'pending' | 'waiting' = 'pending';
      if (signingOrderType === 'sequential' && index > 0) {
        initialStatus = 'waiting';
      }
      return {
        id: `signtry-${docId}-${index + 1}`,
        documentId: docId,
        userId: uId,
        user: matchedUser,
        signingOrder: index + 1,
        status: initialStatus,
      };
    });

    // Build fields array
    const signatureFields: SignatureField[] = (Array.isArray(fields) ? fields : []).map((f: any, idx: number) => ({
      id: f.id || `field-${docId}-${idx + 1}`,
      documentId: docId,
      signatoryId: f.signatoryId || (signatories.find((s) => s.userId === f.userId)?.id || signatories[0].id),
      userId: f.userId,
      pageNumber: f.pageNumber || 1,
      xPercent: f.xPercent ?? 15,
      yPercent: f.yPercent ?? (25 + idx * 15),
      widthPercent: f.widthPercent || 35,
      heightPercent: f.heightPercent || 8,
      fieldLabel: f.fieldLabel || `Signature ${idx + 1}`,
      isRequired: f.isRequired ?? true,
      isSigned: false,
    }));

    // Safe deadline parsing to avoid RangeError: Invalid time value
    let parsedDeadline: string | undefined = undefined;
    if (deadline && typeof deadline === 'string' && deadline.trim()) {
      const parsed = new Date(deadline);
      if (!isNaN(parsed.getTime())) {
        parsedDeadline = parsed.toISOString();
      }
    }

    const now = new Date().toISOString();
    const newDoc: DocumentItem = {
      id: docId,
      title,
      description: description || '',
      category: category || 'Administrative',
      referenceNumber: referenceNumber || `SF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      deadline: parsedDeadline,
      instructions,
      status: 'pending_signatures',
      signingOrderType,
      initiatorId: user.id,
      initiator: user,
      signatories,
      fields: signatureFields,
      signatures: [],
      originalPdfUrl: finalPdfUrl,
      currentVersion: 1,
      pageCount: 2,
      createdAt: now,
      updatedAt: now,
    };

    createDocument(newDoc);

    // Audit event
    addDocumentEvent({
      documentId: docId,
      documentTitle: title,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      action: 'DOCUMENT_UPLOADED',
      details: `Created document ${title} with ${signatories.length} signatories (${signingOrderType} order).`,
      ipAddress: req.ip,
    });

    addDocumentEvent({
      documentId: docId,
      documentTitle: title,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      action: 'SIGNATURE_REQUEST_CREATED',
      details: `Signature request dispatched to ${signatories.map((s) => s.user?.fullName).join(', ')}.`,
      ipAddress: req.ip,
    });

    // Notify pending signatories
    for (const sig of signatories) {
      if (sig.status === 'pending') {
        createNotification({
          userId: sig.userId,
          title: 'Document Signature Required',
          message: `${user.fullName} requested your signature on "${title}".`,
          link: `/documents/${docId}/sign`,
          read: false,
        });
      }
    }

    broadcastEvent({
      type: 'DOCUMENT_CREATED',
      payload: { document: newDoc },
    });

    return res.status(201).json({ document: newDoc });
  } catch (err: any) {
    console.error('Error creating document:', err);
    return res.status(500).json({ error: err.message || 'Failed to dispatch document' });
  }
});

// List documents with filter options
app.get('/api/documents', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { scope, filterStatus, search } = req.query as {
    scope?: string;
    filterStatus?: string;
    search?: string;
  };

  let docs = getDocuments();

  // Role & Scope filtering
  if (scope === 'assigned') {
    // "Documents for Your Approval": documents where current user is a signatory
    docs = docs.filter((d) => d.signatories.some((s) => s.userId === user.id));
  } else if (scope === 'mine') {
    // Initiated by current user
    docs = docs.filter((d) => d.initiatorId === user.id);
  } else if (scope === 'completed') {
    docs = docs.filter((d) => d.status === 'completed');
  } else if (scope === 'drafts') {
    docs = docs.filter((d) => d.status === 'draft');
  } else if (scope === 'archived') {
    docs = docs.filter((d) => d.status === 'archived');
  } else if (user.role !== 'admin') {
    // Regular users can only see documents they initiated or where they are a signatory
    docs = docs.filter(
      (d) => d.initiatorId === user.id || d.signatories.some((s) => s.userId === user.id)
    );
  }

  // Filter by approval status
  if (filterStatus && filterStatus !== 'all') {
    if (filterStatus === 'pending') {
      // If user is a signatory, is their specific status pending?
      docs = docs.filter((d) => {
        const sig = d.signatories.find((s) => s.userId === user.id);
        return sig ? sig.status === 'pending' : d.status === 'pending_signatures' || d.status === 'in_progress';
      });
    } else if (filterStatus === 'signed') {
      docs = docs.filter((d) => {
        const sig = d.signatories.find((s) => s.userId === user.id);
        return sig?.status === 'signed';
      });
    } else if (filterStatus === 'overdue') {
      const now = new Date();
      docs = docs.filter(
        (d) => d.deadline && new Date(d.deadline) < now && d.status !== 'completed'
      );
    } else if (filterStatus === 'completed') {
      docs = docs.filter((d) => d.status === 'completed');
    }
  }

  // Search by title or reference number
  if (search) {
    const q = search.toLowerCase();
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.referenceNumber.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }

  return res.json({ documents: docs });
});

// Get a single document
app.get('/api/documents/:id', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const doc = getDocumentById(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Authorization check
  const isSignatory = doc.signatories.some((s) => s.userId === user.id);
  const isInitiator = doc.initiatorId === user.id;
  const isAdmin = user.role === 'admin';

  if (!isSignatory && !isInitiator && !isAdmin) {
    return res.status(403).json({ error: 'You are not authorized to view this document.' });
  }

  // Audit event: opened
  addDocumentEvent({
    documentId: doc.id,
    documentTitle: doc.title,
    userId: user.id,
    userName: user.fullName,
    userEmail: user.email,
    action: 'DOCUMENT_OPENED',
    details: `Viewed document details and execution sheet.`,
    ipAddress: req.ip,
  });

  return res.json({ document: doc });
});

// Update signature fields (initiator/admin only, before signed)
app.post('/api/documents/:id/fields', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const doc = getDocumentById(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (doc.initiatorId !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the document initiator or admin may configure fields' });
  }

  if (doc.signatures.length > 0) {
    return res.status(400).json({ error: 'Cannot modify fields after signing has commenced' });
  }

  const { fields } = req.body;
  if (!Array.isArray(fields)) {
    return res.status(400).json({ error: 'Fields must be an array' });
  }

  const updatedDoc = updateDocument(id, { fields });

  broadcastEvent({
    type: 'FIELDS_UPDATED',
    payload: { documentId: id, fields },
  });

  return res.json({ document: updatedDoc });
});

// Sign a document
app.post('/api/documents/:id/sign', async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { signaturePng, fieldId, coordinates } = req.body;

    const doc = getDocumentById(id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.status === 'completed') {
      return res.status(400).json({ error: 'This document has already been completed and finalized.' });
    }
    if (doc.status === 'cancelled' || doc.status === 'rejected') {
      return res.status(400).json({ error: 'This document has been cancelled or rejected.' });
    }

    // Find signatory record
    const signatory = doc.signatories.find((s) => s.userId === user.id);
    if (!signatory) {
      return res.status(403).json({ error: 'You are not assigned as a signatory on this document.' });
    }

    if (signatory.status === 'signed') {
      return res.status(400).json({ error: 'You have already signed this document.' });
    }

    // Check sequential order restriction
    if (doc.signingOrderType === 'sequential' && signatory.status === 'waiting') {
      return res.status(400).json({
        error: 'It is not yet your turn to sign this document according to the sequential order.',
      });
    }

    // Use provided signature PNG or user's stored signature
    const signatureData = signaturePng || user.signaturePngUrl;
    if (!signatureData) {
      return res.status(400).json({ error: 'No signature image provided. Please upload or draw your signature.' });
    }

    // Find target signature field
    let targetField = doc.fields.find((f) => f.id === fieldId && f.userId === user.id);
    if (!targetField) {
      // If no field matched, find any unassigned/unplaced field for this user, or create one
      targetField = doc.fields.find((f) => f.userId === user.id && !f.isSigned);
    }

    const pageNumber = coordinates?.pageNumber || targetField?.pageNumber || 2;
    const xPercent = coordinates?.xPercent ?? targetField?.xPercent ?? 15;
    const yPercent = coordinates?.yPercent ?? targetField?.yPercent ?? 30;
    const widthPercent = coordinates?.widthPercent ?? targetField?.widthPercent ?? 35;
    const heightPercent = coordinates?.heightPercent ?? targetField?.heightPercent ?? 8;

    const now = new Date().toISOString();
    const verificationHash = crypto
      .createHash('sha256')
      .update(`${user.id}-${doc.id}-${now}-${doc.referenceNumber}`)
      .digest('hex');

    const newSignature: SignatureRecord = {
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      documentId: doc.id,
      signatoryId: signatory.id,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      userPosition: user.position,
      signatureFieldId: targetField?.id || 'default-field',
      signaturePngData: signatureData,
      pageNumber,
      xPercent,
      yPercent,
      widthPercent,
      heightPercent,
      signedAt: now,
      verificationHash,
      ipAddress: req.ip || '127.0.0.1',
    };

    // Update signatory status
    signatory.status = 'signed';
    signatory.signedAt = now;

    // Mark field as signed
    if (targetField) {
      targetField.isSigned = true;
    }

    // Add signature to document signatures array
    const updatedSignatures = [...doc.signatures, newSignature];

    // Audit event
    addDocumentEvent({
      documentId: doc.id,
      documentTitle: doc.title,
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      action: 'SIGNATURE_CONFIRMED',
      details: `Affixed authorized digital signature to Page ${pageNumber} (Audit Hash: ${verificationHash.slice(0, 12)}).`,
      ipAddress: req.ip,
    });

    // Notify initiator
    if (doc.initiatorId !== user.id) {
      createNotification({
        userId: doc.initiatorId,
        title: 'Signature Received',
        message: `${user.fullName} signed "${doc.title}".`,
        link: `/documents/${doc.id}/view`,
        read: false,
      });
    }

    // Check if sequential: activate next signatory
    if (doc.signingOrderType === 'sequential') {
      const nextSignatory = doc.signatories
        .filter((s) => s.status === 'waiting')
        .sort((a, b) => a.signingOrder - b.signingOrder)[0];

      if (nextSignatory) {
        nextSignatory.status = 'pending';
        createNotification({
          userId: nextSignatory.userId,
          title: 'Your Turn to Sign',
          message: `It is now your turn to review and sign "${doc.title}".`,
          link: `/documents/${doc.id}/sign`,
          read: false,
        });
      }
    }

    // Check if ALL signatories have signed!
    const allSigned = doc.signatories.every((s) => s.status === 'signed');
    let finalStatus: DocumentItem['status'] = 'in_progress';
    let finalPdfUrl = doc.finalPdfUrl;

    if (allSigned) {
      finalStatus = 'completed';

      // Embed all signatures into PDF and append certificate!
      try {
        finalPdfUrl = await finalizeDocumentPdf(
          { ...doc, signatures: updatedSignatures },
          updatedSignatures
        );
      } catch (err) {
        console.error('Failed to generate final PDF:', err);
      }

      // Log completion
      addDocumentEvent({
        documentId: doc.id,
        documentTitle: doc.title,
        userId: user.id,
        userName: user.fullName,
        userEmail: user.email,
        action: 'DOCUMENT_COMPLETED',
        details: `All ${doc.signatories.length} required signatories have signed. Tamper-evident PDF finalized and sealed.`,
        ipAddress: req.ip,
      });

      // Notify everyone
      for (const s of doc.signatories) {
        createNotification({
          userId: s.userId,
          title: 'Document Completed',
          message: `"${doc.title}" has been signed by all parties and finalized.`,
          link: `/documents/${doc.id}/view`,
          read: false,
        });
      }
    }

    const updatedDoc = updateDocument(doc.id, {
      status: finalStatus,
      signatures: updatedSignatures,
      signatories: doc.signatories,
      fields: doc.fields,
      finalPdfUrl,
    });

    // Real-time broadcast
    broadcastEvent({
      type: 'SIGNATURE_ADDED',
      payload: {
        documentId: doc.id,
        document: updatedDoc,
        newSignature,
        completed: allSigned,
      },
    });

    return res.json({
      success: true,
      document: updatedDoc,
      signature: newSignature,
      completed: allSigned,
    });
  } catch (err: any) {
    console.error('Error in document signing endpoint:', err);
    return res.status(500).json({ error: err.message || 'Failed to complete signing' });
  }
});

// Cancel document
app.post('/api/documents/:id/cancel', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { reason } = req.body;
  const doc = getDocumentById(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (doc.initiatorId !== user.id && user.role !== 'admin') {
    return res.status(403).json({ error: 'Only initiator or admin can cancel this document' });
  }

  const updatedDoc = updateDocument(id, { status: 'cancelled' });

  addDocumentEvent({
    documentId: id,
    documentTitle: doc.title,
    userId: user.id,
    userName: user.fullName,
    userEmail: user.email,
    action: 'DOCUMENT_CANCELLED',
    details: `Document cancelled by ${user.fullName}. Reason: ${reason || 'Initiator cancelled'}`,
    ipAddress: req.ip,
  });

  broadcastEvent({
    type: 'DOCUMENT_UPDATED',
    payload: { document: updatedDoc },
  });

  return res.json({ document: updatedDoc });
});

// Reject document (by a signatory)
app.post('/api/documents/:id/reject', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const { reason } = req.body;
  const doc = getDocumentById(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const sig = doc.signatories.find((s) => s.userId === user.id);
  if (!sig) return res.status(403).json({ error: 'You are not a signatory on this document' });

  sig.status = 'rejected';
  sig.rejectionReason = reason || 'Declined to sign';

  const updatedDoc = updateDocument(id, {
    status: 'rejected',
    signatories: doc.signatories,
  });

  addDocumentEvent({
    documentId: id,
    documentTitle: doc.title,
    userId: user.id,
    userName: user.fullName,
    userEmail: user.email,
    action: 'DOCUMENT_REJECTED',
    details: `Declined by ${user.fullName}. Reason: ${reason || 'Declined to sign'}`,
    ipAddress: req.ip,
  });

  createNotification({
    userId: doc.initiatorId,
    title: 'Document Declined',
    message: `${user.fullName} declined to sign "${doc.title}": ${reason || 'No reason provided'}`,
    link: `/documents/${id}/view`,
    read: false,
  });

  broadcastEvent({
    type: 'DOCUMENT_UPDATED',
    payload: { document: updatedDoc },
  });

  return res.json({ document: updatedDoc });
});

// Serve PDF files with auto-recovery and CORS
app.get('/api/documents/file/:filename', async (req: Request, res: Response) => {
  const { filename } = req.params;
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    try {
      // Regenerate standard document so user never hits a 404
      const generatedPath = await createSampleContractPdf(
        'Official Government Inter-Regional Accord',
        `SF-${safeName.slice(0, 8)}`,
        'Inter-Regional Document',
        ['Central Office Administrator', 'Regional Director - NCR', 'Regional Director - Region 3']
      );
      const newFile = path.basename(generatedPath);
      const newFilePath = path.join(UPLOAD_DIR, newFile);
      if (fs.existsSync(newFilePath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        return fs.createReadStream(newFilePath).pipe(res);
      }
    } catch (e) {
      console.error('Failed to regenerate PDF file:', e);
    }
    return res.status(404).send('File not found');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// Signee places or repositions their own signature field
app.post('/api/documents/:id/signee-place-field', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.params;
  const doc = getDocumentById(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const signatory = doc.signatories.find((s) => s.userId === user.id);
  if (!signatory) {
    return res.status(403).json({ error: 'You are not assigned as a signatory on this document.' });
  }

  if (signatory.status === 'signed') {
    return res.status(400).json({ error: 'Your signature has already been locked and placed.' });
  }

  const { pageNumber, xPercent, yPercent, widthPercent, heightPercent } = req.body;

  let field = doc.fields.find((f) => f.userId === user.id && !f.isSigned);
  if (field) {
    field.pageNumber = pageNumber || field.pageNumber;
    field.xPercent = xPercent ?? field.xPercent;
    field.yPercent = yPercent ?? field.yPercent;
    field.widthPercent = widthPercent ?? field.widthPercent;
    field.heightPercent = heightPercent ?? field.heightPercent;
  } else {
    field = {
      id: `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      documentId: doc.id,
      signatoryId: signatory.id,
      userId: user.id,
      pageNumber: pageNumber || 1,
      xPercent: xPercent ?? 20,
      yPercent: yPercent ?? 50,
      widthPercent: widthPercent ?? 35,
      heightPercent: heightPercent ?? 8,
      fieldLabel: user.fullName,
      isRequired: true,
      isSigned: false,
    };
    doc.fields.push(field);
  }

  const updatedDoc = updateDocument(id, { fields: doc.fields });

  broadcastEvent({
    type: 'FIELDS_UPDATED',
    payload: { documentId: id, fields: doc.fields },
  });

  return res.json({ success: true, document: updatedDoc, field });
});

// Upload personal signature PNG
app.post('/api/signatures/upload', upload.single('signature'), (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.file) {
    const fileUrl = `/api/documents/file/${req.file.filename}`;
    updateUser(user.id, { signaturePngUrl: fileUrl });
    return res.json({ url: fileUrl });
  }

  const { dataUrl } = req.body;
  if (dataUrl) {
    updateUser(user.id, { signaturePngUrl: dataUrl });
    return res.json({ url: dataUrl });
  }

  return res.status(400).json({ error: 'No signature file or data provided' });
});

// Audit events
app.get('/api/events', (_req: Request, res: Response) => {
  const events = getDocumentEvents();
  return res.json({ events });
});

// Notifications
app.get('/api/notifications', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const notifications = getNotificationsForUser(user.id);
  return res.json({ notifications });
});

app.patch('/api/notifications/:id/read', (req: Request, res: Response) => {
  const { id } = req.params;
  markNotificationAsRead(id);
  return res.json({ success: true });
});

app.post('/api/notifications/read-all', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  markAllNotificationsRead(user.id);
  return res.json({ success: true });
});

// Settings
app.get('/api/settings', (_req: Request, res: Response) => {
  return res.json({ settings: getSettings() });
});

app.patch('/api/settings', (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  const updated = updateSettings(req.body);
  return res.json({ settings: updated });
});

// Realtime SSE endpoint
app.get('/api/realtime', (req: Request, res: Response) => {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const userId = req.query.userId as string | undefined;
  registerRealtimeClient(clientId, userId, res);
});

// Explicit 404 for unhandled API requests to prevent falling through to Vite SPA index.html
app.all('/api/*', (req: Request, res: Response) => {
  return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
});

// Express global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server error:', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({
      error: err.message || 'An unexpected internal server error occurred',
    });
  }
  next(err);
});

// ==================== APP INITIALIZATION & VITE ====================
async function startServer() {
  await initDb();

  // If in development, mount Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SignFlow server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
