import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileText,
  Users,
  Calendar,
  Check,
  Search,
  ArrowRight,
  ArrowLeft,
  Trash2,
  MoveUp,
  MoveDown,
  Sparkles,
  FileCheck,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type { User } from '../../types';
import { DOCUMENT_CATEGORIES } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiGetUsers, apiUploadPdf, apiCreateDocument } from '../../lib/api';

interface UploadWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (documentId: string) => void;
}

export const UploadWizardModal: React.FC<UploadWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Document File & Metadata
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('res-01');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Resolution');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [deadline, setDeadline] = useState('');
  const [instructions, setInstructions] = useState('');

  // Step 2: Signatories
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  const [selectedSignatories, setSelectedSignatories] = useState<User[]>([]);
  const [signingOrderType, setSigningOrderType] = useState<'parallel' | 'sequential'>('parallel');

  // Loading states
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRegisteredUsers();
      // Auto-generate reference number
      setReferenceNumber(`NFSSLG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
      // Default deadline to 7 days from now
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7);
      setDeadline(defaultDate.toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const loadRegisteredUsers = async () => {
    try {
      const res = await apiGetUsers();
      // Filter out pending and disabled accounts
      const activeUsers = res.users.filter((u) => u.status === 'active');
      setAllUsers(activeUsers);
      // Preselect current user if not admin
      if (user && user.status === 'active') {
        setSelectedSignatories([user]);
      }
    } catch (err) {
      console.error('Failed to load registered users', err);
    }
  };

  const templates = [
    {
      id: 'res-rights',
      name: 'National SSLG Resolution on Learner Rights & Regional Campus Governance Protocols',
      category: 'Resolution',
      desc: 'National resolution formalizing learner representation standards and collaborative inter-regional SSLG initiatives.',
    },
    {
      id: 'memo-summit',
      name: 'Joint Memorandum on Nationwide SSLG Leadership Summit & Student Action Projects',
      category: 'Memorandum',
      desc: 'Memorandum coordinating regional chapters for student congress events, workshops, and civic action drives.',
    },
    {
      id: 'adv-guidelines',
      name: 'Inter-Regional Advisory on DepEd Youth Formation Guidelines & SSLG Election Schedules',
      category: 'Advisories',
      desc: 'Advisory notice on youth formation timelines, election guidelines, and regional council conventions.',
    },
    {
      id: 'let-deped',
      name: 'Official Endorsement Letter to DepEd Central Office & Regional Bureaus',
      category: 'Letters',
      desc: 'Official communication and formal endorsement transmittal on national SSLG policy recommendations.',
    },
  ];

  const handleSelectTemplate = (tmpl: (typeof templates)[0]) => {
    setSelectedTemplate(tmpl.id);
    setTitle(tmpl.name);
    setCategory(tmpl.category);
    setDescription(tmpl.desc);
    setUploadedFile(null);
    setUploadedPdfUrl(null);
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setUploadedFile(file);
        setUploadedPdfUrl(null);
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
        setSelectedTemplate('');
      } else {
        alert('Please upload a PDF document.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setUploadedPdfUrl(null);
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
      setSelectedTemplate('');
    }
  };

  // Signatory selection helpers
  const filteredUsers = allUsers.filter((u) => {
    const q = searchUserQuery.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q) ||
      u.position.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const toggleUserSignatory = (u: User) => {
    if (selectedSignatories.some((s) => s.id === u.id)) {
      setSelectedSignatories(selectedSignatories.filter((s) => s.id !== u.id));
    } else {
      setSelectedSignatories([...selectedSignatories, u]);
    }
  };

  const handleSelectAllFiltered = () => {
    const newToAdd = filteredUsers.filter(
      (fu) => !selectedSignatories.some((su) => su.id === fu.id)
    );
    setSelectedSignatories([...selectedSignatories, ...newToAdd]);
  };

  const handleRemoveSignatory = (id: string) => {
    setSelectedSignatories(selectedSignatories.filter((s) => s.id !== id));
  };

  const handleMoveOrder = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= selectedSignatories.length) return;
    const copy = [...selectedSignatories];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setSelectedSignatories(copy);
  };

  const handleProceedToStep2 = () => {
    if (!title.trim()) {
      setError('Please provide a document title.');
      return;
    }
    if (category === 'Others' && !customCategory.trim()) {
      setError('Please type your custom Category name (e.g. Special Order, Executive Order, Joint Circular, Certificate).');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleProceedToStep3 = () => {
    setError(null);
    setStep(3);
  };

  // Determine effective category (standard or user typed)
  const effectiveCategory = category === 'Others' ? (customCategory.trim() || 'Others') : category;

  // Final submit & document creation
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Step 1: upload file or generate sample PDF
      let pdfUrl = uploadedPdfUrl;
      if (!pdfUrl || uploadedFile) {
        const uploadRes = await apiUploadPdf(
          uploadedFile || undefined,
          !uploadedFile
            ? {
                templateTitle: title,
                templateRef: referenceNumber,
                category: effectiveCategory,
                signers: selectedSignatories.map((s) => s.fullName),
              }
            : undefined
        );
        pdfUrl = uploadRes.fileUrl;
        setUploadedPdfUrl(pdfUrl);
      }

      // Step 2: create signature fields for each signatory
      const fields = selectedSignatories.map((s, index) => ({
        userId: s.id,
        pageNumber: 2, // Default to signature schedule page
        xPercent: 12,
        yPercent: 26 + index * 13,
        widthPercent: 35,
        heightPercent: 8,
        fieldLabel: `${s.fullName} - ${s.position}`,
        isRequired: true,
      }));

      // Step 3: dispatch document request
      const safeDeadline =
        deadline && deadline.trim() && !isNaN(new Date(deadline).getTime())
          ? new Date(deadline).toISOString()
          : undefined;

      const docRes = await apiCreateDocument({
        title,
        description,
        category: effectiveCategory,
        referenceNumber,
        deadline: safeDeadline,
        instructions,
        signingOrderType,
        signatoryUserIds: selectedSignatories.map((s) => s.id),
        fields,
        pdfUrl,
      });

      onSuccess(docRes.document.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create document');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 text-blue-900 rounded-lg shrink-0">
              <Upload className="w-5 h-5 text-blue-800" />
            </div>
            <div className="truncate">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Initiate New Signature Request
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                Upload document, assign signatories, and configure workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-3 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200 bg-white flex items-center justify-between text-xs overflow-x-auto gap-1">
          <div className="flex items-center space-x-1.5 shrink-0">
            <span
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold ${
                step >= 1 ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              1
            </span>
            <span className={`text-[11px] sm:text-xs ${step === 1 ? 'font-bold text-blue-950' : 'text-slate-500'}`}>
              <span className="sm:hidden">Document</span>
              <span className="hidden sm:inline">Document & Metadata</span>
            </span>
          </div>

          <div className="h-0.5 w-6 sm:w-12 bg-slate-200 shrink-0" />

          <div className="flex items-center space-x-1.5 shrink-0">
            <span
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold ${
                step >= 2 ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            <span className={`text-[11px] sm:text-xs ${step === 2 ? 'font-bold text-blue-950' : 'text-slate-500'}`}>
              <span className="sm:hidden">Signatories ({selectedSignatories.length})</span>
              <span className="hidden sm:inline">Select Signatories ({selectedSignatories.length})</span>
            </span>
          </div>

          <div className="h-0.5 w-6 sm:w-12 bg-slate-200 shrink-0" />

          <div className="flex items-center space-x-1.5 shrink-0">
            <span
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold ${
                step >= 3 ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span className={`text-[11px] sm:text-xs ${step === 3 ? 'font-bold text-blue-950' : 'text-slate-500'}`}>
              <span className="sm:hidden">Dispatch</span>
              <span className="hidden sm:inline">Workflow & Dispatch</span>
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* STEP 1: DOCUMENT UPLOAD & DETAILS */}
          {step === 1 && (
            <div className="space-y-5">
              {/* File Upload Box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Document Source (Upload PDF or Pick Institutional Template)
                </label>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-900 rounded-xl p-5 text-center bg-slate-50/50 hover:bg-blue-50/20 transition-all cursor-pointer relative"
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center">
                    <FileText className="w-8 h-8 text-blue-900 mb-2" />
                    {uploadedFile ? (
                      <div className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                        <span>Selected File: {uploadedFile.name}</span>
                        <span className="text-xs text-slate-500">
                          ({(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-slate-800">
                          Drag and drop your PDF here, or click to browse
                        </span>
                        <span className="text-[11px] text-slate-500 mt-0.5">
                          Supports up to 30MB standard official PDF packages
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Template selector pills */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                  <span>Or use an instant organization legal template:</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {templates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        selectedTemplate === tmpl.id
                          ? 'border-blue-900 bg-blue-50/60 ring-1 ring-blue-900 text-blue-950'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold truncate">{tmpl.name}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{tmpl.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Document Metadata Form */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Document Title *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Master Services Agreement"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Category *
                      </label>
                      {category === 'Others' && (
                        <span className="text-[10px] font-bold text-blue-900 bg-blue-100 px-1.5 py-0.2 rounded">
                          Custom Classification
                        </span>
                      )}
                    </div>
                    <select
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        if (e.target.value !== 'Others') {
                          setCustomCategory('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white font-medium"
                    >
                      {DOCUMENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === 'Others' ? 'Others (Type Custom Category...)' : cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Custom Category input field when "Others" is chosen */}
                {category === 'Others' && (
                  <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 border border-blue-200 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-blue-950 uppercase tracking-wider">
                        Type Your Custom Category Name *
                      </label>
                      <span className="text-[10px] text-blue-700 font-medium">
                        Custom Document Classification
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="e.g. Special Order, Executive Order, Joint Circular, Certificate, Activity Proposal..."
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-900 shadow-2xs"
                      autoFocus
                    />

                    {/* Quick suggestion tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500 font-semibold mr-0.5">
                        Quick suggestions:
                      </span>
                      {[
                        'Special Order',
                        'Executive Order',
                        'Joint Circular',
                        'Activity Proposal',
                        'Certificate',
                        'Travel Order',
                        'Financial Report',
                        'Notice of Meeting',
                        'Project Charter',
                      ].map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCustomCategory(item)}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all border ${
                            customCategory === item
                              ? 'bg-blue-900 text-white border-blue-900 shadow-2xs'
                              : 'bg-white text-blue-900 hover:bg-blue-100/80 border-blue-200 hover:border-blue-300'
                          }`}
                        >
                          + {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reference Number (Official Code)
                    </label>
                    <input
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="e.g. SF-2026-0891"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Signing Deadline
                    </label>
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Instructions for Signatories (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Please review Schedule B indemnification clauses prior to affixing signature."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SELECT SIGNATORIES */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Designate Signatories from Organization Directory
                </h3>
                <p className="text-xs text-slate-500">
                  Select all authorized individuals who must review and execute this document.
                </p>
              </div>

              {/* Search & Bulk Select */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    placeholder="Search by name, department, or designation..."
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                >
                  Select All Filtered ({filteredUsers.length})
                </button>
              </div>

              {/* User Selector List */}
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {filteredUsers.map((u) => {
                  const isSelected = selectedSignatories.some((s) => s.id === u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleUserSignatory(u)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-blue-900 border-blue-900 text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{u.fullName}</span>
                            {u.id === user?.id && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1 rounded">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {u.position} • {u.department}
                          </div>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400">{u.email}</span>
                    </div>
                  );
                })}
              </div>

              {/* Selected Signatories Bar */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">
                    Selected Signatories ({selectedSignatories.length}):
                  </span>
                  {selectedSignatories.length > 0 && (
                    <button
                      onClick={() => setSelectedSignatories([])}
                      className="text-[11px] text-rose-600 hover:underline font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selectedSignatories.map((s, idx) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-300 text-slate-800 shadow-xs"
                    >
                      <span className="text-[10px] font-bold text-blue-900">{idx + 1}.</span>
                      <span>{s.fullName}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSignatory(s.id);
                        }}
                        className="text-slate-400 hover:text-rose-600 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: WORKFLOW ORDER & DISPATCH */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  3. Signing Workflow & Execution Order
                </h3>
                <p className="text-xs text-slate-500">
                  Configure whether all parties sign concurrently or in a strict sequential chain.
                </p>
              </div>

              {/* Signing Order Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSigningOrderType('parallel')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    signingOrderType === 'parallel'
                      ? 'border-blue-900 bg-blue-50/60 ring-1 ring-blue-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-blue-950 mb-1 flex items-center justify-between">
                    <span>Parallel Signing</span>
                    {signingOrderType === 'parallel' && (
                      <Check className="w-4 h-4 text-blue-900" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    All signatories receive the document simultaneously and can review and sign in
                    any order.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSigningOrderType('sequential')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    signingOrderType === 'sequential'
                      ? 'border-blue-900 bg-blue-50/60 ring-1 ring-blue-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="text-xs font-bold text-blue-950 mb-1 flex items-center justify-between">
                    <span>Sequential Signing</span>
                    {signingOrderType === 'sequential' && (
                      <Check className="w-4 h-4 text-blue-900" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Signatory 1 must sign before Signatory 2 is notified. Progresses step-by-step in
                    exact sequence.
                  </p>
                </button>
              </div>

              {/* Signatory Order List */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-2">
                <div className="text-xs font-bold text-slate-800 mb-2">
                  {signingOrderType === 'sequential'
                    ? 'Sequential Signing Queue (Reorder with arrows):'
                    : 'Designated Signatories:'}
                </div>

                <div className="space-y-2">
                  {selectedSignatories.map((sig, idx) => (
                    <div
                      key={sig.id}
                      className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between shadow-xs"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-5 h-5 rounded-full bg-blue-900 text-white text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">{sig.fullName}</div>
                          <div className="text-[11px] text-slate-500">
                            {sig.position} • {sig.department}
                          </div>
                        </div>
                      </div>

                      {signingOrderType === 'sequential' && (
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded hover:bg-slate-100"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(idx, 'down')}
                            disabled={idx === selectedSignatories.length - 1}
                            className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded hover:bg-slate-100"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Box */}
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200 text-xs text-blue-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-blue-800" />
                  <span>Ready for Dispatch</span>
                </div>
                <p className="text-[11px] text-blue-900/80">
                  Upon dispatch, each signatory will see this document in their &quot;Documents for Your
                  Approval&quot; workspace. NFSSLG SignFlow will synchronize signatures centrally and seal the
                  final PDF once all parties sign.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as any)}
              className="flex items-center space-x-1.5 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          )}

          {step === 1 && (
            <button
              onClick={handleProceedToStep2}
              className="flex items-center space-x-1.5 px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <span>Continue to Signatories</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleProceedToStep3}
              className="flex items-center space-x-1.5 px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <span>Configure Workflow</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="flex items-center space-x-1.5 px-6 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? (
                <span>Dispatching Document...</span>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Dispatch Signature Request</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
