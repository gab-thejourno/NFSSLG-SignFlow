import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type {
  User,
  DocumentItem,
  DocumentEvent,
  AppNotification,
  OrganizationSettings,
  SignatureRecord,
  SignatureField,
  DocumentSignatory,
} from '../src/types';
import { createSampleContractPdf, finalizeDocumentPdf, ensureUploadDir } from './pdfService';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface DatabaseSchema {
  users: (User & { passwordHash: string })[];
  documents: DocumentItem[];
  events: DocumentEvent[];
  notifications: AppNotification[];
  settings: OrganizationSettings;
}

// Generate realistic SVG-based transparent signature PNGs
function generateDemoSignaturePng(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">
    <path d="M 20 58 Q 50 18 80 50 T 130 42 Q 160 22 190 62 T 250 38 Q 270 68 280 52" fill="none" stroke="#0f2942" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="25" y="84" font-family="'Brush Script MT', 'Great Vibes', cursive, sans-serif" font-size="26" font-style="italic" fill="#14365d">${name}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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

let db: DatabaseSchema = {
  users: [],
  documents: [],
  events: [],
  notifications: [],
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

function saveDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function normalizeCategory(rawCat?: string): string {
  if (!rawCat || !rawCat.trim()) return 'Resolution';
  const trimmed = rawCat.trim();
  const c = trimmed.toLowerCase();
  if (c === 'resolution' || c.includes('resol') || c.includes('accord') || c.includes('agreement') || c.includes('charter')) {
    return 'Resolution';
  }
  if (c === 'memorandum' || c.includes('memo') || c.includes('protocol') || c.includes('guideline') || c.includes('policy')) {
    return 'Memorandum';
  }
  if (c === 'advisories' || c.includes('advis') || c.includes('notice') || c.includes('bulletin')) {
    return 'Advisories';
  }
  if (c === 'letters' || c.includes('letter') || c.includes('endorse') || c.includes('commun')) {
    return 'Letters';
  }
  if (c === 'others') {
    return 'Others';
  }
  // Custom user-typed category (e.g. "Special Order", "Executive Order", "Certificate", "Activity Proposal", etc.)
  return trimmed;
}

export async function initDb() {
  ensureUploadDir();
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const sharedPasswordHash = await bcrypt.hash('adminpassword', 10);
  const now = new Date().toISOString();

  // Central Office Account (nfsslg-yfd) - Youth Formation Division
  const centralOfficeUser: User & { passwordHash: string } = {
    id: 'usr-centraloffice',
    email: 'centraloffice@signflow.gov.ph',
    passwordHash: sharedPasswordHash,
    fullName: 'Central Office - Youth Formation Division (YFD)',
    username: 'nfsslg-yfd',
    department: 'National Federation of SSLG Central Office (YFD)',
    position: 'Central Office Administrator',
    role: 'admin',
    status: 'active',
    signaturePngUrl: generateDemoSignaturePng('Central Office YFD'),
    createdAt: now,
    updatedAt: now,
  };

  // Build the 18 regional accounts (nfsslg-r1 .. nfsslg-r13, nfsslg-ncr, nfsslg-car, nfsslg-nir, nfsslg-barmm)
  const regionalUsers: (User & { passwordHash: string })[] = REGIONAL_ACCOUNTS_DEF.map((reg) => ({
    id: `usr-${reg.code}`,
    email: `${reg.code}@signflow.gov.ph`,
    passwordHash: sharedPasswordHash,
    fullName: `${reg.name} (${reg.region})`,
    username: reg.username,
    department: `Regional Federation of SSLG - ${reg.label} (${reg.region})`,
    position: 'RFSSLG President',
    role: 'user' as const,
    status: 'active' as const,
    signaturePngUrl: generateDemoSignaturePng(reg.name),
    createdAt: now,
    updatedAt: now,
  }));

  // If database file exists and is populated, load it and run migration
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
        db = parsed;
        console.log(`Loaded SignFlow database from ${DB_FILE}. Running NFSSLG migration...`);

        // Migrate settings
        db.settings.organizationName = 'National Federation of SSLG';
        db.settings.organizationEmail = 'nfsslg@signflow.gov.ph';

        // 1. Completely remove National President account (usr-admin / admin)
        db.users = db.users.filter(
          (u) =>
            u.id !== 'usr-admin' &&
            u.username !== 'admin' &&
            !u.fullName?.toLowerCase().includes('national president')
        );

        // 2. Ensure Central Office (nfsslg-yfd) exists and has the new username
        const centralInDb = db.users.find(
          (u) =>
            u.id === 'usr-centraloffice' ||
            u.username === 'centraloffice' ||
            u.username === 'nfsslg-yfd' ||
            u.email === 'centraloffice@signflow.gov.ph'
        );
        if (centralInDb) {
          centralInDb.id = 'usr-centraloffice';
          centralInDb.username = 'nfsslg-yfd';
          centralInDb.fullName = 'Central Office - Youth Formation Division (YFD)';
          centralInDb.position = 'Central Office Administrator';
          centralInDb.department = 'National Federation of SSLG Central Office (YFD)';
          centralInDb.email = 'centraloffice@signflow.gov.ph';
          centralInDb.role = 'admin';
        } else {
          db.users.unshift(centralOfficeUser);
        }

        // 3. Migrate all regional users to new usernames (nfsslg-region format)
        for (const reg of REGIONAL_ACCOUNTS_DEF) {
          const userInDb = db.users.find(
            (u) =>
              u.id === `usr-${reg.code}` ||
              u.username === reg.code ||
              u.username === reg.username ||
              u.email === `${reg.code}@signflow.gov.ph`
          );

          if (userInDb) {
            userInDb.username = reg.username; // e.g. nfsslg-r1, nfsslg-ncr, nfsslg-nir, nfsslg-r11
            userInDb.fullName = `${reg.name} (${reg.region})`;
            userInDb.position = 'RFSSLG President';
            userInDb.department = `Regional Federation of SSLG - ${reg.label} (${reg.region})`;
            userInDb.email = `${reg.code}@signflow.gov.ph`;
          } else {
            const newRegUser: User & { passwordHash: string } = {
              id: `usr-${reg.code}`,
              email: `${reg.code}@signflow.gov.ph`,
              passwordHash: sharedPasswordHash,
              fullName: `${reg.name} (${reg.region})`,
              username: reg.username,
              department: `Regional Federation of SSLG - ${reg.label} (${reg.region})`,
              position: 'RFSSLG President',
              role: 'user',
              status: 'active',
              signaturePngUrl: generateDemoSignaturePng(reg.name),
              createdAt: now,
              updatedAt: now,
            };
            db.users.push(newRegUser);
          }
        }

        // 4. Migrate categories & initiator/signatory references on existing documents
        if (Array.isArray(db.documents)) {
          for (const doc of db.documents) {
            doc.category = normalizeCategory(doc.category);

            // If initiator was National President, reassign to Central Office (YFD)
            if (doc.initiatorId === 'usr-admin') {
              doc.initiatorId = 'usr-centraloffice';
              const co = db.users.find((u) => u.id === 'usr-centraloffice');
              if (co) {
                doc.initiator = { ...co, passwordHash: undefined } as any;
              }
            }

            if (doc.signatories) {
              // Remove any signatory that was usr-admin
              doc.signatories = doc.signatories.filter((s) => s.userId !== 'usr-admin');
              for (const sig of doc.signatories) {
                const matchedUser = db.users.find((u) => u.id === sig.userId);
                if (matchedUser && sig.user) {
                  sig.user.fullName = matchedUser.fullName;
                  sig.user.position = matchedUser.position;
                  sig.user.department = matchedUser.department;
                  sig.user.username = matchedUser.username;
                }
              }
            }
          }
        }

        saveDb();
        console.log(`NFSSLG migration completed: ${db.users.length} users, ${db.documents.length} documents.`);
        return;
      }
    } catch (e) {
      console.warn('Could not parse existing db.json, seeding new database...', e);
    }
  }

  console.log('Initializing SignFlow database for National Federation of SSLG (Central Office YFD & RFSSLG Presidents)...');

  db.users = [centralOfficeUser, ...regionalUsers];

  // Generate official NFSSLG sample documents
  const pdf1 = await createSampleContractPdf(
    'National SSLG Resolution on Learner Rights & Regional Campus Governance Protocols',
    'NFSSLG-2026-RES-001',
    'Resolution',
    ['RFSSLG President - NCR', 'RFSSLG President - Region 3', 'RFSSLG President - Region 4A']
  );

  const pdf2 = await createSampleContractPdf(
    'Joint Memorandum on Nationwide SSLG Leadership Summit & Student Action Projects',
    'NFSSLG-2026-MEMO-002',
    'Memorandum',
    ['RFSSLG President - Region 7', 'RFSSLG President - Region 11', 'RFSSLG President - BARMM', 'RFSSLG President - CAR']
  );

  const pdf3 = await createSampleContractPdf(
    'Inter-Regional Advisory on DepEd Youth Formation Guidelines & SSLG Election Schedules',
    'NFSSLG-2026-ADV-003',
    'Advisories',
    ['NFSSLG National President', 'RFSSLG President - Region 1', 'RFSSLG President - NIR']
  );

  // Document 1: Assigned to NCR, Region 3, Region 4A, Region 4B (Parallel)
  const doc1Id = 'doc-interreg-01';
  const ncrUser = regionalUsers.find((u) => u.username === 'nfsslg-ncr')!;
  const r3User = regionalUsers.find((u) => u.username === 'nfsslg-r3')!;
  const r4aUser = regionalUsers.find((u) => u.username === 'nfsslg-r4a')!;
  const r4bUser = regionalUsers.find((u) => u.username === 'nfsslg-r4b')!;

  const doc1: DocumentItem = {
    id: doc1Id,
    title: 'National SSLG Resolution on Learner Rights & Regional Campus Governance Protocols',
    description: 'National resolution formalizing learner representation standards and collaborative inter-regional SSLG initiatives.',
    category: 'Resolution',
    referenceNumber: 'NFSSLG-2026-RES-001',
    deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
    instructions: 'RFSSLG Presidents: Please review the execution schedule and affix your official regional signature and digital seal.',
    status: 'pending_signatures',
    signingOrderType: 'parallel',
    initiatorId: centralOfficeUser.id,
    initiator: { ...centralOfficeUser, passwordHash: undefined } as any,
    signatories: [
      {
        id: 'signtry-ncr',
        documentId: doc1Id,
        userId: ncrUser.id,
        user: { ...ncrUser, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
      {
        id: 'signtry-r3',
        documentId: doc1Id,
        userId: r3User.id,
        user: { ...r3User, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
      {
        id: 'signtry-r4a',
        documentId: doc1Id,
        userId: r4aUser.id,
        user: { ...r4aUser, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
      {
        id: 'signtry-r4b',
        documentId: doc1Id,
        userId: r4bUser.id,
        user: { ...r4bUser, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
    ],
    fields: [],
    signatures: [],
    originalPdfUrl: pdf1,
    currentVersion: 1,
    pageCount: 2,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  };

  // Document 2: Assigned to Region 7, Region 11, BARMM, CAR
  const r7User = regionalUsers.find((u) => u.username === 'nfsslg-r7')!;
  const r11User = regionalUsers.find((u) => u.username === 'nfsslg-r11')!;
  const barmmUser = regionalUsers.find((u) => u.username === 'nfsslg-barmm')!;
  const carUser = regionalUsers.find((u) => u.username === 'nfsslg-car')!;

  const doc2Id = 'doc-interreg-02';
  const doc2: DocumentItem = {
    id: doc2Id,
    title: 'Joint Memorandum on Nationwide SSLG Leadership Summit & Student Action Projects',
    description: 'Memorandum of agreement coordinating regional chapters for student congress events, workshops, and civic action drives.',
    category: 'Memorandum',
    referenceNumber: 'NFSSLG-2026-MEMO-002',
    deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
    instructions: 'Each regional RFSSLG President may place and reposition their verified digital signature on Page 2 using the "+ Add Signature Here" tool.',
    status: 'pending_signatures',
    signingOrderType: 'parallel',
    initiatorId: centralOfficeUser.id,
    initiator: { ...centralOfficeUser, passwordHash: undefined } as any,
    signatories: [
      {
        id: 'signtry-r7',
        documentId: doc2Id,
        userId: r7User.id,
        user: { ...r7User, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
      {
        id: 'signtry-r11',
        documentId: doc2Id,
        userId: r11User.id,
        user: { ...r11User, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
      {
        id: 'signtry-barmm',
        documentId: doc2Id,
        userId: barmmUser.id,
        user: { ...barmmUser, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
      {
        id: 'signtry-car',
        documentId: doc2Id,
        userId: carUser.id,
        user: { ...carUser, passwordHash: undefined } as any,
        signingOrder: 1,
        status: 'pending',
      },
    ],
    fields: [],
    signatures: [],
    originalPdfUrl: pdf2,
    currentVersion: 1,
    pageCount: 2,
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
  };

  db.documents = [doc1, doc2];

  // Seed events
  db.events = [
    {
      id: 'evt-001',
      documentId: doc1Id,
      documentTitle: doc1.title,
      userId: centralOfficeUser.id,
      userName: centralOfficeUser.fullName,
      userEmail: centralOfficeUser.email,
      action: 'DOCUMENT_UPLOADED',
      details: 'Dispatched NFSSLG resolution package NFSSLG-2026-RES-001.',
      timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
      ipAddress: '127.0.0.1',
    },
    {
      id: 'evt-002',
      documentId: doc2Id,
      documentTitle: doc2.title,
      userId: centralOfficeUser.id,
      userName: centralOfficeUser.fullName,
      userEmail: centralOfficeUser.email,
      action: 'DOCUMENT_UPLOADED',
      details: 'Dispatched NFSSLG memorandum package NFSSLG-2026-MEMO-002.',
      timestamp: new Date(Date.now() - 3600000 * 8).toISOString(),
      ipAddress: '127.0.0.1',
    },
  ];

  // Seed notifications
  db.notifications = [
    {
      id: 'notif-ncr-01',
      userId: ncrUser.id,
      title: 'Action Required: RFSSLG Signature',
      message: `You have been designated to approve and sign "${doc1.title}".`,
      link: `/documents/${doc1Id}/sign`,
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'notif-barmm-01',
      userId: barmmUser.id,
      title: 'Action Required: RFSSLG Signature',
      message: `You have been designated to approve and sign "${doc2.title}".`,
      link: `/documents/${doc2Id}/sign`,
      read: false,
      createdAt: new Date().toISOString(),
    },
  ];

  saveDb();
  console.log('SignFlow regional database seeded successfully for National Federation of SSLG.');
}

export function getUsers() {
  return db.users.map(({ passwordHash, ...user }) => user);
}

export function getUserById(id: string): User | undefined {
  const user = db.users.find((u) => u.id === id);
  if (!user) return undefined;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function getUserByEmailWithPassword(identifier: string) {
  if (!identifier) return undefined;
  const raw = identifier.trim().toLowerCase();
  const clean = raw.replace(/[\s_\-\.]+/g, '');

  return db.users.find((u) => {
    const uEmail = u.email.toLowerCase();
    const uUsername = u.username.toLowerCase();
    const uCleanUsername = uUsername.replace(/[\s_\-\.]+/g, '');
    const uCleanName = u.fullName.toLowerCase().replace(/[\s_\-\.]+/g, '');

    // Central Office alias matcher
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

    // Direct regional alias matchers
    if (clean === 'nfsslgncr' || clean === 'ncr') return uUsername === 'nfsslg-ncr';
    if (clean === 'nfsslgcar' || clean === 'car') return uUsername === 'nfsslg-car';
    if (clean === 'nfsslgnir' || clean === 'nir') return uUsername === 'nfsslg-nir';
    if (clean === 'nfsslgbarmm' || clean === 'barmm') return uUsername === 'nfsslg-barmm';
    if (clean === 'nfsslgr4a' || clean === 'r4a' || clean === 'region4a' || clean === 'calabarzon') return uUsername === 'nfsslg-r4a';
    if (clean === 'nfsslgr4b' || clean === 'r4b' || clean === 'region4b' || clean === 'mimaropa') return uUsername === 'nfsslg-r4b';

    // Matches e.g. "r11", "region11", "nfsslgr11"
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
      u.fullName.toLowerCase().includes(raw)
    );
  });
}

export function createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>, passwordHash: string): User {
  const now = new Date().toISOString();
  const id = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newUser = {
    ...userData,
    id,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(newUser);
  saveDb();
  const { passwordHash: _, ...safeUser } = newUser;
  return safeUser;
}

export function updateUser(id: string, updates: Partial<User & { passwordHash?: string }>): User | undefined {
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) return undefined;
  db.users[index] = {
    ...db.users[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveDb();
  const { passwordHash, ...safeUser } = db.users[index];
  return safeUser;
}

export function getDocuments(): DocumentItem[] {
  return db.documents;
}

export function getDocumentById(id: string): DocumentItem | undefined {
  return db.documents.find((d) => d.id === id);
}

export function createDocument(doc: DocumentItem): DocumentItem {
  db.documents.unshift(doc);
  saveDb();
  return doc;
}

export function updateDocument(id: string, updates: Partial<DocumentItem>): DocumentItem | undefined {
  const index = db.documents.findIndex((d) => d.id === id);
  if (index === -1) return undefined;
  db.documents[index] = {
    ...db.documents[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveDb();
  return db.documents[index];
}

export function deleteDocument(id: string): boolean {
  const index = db.documents.findIndex((d) => d.id === id);
  if (index === -1) return false;
  db.documents.splice(index, 1);
  saveDb();
  return true;
}

export function addDocumentEvent(event: Omit<DocumentEvent, 'id' | 'timestamp'>): DocumentEvent {
  const newEvent: DocumentEvent = {
    ...event,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  db.events.unshift(newEvent);
  saveDb();
  return newEvent;
}

export function getDocumentEvents(documentId?: string): DocumentEvent[] {
  if (documentId) {
    return db.events.filter((e) => e.documentId === documentId);
  }
  return db.events;
}

export function getNotificationsForUser(userId: string): AppNotification[] {
  return db.notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createNotification(notif: Omit<AppNotification, 'id' | 'createdAt'>): AppNotification {
  const newNotif: AppNotification = {
    ...notif,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(newNotif);
  saveDb();
  return newNotif;
}

export function markNotificationAsRead(id: string): boolean {
  const notif = db.notifications.find((n) => n.id === id);
  if (!notif) return false;
  notif.read = true;
  saveDb();
  return true;
}

export function markAllNotificationsRead(userId: string): boolean {
  db.notifications.forEach((n) => {
    if (n.userId === userId) n.read = true;
  });
  saveDb();
  return true;
}

export function getSettings(): OrganizationSettings {
  return db.settings;
}

export function updateSettings(settings: Partial<OrganizationSettings>): OrganizationSettings {
  db.settings = { ...db.settings, ...settings };
  saveDb();
  return db.settings;
}
