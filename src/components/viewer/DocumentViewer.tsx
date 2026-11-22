import React, { useState, useEffect, useRef } from 'react';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Lock,
  PenTool,
  Info,
  ExternalLink,
  Sparkles,
  ArrowLeft,
  X,
  FileCheck,
  Users,
  Eye,
  FileText,
  Move,
  Check,
  RotateCcw,
  Stamp,
  Shield,
  Upload,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type {
  DocumentItem,
  SignatureField,
  SignatureRecord,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  apiGetDocument,
  apiSignDocument,
  apiSigneePlaceField,
  subscribeToRealtime,
} from '../../lib/api';
import { processSignatureImageToTransparentPng } from '../../lib/signatureProcessor';
import { SignatureStudioModal } from '../signatures/SignatureStudioModal';

// Setup PDF.js worker safely via local bundled worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  } catch (e) {
    console.warn('PDF.js worker setup note:', e);
  }
}

interface DocumentViewerProps {
  documentId: string;
  onBack: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  documentId,
  onBack,
}) => {
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: 'interactive' (signing canvas), 'native' (embedded browser PDF), or 'split'
  const [viewMode, setViewMode] = useState<'interactive' | 'native' | 'split'>('interactive');

  // PDF Page & Zoom state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(2);
  const [zoomScale, setZoomScale] = useState(1.1); // 110%

  // Signee custom placement state ("* Add signature here")
  const [isPlacingSignHere, setIsPlacingSignHere] = useState(false);
  const [customSignPosition, setCustomSignPosition] = useState<{
    pageNumber: number;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  } | null>(null);

  // Signing dialog state
  const [signingField, setSigningField] = useState<SignatureField | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [processingSigImage, setProcessingSigImage] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [showMobileSignatories, setShowMobileSignatories] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const loadedPdfUrlRef = useRef<string | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);

  // Fetch document details (silent = true avoids unmounting the PDF canvas during live updates)
  const fetchDoc = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      const res = await apiGetDocument(documentId);
      setDoc(res.document);

      // Check if current user already has a pending placement
      const existingField = res.document.fields.find(
        (f) => f.userId === user?.id && !f.isSigned
      );
      if (existingField) {
        setCustomSignPosition({
          pageNumber: existingField.pageNumber,
          xPercent: existingField.xPercent,
          yPercent: existingField.yPercent,
          widthPercent: existingField.widthPercent,
          heightPercent: existingField.heightPercent,
        });
      }
    } catch (err: any) {
      if (!silent) {
        setError(err.message || 'Failed to load document');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadedPdfUrlRef.current = null;
    pdfDocRef.current = null;
    fetchDoc(false);
  }, [documentId]);

  // Real-time synchronization (never unmount canvas on background updates)
  useEffect(() => {
    const unsub = subscribeToRealtime(user?.id, (event) => {
      if (
        event.type === 'SIGNATURE_ADDED' &&
        event.payload?.documentId === documentId
      ) {
        if (event.payload.document) {
          setDoc(event.payload.document);
        } else {
          fetchDoc(true);
        }
        if (event.payload.completed) {
          triggerCelebration();
        }
      } else if (
        event.type === 'FIELDS_UPDATED' &&
        (event.payload?.documentId === documentId || event.payload?.document?.id === documentId)
      ) {
        if (event.payload?.document) {
          setDoc(event.payload.document);
        } else {
          fetchDoc(true);
        }
      } else if (
        event.type === 'DOCUMENT_UPDATED' &&
        (event.payload?.documentId === documentId ||
          event.payload?.document?.id === documentId ||
          event.payload?.new?.id === documentId ||
          event.payload?.old?.id === documentId)
      ) {
        fetchDoc(true);
      }
    });

    return unsub;
  }, [documentId, user?.id]);

  const renderPage = async (pageNumber: number, pdfInstance?: any) => {
    const pdf = pdfInstance || pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    try {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
        renderTaskRef.current = null;
      }

      setPdfLoading(true);
      setPdfRenderError(null);
      const safePage = Math.max(1, Math.min(pageNumber, pdf.numPages || pageNumber));
      const page = await pdf.getPage(safePage);
      const scale = zoomScale * 1.5;
      const viewport = page.getViewport({ scale });

      // Ensure canvas is still mounted before drawing
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      canvasRef.current.width = viewport.width;
      canvasRef.current.height = viewport.height;

      const task = page.render({
        canvasContext: ctx,
        viewport,
      });
      renderTaskRef.current = task;
      await task.promise;
      if (renderTaskRef.current === task) {
        renderTaskRef.current = null;
      }
      setPdfLoading(false);
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        console.warn('Canvas render notice:', e);
        setPdfLoading(false);
      }
    }
  };

  // Load PDF document once per unique originalPdfUrl (with ArrayBuffer fallback)
  useEffect(() => {
    const pdfUrl = doc?.originalPdfUrl;
    if (!pdfUrl) return;

    if (loadedPdfUrlRef.current === pdfUrl && pdfDocRef.current) {
      return;
    }

    let isCancelled = false;
    const loadPdf = async () => {
      try {
        setPdfLoading(true);
        setPdfRenderError(null);

        let pdf: any;
        try {
          const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
          pdf = await loadingTask.promise;
        } catch (primaryErr) {
          // Fallback: fetch raw bytes directly in case CDN range requests fail
          const res = await fetch(pdfUrl, { cache: 'no-store' });
          if (!res.ok) throw primaryErr;
          const bytes = await res.arrayBuffer();
          pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        }

        if (isCancelled) return;
        pdfDocRef.current = pdf;
        loadedPdfUrlRef.current = pdfUrl;
        setTotalPages(pdf.numPages);
        await renderPage(currentPage, pdf);
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('PDF.js document loading notice:', err);
          setPdfRenderError(err?.message || 'Could not render PDF on interactive canvas.');
          setPdfLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [doc?.originalPdfUrl]);

  // Re-render page whenever page, zoom, viewMode, or initial loading state makes the canvas active
  useEffect(() => {
    if (!loading && pdfDocRef.current && (viewMode === 'interactive' || viewMode === 'split')) {
      renderPage(currentPage);
    }
  }, [currentPage, zoomScale, viewMode, loading]);

  const triggerCelebration = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  // Signatory permissions check
  const mySignatoryRecord = doc?.signatories.find((s) => s.userId === user?.id);
  const isDocLocked =
    doc?.status === 'cancelled' ||
    doc?.status === 'rejected' ||
    (doc?.status === 'completed' && (doc?.signatories.length || 0) > 0);
  const hasMyTurnToSign = Boolean(
    doc &&
      user &&
      !isDocLocked &&
      (mySignatoryRecord
        ? mySignatoryRecord.status === 'pending'
        : doc.signatories.length === 0)
  );

  const hasAlreadySigned =
    mySignatoryRecord?.status === 'signed' ||
    Boolean(doc?.signatures.some((s) => s.userId === user?.id));

  // Signee determines where to sign: Click on page
  const handlePageClickPlaceSignature = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hasMyTurnToSign || !doc || !user) return;

    // Check if click target was an interactive button inside the placement badge
    if ((e.target as HTMLElement).closest('.stop-placement-click')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newPosition = {
      pageNumber: currentPage,
      xPercent: Math.max(4, Math.min(x - 16, 62)),
      yPercent: Math.max(4, Math.min(y - 4, 86)),
      widthPercent: 34,
      heightPercent: 9,
    };

    setCustomSignPosition(newPosition);
    setIsPlacingSignHere(false);

    // Save placement on server
    try {
      const res = await apiSigneePlaceField(doc.id, newPosition);
      setDoc(res.document);
    } catch (err: any) {
      console.warn('Placement sync notice:', err);
    }
  };

  // Open confirmation to sign
  const handleOpenSignField = (field: SignatureField) => {
    if (field.userId !== user?.id) {
      alert(`Access Restricted: This signature field is designated exclusively for ${field.fieldLabel}. You cannot sign on behalf of another person.`);
      return;
    }

    if (!hasMyTurnToSign) {
      if (mySignatoryRecord?.status === 'signed') {
        alert('You have already signed this document. Your signature is locked.');
      } else if (doc?.signingOrderType === 'sequential' && mySignatoryRecord?.status === 'waiting') {
        alert('Sequential Signing: Please wait until preceding signatories in the approval chain have signed.');
      }
      return;
    }

    setSigningField(field);
    setSignatureDataUrl(user?.signaturePngUrl || null);
    setConsentChecked(false);
  };

  // Direct upload of PNG, JPG, or WEBP inside signing dialog with automatic white-background removal
  const handleDirectSignatureImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingSigImage(true);
    try {
      const processed = await processSignatureImageToTransparentPng(file);
      setSignatureDataUrl(processed.dataUrl);
    } catch (err: any) {
      alert(err.message || 'Could not process signature image.');
    } finally {
      setProcessingSigImage(false);
      e.target.value = '';
    }
  };

  // Execute signature submission
  const handleSubmitSignature = async () => {
    if (!doc || !signingField || !user) return;
    if (!consentChecked) {
      alert('Please check the legal affirmation checkbox to proceed.');
      return;
    }

    const png = signatureDataUrl || user.signaturePngUrl;
    if (!png) {
      setIsStudioOpen(true);
      return;
    }

    setIsSubmittingSignature(true);
    try {
      const res = await apiSignDocument(doc.id, {
        signaturePng: png,
        fieldId: signingField.id,
        coordinates: customSignPosition
          ? {
              pageNumber: customSignPosition.pageNumber,
              xPercent: customSignPosition.xPercent,
              yPercent: customSignPosition.yPercent,
              widthPercent: customSignPosition.widthPercent,
              heightPercent: customSignPosition.heightPercent,
            }
          : undefined,
      });

      setDoc(res.document);
      setSigningField(null);
      setIsPlacingSignHere(false);
      setCustomSignPosition(null);

      if (res.completed) {
        triggerCelebration();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit signature');
    } finally {
      setIsSubmittingSignature(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-slate-500">
        <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading document and verified signatures...</p>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 mb-1">Unable to Load Document</h3>
        <p className="text-sm text-slate-600 mb-4">{error || 'Document not found'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
        >
          Return to Documents
        </button>
      </div>
    );
  }

  const signedCount = doc.signatories.filter((s) => s.status === 'signed').length;
  const totalCount = doc.signatories.length;
  const progressPercent = Math.round((signedCount / (totalCount || 1)) * 100);

  // Active file URL (cache-busted when finalPdfUrl updates after merge)
  const rawActiveUrl = doc.finalPdfUrl || doc.originalPdfUrl;
  const activeFileUrl = rawActiveUrl.startsWith('http')
    ? `${rawActiveUrl}${rawActiveUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(doc.updatedAt || String(doc.signatures.length))}`
    : rawActiveUrl;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-100 overflow-hidden">
      {/* Top Document Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 shadow-xs z-20 shrink-0">
        <div className="flex items-center justify-between w-full md:w-auto space-x-2 sm:space-x-3">
          <div className="flex items-center space-x-2 sm:space-x-3 overflow-hidden">
            <button
              onClick={onBack}
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors flex items-center space-x-1 text-xs font-semibold shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="h-5 w-px bg-slate-200 hidden sm:block shrink-0" />

            <div className="truncate">
              <div className="flex items-center space-x-1.5 truncate">
                <h1 className="text-xs sm:text-sm md:text-base font-extrabold text-slate-900 truncate max-w-[170px] sm:max-w-xs md:max-w-md">
                  {doc.title}
                </h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                  {doc.referenceNumber}
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 flex items-center space-x-1.5 mt-0.5 truncate">
                <span className="truncate">{doc.category}</span>
                <span>•</span>
                <span className="font-semibold text-blue-900 truncate">
                  {signedCount}/{totalCount} Signed
                </span>
              </p>
            </div>
          </div>

          {/* Mobile Signatories Badge Button */}
          <button
            onClick={() => setShowMobileSignatories(true)}
            className="lg:hidden flex items-center space-x-1 px-2 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-xs font-bold shrink-0"
            title="View Signatories"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{signedCount}/{totalCount}</span>
          </button>
        </div>

        {/* View Mode Switcher & Primary Action Buttons */}
        <div className="flex items-center space-x-2 w-full md:w-auto justify-between md:justify-end overflow-x-auto pb-0.5 md:pb-0">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 shrink-0">
            <button
              onClick={() => setViewMode('interactive')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-colors flex items-center space-x-1 sm:space-x-1.5 text-xs ${
                viewMode === 'interactive'
                  ? 'bg-white text-blue-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Sheet</span>
            </button>

            <button
              onClick={() => setViewMode('native')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg transition-colors flex items-center space-x-1 sm:space-x-1.5 text-xs ${
                viewMode === 'native'
                  ? 'bg-white text-blue-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Native PDF</span>
            </button>

            <button
              onClick={() => setViewMode('split')}
              className={`hidden lg:flex px-3 py-1 rounded-lg transition-colors items-center space-x-1.5 text-xs ${
                viewMode === 'split'
                  ? 'bg-white text-blue-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Split</span>
            </button>
          </div>

          {/* Open Raw PDF in New Tab */}
          <a
            href={activeFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors shrink-0"
            title="Open raw PDF file in new browser window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open PDF</span>
          </a>

          {/* The Key Signee Action: "* Add Signature Here" Button */}
          {hasMyTurnToSign && (
            <button
              onClick={() => {
                setViewMode('interactive');
                setIsPlacingSignHere(true);
                if (!customSignPosition) {
                  setCustomSignPosition({
                    pageNumber: currentPage,
                    xPercent: 20,
                    yPercent: 65,
                    widthPercent: 34,
                    heightPercent: 9,
                  });
                }
              }}
              className={`flex items-center space-x-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs font-bold shadow-md transition-all shrink-0 ${
                isPlacingSignHere
                  ? 'bg-amber-500 text-white animate-pulse'
                  : 'bg-blue-900 hover:bg-blue-950 text-white ring-2 ring-blue-700/30'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="whitespace-nowrap">* Add Signature Here</span>
            </button>
          )}

          {(doc.status === 'completed' || doc.signatures.length > 0) && (
            <a
              href={activeFileUrl}
              download={`${doc.referenceNumber}_Signed.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{doc.status === 'completed' ? 'Download Final PDF' : 'Download Merged PDF'}</span>
            </a>
          )}
        </div>
      </div>

      {/* Floating Instructions Banner when "* Add Signature Here" is active */}
      {isPlacingSignHere && hasMyTurnToSign && (
        <div className="bg-amber-100 border-b border-amber-300 px-6 py-2.5 flex items-center justify-between text-xs text-amber-950 shadow-xs z-20 shrink-0">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-semibold">
              <strong>Click anywhere on the document below</strong> to choose your signature location. You can move it or click &quot;Confirm &amp; Sign Here&quot; when ready.
            </span>
          </div>
          <button
            onClick={() => setIsPlacingSignHere(false)}
            className="text-xs text-amber-800 hover:underline font-bold px-2 py-0.5 rounded hover:bg-amber-200"
          >
            Done Repositioning
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Signatories & Progress */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col hidden lg:flex shrink-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Users className="w-4 h-4 text-blue-900" />
                <span>Signatories ({signedCount}/{totalCount})</span>
              </div>
              <span className="text-[11px] font-bold text-blue-900">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all duration-500 ${
                  doc.status === 'completed' ? 'bg-emerald-600' : 'bg-blue-900'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {doc.signatories.map((sig, idx) => {
              const isMe = sig.userId === user?.id;
              const hasSigned = sig.status === 'signed';
              const isPending = sig.status === 'pending';

              return (
                <div
                  key={sig.id}
                  className={`p-3 rounded-xl border transition-all ${
                    hasSigned
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : isPending
                      ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-900/10'
                      : 'bg-slate-50/70 border-slate-200 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <span>{sig.user?.fullName}</span>
                          {isMe && (
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded font-normal">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{sig.user?.position}</div>
                      </div>
                    </div>

                    {hasSigned ? (
                      <span className="flex items-center space-x-1 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Signed</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-[11px] font-semibold text-blue-800">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Placement instructions for signee */}
            {hasMyTurnToSign && (
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-950 space-y-2 mt-4 shadow-2xs">
                <div className="font-bold flex items-center gap-1.5">
                  <PenTool className="w-4 h-4 text-blue-900" />
                  <span>Choose Your Signature Spot</span>
                </div>
                <p className="text-[11px] leading-relaxed text-blue-900/80">
                  You determine exactly where you sign. Click the button below, then click anywhere on
                  the document to position and lock your verified signature.
                </p>
                <button
                  onClick={() => {
                    setViewMode('interactive');
                    setIsPlacingSignHere(true);
                    if (!customSignPosition) {
                      setCustomSignPosition({
                        pageNumber: currentPage,
                        xPercent: 20,
                        yPercent: 65,
                        widthPercent: 34,
                        heightPercent: 9,
                      });
                    }
                  }}
                  className="w-full py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center justify-center space-x-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>* Add Signature Here</span>
                </button>
              </div>
            )}

            {hasAlreadySigned && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950 space-y-1 mt-4">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Your Signature is Affixed</span>
                </div>
                <p className="text-[11px] text-emerald-800/80">
                  You have successfully signed and locked your official seal on this document.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Central Stage: Dual Viewer (Interactive Canvas + Native Embedded PDF) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Mode 1 & Mode 3: Interactive Sheet (Visible Text + Placement Marker) */}
          {(viewMode === 'interactive' || viewMode === 'split') && (
            <div className="flex-1 flex flex-col bg-slate-300/60 overflow-hidden relative">
              {/* Floating Page Toolbar */}
              <div className="bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 py-2 flex items-center justify-between z-10 shadow-2xs shrink-0">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="h-4 w-px bg-slate-200 mx-1" />

                  {/* Dynamic Page Jump buttons */}
                  <div className="flex items-center space-x-1 max-w-xs sm:max-w-md overflow-x-auto py-0.5">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                      <button
                        key={pNum}
                        onClick={() => setCurrentPage(pNum)}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors flex items-center space-x-1 ${
                          currentPage === pNum
                            ? 'bg-blue-900 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <span>Page {pNum}</span>
                        {doc.signatures.some((s) => s.pageNumber === pNum) && (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-600">
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setZoomScale((s) => Math.max(0.7, s - 0.15))}
                      className="p-1 rounded text-slate-600 hover:bg-slate-100"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center font-mono">{Math.round(zoomScale * 100)}%</span>
                    <button
                      onClick={() => setZoomScale((s) => Math.min(1.8, s + 0.15))}
                      className="p-1 rounded text-slate-600 hover:bg-slate-100"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => setZoomScale(1.1)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 text-xs font-medium"
                  >
                    Reset Zoom
                  </button>
                </div>
              </div>

              {/* Document Sheet Container */}
              <div className="flex-1 overflow-auto p-4 md:p-6 flex justify-center items-start">
                <div
                  onClick={handlePageClickPlaceSignature}
                  className={`relative bg-white shadow-2xl rounded-xs transition-all select-none border border-slate-300 ${
                    hasMyTurnToSign ? 'cursor-crosshair' : ''
                  }`}
                  style={{
                    width: `${595 * zoomScale}px`,
                    minHeight: pdfLoading && !pdfDocRef.current ? `${842 * zoomScale}px` : undefined,
                  }}
                >
                  {/* The Actual Rendered PDF Canvas */}
                  <canvas
                    ref={canvasRef}
                    className="block w-full h-auto"
                  />

                  {/* Loading indicator while PDF page renders */}
                  {pdfLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 z-10 text-slate-600">
                      <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-xs font-semibold">Rendering Page {currentPage} of Document...</span>
                    </div>
                  )}

                  {/* Fallback Notice if interactive canvas couldn't decode PDF */}
                  {!pdfLoading && pdfRenderError && (
                    <div className="p-8 text-center space-y-3 bg-slate-50 border-t border-slate-200">
                      <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
                      <p className="text-xs text-slate-700 font-semibold">
                        Interactive sheet preview could not render this PDF directly.
                      </p>
                      <button
                        type="button"
                        onClick={() => setViewMode('native')}
                        className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold"
                      >
                        Switch to Native PDF View
                      </button>
                    </div>
                  )}

                  {/* Confirmed Signatures Overlay */}
                  {doc.signatures
                    .filter((sig) => sig.pageNumber === currentPage)
                    .map((sig) => {
                      const rawSigUrl = sig.signaturePngData || '';
                      const sigImgSrc = rawSigUrl.startsWith('http')
                        ? `${rawSigUrl}${rawSigUrl.includes('?') ? '&' : '?'}t=${encodeURIComponent(sig.signedAt || sig.id)}`
                        : rawSigUrl;

                      return (
                        <div
                          key={sig.id}
                          className="absolute border border-emerald-500/80 bg-emerald-50/15 rounded-lg p-1 flex flex-col justify-between group pointer-events-auto shadow-xs z-20"
                          style={{
                            left: `${sig.xPercent}%`,
                            top: `${sig.yPercent}%`,
                            width: `${sig.widthPercent}%`,
                            height: `${sig.heightPercent}%`,
                          }}
                        >
                          <img
                            src={sigImgSrc}
                            alt={sig.userName}
                            className="w-full h-full object-contain filter drop-shadow-xs"
                          />
                          <div className="absolute -bottom-6 left-0 bg-emerald-950 text-white border border-emerald-500 px-2 py-0.5 rounded text-[9px] font-mono shadow-md whitespace-nowrap flex items-center space-x-1 z-20">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>{sig.userName} • Signed &amp; Locked</span>
                          </div>
                        </div>
                      );
                    })}

                  {/* User's Chosen Signature Placement Marker (Determined completely by signee!) */}
                  {customSignPosition &&
                    customSignPosition.pageNumber === currentPage &&
                    hasMyTurnToSign && (
                      <div
                        className="absolute rounded-xl p-2.5 flex flex-col justify-between border-2 border-dashed border-blue-900 bg-blue-50/90 shadow-xl ring-4 ring-blue-500/30 z-30 pointer-events-auto"
                        style={{
                          left: `${customSignPosition.xPercent}%`,
                          top: `${customSignPosition.yPercent}%`,
                          width: `${customSignPosition.widthPercent}%`,
                          height: `${customSignPosition.heightPercent}%`,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1 text-[11px] font-bold text-blue-900">
                            <PenTool className="w-3.5 h-3.5 text-blue-900" />
                            <span className="truncate">{user?.fullName}</span>
                          </div>
                          <span className="text-[9px] bg-blue-200 text-blue-900 px-1 rounded font-semibold uppercase">
                            Your Spot
                          </span>
                        </div>

                        {/* Action buttons inside signee marker */}
                        <div className="flex items-center gap-1.5 mt-1 stop-placement-click">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const myField: SignatureField = {
                                id: `fld-${Date.now()}`,
                                documentId: doc.id,
                                signatoryId: mySignatoryRecord?.id || 'sig-1',
                                userId: user!.id,
                                pageNumber: customSignPosition.pageNumber,
                                xPercent: customSignPosition.xPercent,
                                yPercent: customSignPosition.yPercent,
                                widthPercent: customSignPosition.widthPercent,
                                heightPercent: customSignPosition.heightPercent,
                                fieldLabel: user!.fullName,
                                isRequired: true,
                                isSigned: false,
                              };
                              handleOpenSignField(myField);
                            }}
                            className="flex-1 py-1 px-2 bg-blue-900 hover:bg-blue-950 text-white rounded text-[11px] font-bold shadow-xs flex items-center justify-center space-x-1 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Sign Here Now</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsPlacingSignHere(true);
                            }}
                            className="p-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[10px] font-semibold"
                            title="Click another spot to move"
                          >
                            <Move className="w-3.5 h-3.5 text-slate-600" />
                          </button>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Mode 2 & Mode 3: Native Browser PDF Viewer (Guaranteed to render any PDF!) */}
          {(viewMode === 'native' || viewMode === 'split') && (
            <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden border-l border-slate-200">
              <div className="bg-slate-800 text-slate-200 px-4 py-2 text-xs flex items-center justify-between shrink-0">
                <span className="font-semibold flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span>Native Browser PDF Engine</span>
                </span>
                <a
                  href={activeFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-300 hover:text-white flex items-center gap-1"
                >
                  <span>Open Fullscreen</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <iframe
                key={activeFileUrl}
                src={`${activeFileUrl}#toolbar=1&navpanes=1`}
                className="w-full flex-1 border-0 bg-white"
                title="Document PDF Preview"
              />
            </div>
          )}
        </div>
      </div>

      {/* Signature Placement & Confirmation Dialog */}
      {signingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
                  <PenTool className="w-5 h-5 text-blue-800" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Confirm Official Digital Signature
                  </h3>
                  <p className="text-xs text-slate-500">
                    Document: {doc.title} ({doc.referenceNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSigningField(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Your Transparent Signature PNG
                  </label>
                  <div className="flex items-center space-x-3">
                    <label className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>Upload PNG/JPG/WEBP</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleDirectSignatureImageUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsStudioOpen(true)}
                      className="text-xs text-blue-900 font-semibold hover:underline flex items-center gap-1"
                    >
                      <PenTool className="w-3 h-3" />
                      <span>Draw / Studio</span>
                    </button>
                  </div>
                </div>

                {/* Signature Preview Box */}
                <div
                  className="h-28 rounded-xl border border-slate-300 flex items-center justify-center p-3 relative overflow-hidden"
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, #f8fafc 25%, transparent 25%), linear-gradient(-45deg, #f8fafc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8fafc 75%), linear-gradient(-45deg, transparent 75%, #f8fafc 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    backgroundColor: '#ffffff',
                  }}
                >
                  {processingSigImage ? (
                    <span className="text-xs text-blue-900 font-semibold">
                      Removing background &amp; converting to transparent PNG...
                    </span>
                  ) : signatureDataUrl || user?.signaturePngUrl ? (
                    <img
                      src={signatureDataUrl || user?.signaturePngUrl}
                      alt="Signature"
                      className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                    />
                  ) : (
                    <div className="text-center space-y-2">
                      <p className="text-xs text-slate-500 italic">
                        Upload a signature image (PNG, JPG, WEBP) or draw in Signature Studio
                      </p>
                      <div className="flex items-center justify-center space-x-2">
                        <label className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          <span>Upload Image</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleDirectSignatureImageUpload}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsStudioOpen(true)}
                          className="px-3 py-1 bg-blue-900 hover:bg-blue-950 text-white rounded text-xs font-semibold"
                        >
                          Draw Signature
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  White paper backgrounds are automatically stripped to transparent PNG and merged onto the PDF.
                </p>
              </div>

              {/* Signatory Details Grid */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Signatory:</span>
                  <span className="font-semibold text-slate-900">{user?.fullName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Department / Region:</span>
                  <span className="font-semibold text-slate-900">{user?.department}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Target Page &amp; Position:</span>
                  <span className="font-semibold text-slate-900">
                    Page {customSignPosition?.pageNumber || signingField.pageNumber} (Signee Chosen Spot)
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Verification:</span>
                  <span className="font-mono text-blue-900 font-semibold">
                    SHA-256 Tamper-Evident Seal
                  </span>
                </div>
              </div>

              {/* Legal Affirmation Checkbox */}
              <label className="flex items-start space-x-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-blue-900 rounded border-slate-300 focus:ring-blue-900"
                />
                <span className="text-xs text-slate-700 leading-snug">
                  I confirm that appending my digital signature to this document constitutes my official
                  and legally binding approval. Once submitted, my signature will be embedded and locked.
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setSigningField(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmitSignature}
                disabled={isSubmittingSignature || !consentChecked}
                className="flex items-center space-x-2 px-5 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-sm font-bold shadow-xs disabled:opacity-50 transition-colors"
              >
                {isSubmittingSignature ? (
                  <span>Embedding Signature into PDF...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Confirm &amp; Sign Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Signatories Slide-Up Drawer */}
      {showMobileSignatories && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center animate-in fade-in duration-150">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-900" />
                <span className="text-sm font-bold text-slate-900">
                  Document Signatories ({signedCount}/{totalCount})
                </span>
              </div>
              <button
                onClick={() => setShowMobileSignatories(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 bg-blue-50/50">
              <div className="flex items-center justify-between text-xs text-slate-700 mb-1">
                <span className="font-semibold">Signing Progress</span>
                <span className="font-bold text-blue-900">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    doc.status === 'completed' ? 'bg-emerald-600' : 'bg-blue-900'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {doc.signatories.map((sig, idx) => {
                const isMe = sig.userId === user?.id;
                const hasSigned = sig.status === 'signed';

                return (
                  <div
                    key={sig.id}
                    className={`p-3 rounded-xl border transition-all ${
                      hasSigned
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{sig.user?.fullName}</span>
                            {isMe && (
                              <span className="text-[9px] bg-blue-100 text-blue-900 px-1.5 py-0.2 rounded font-semibold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{sig.user?.position}</div>
                        </div>
                      </div>

                      {hasSigned ? (
                        <span className="flex items-center space-x-1 text-[11px] font-bold text-emerald-700 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Signed</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-[11px] font-semibold text-blue-900 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowMobileSignatories(false)}
                className="w-full py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close Signatories List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Studio Modal */}
      <SignatureStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        onSelectSignature={(dataUrl) => {
          setSignatureDataUrl(dataUrl);
          setIsStudioOpen(false);
        }}
      />
    </div>
  );
};
