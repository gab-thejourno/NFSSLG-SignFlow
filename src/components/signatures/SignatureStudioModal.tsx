import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  PenTool,
  Type,
  Upload,
  Trash2,
  Download,
  Check,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiUploadSignaturePng } from '../../lib/api';
import { processSignatureImageToTransparentPng } from '../../lib/signatureProcessor';

interface SignatureStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSignature?: (dataUrl: string) => void;
}

export const SignatureStudioModal: React.FC<SignatureStudioModalProps> = ({
  isOpen,
  onClose,
  onSelectSignature,
}) => {
  const { user, updateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');

  // Drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [inkColor, setInkColor] = useState('#0f2942');
  const [strokeWidth, setStrokeWidth] = useState(3);

  // Type signature state
  const [typedName, setTypedName] = useState(user?.fullName || '');
  const [fontStyle, setFontStyle] = useState<'cursive' | 'brush' | 'formal'>('cursive');

  // Upload state
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(user?.signaturePngUrl || null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.signaturePngUrl) {
      setPreviewDataUrl(user.signaturePngUrl);
    }
    if (user?.fullName) {
      setTypedName(user.fullName);
    }
  }, [user]);

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = inkColor;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setPreviewDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  // Generate transparent PNG from typed text
  const generateTypedSignaturePng = (): string => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 600;
    tempCanvas.height = 200;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.fillStyle = inkColor;

    if (fontStyle === 'cursive') {
      ctx.font = 'italic 52px "Brush Script MT", "Caveat", cursive';
    } else if (fontStyle === 'brush') {
      ctx.font = 'bold italic 46px "Segoe Script", "Great Vibes", cursive';
    } else {
      ctx.font = 'italic 44px "Snell Roundhand", "Bradley Hand", cursive';
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName || 'SignFlow Signature', 300, 100);

    return tempCanvas.toDataURL('image/png');
  };

  const handleApplyTyped = () => {
    const url = generateTypedSignaturePng();
    setPreviewDataUrl(url);
  };

  // Upload handler with transparent background processing (PNG, JPG, WEBP)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaveError(null);
    try {
      const processed = await processSignatureImageToTransparentPng(file);
      setUploadedDataUrl(processed.dataUrl);
      setPreviewDataUrl(processed.dataUrl);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to process signature image.');
    }
  };

  const handleSaveSignature = async () => {
    let finalPng = previewDataUrl;
    if (activeTab === 'draw' && hasDrawn && canvasRef.current) {
      finalPng = canvasRef.current.toDataURL('image/png');
    } else if (activeTab === 'type') {
      finalPng = generateTypedSignaturePng();
    } else if (activeTab === 'upload' && uploadedDataUrl) {
      finalPng = uploadedDataUrl;
    }

    if (!finalPng) {
      setSaveError('Please draw, type, or upload your signature before saving.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await apiUploadSignaturePng(finalPng);
      await updateProfile({ signaturePngUrl: res.url });
      setSaveSuccess(true);

      if (onSelectSignature) {
        onSelectSignature(finalPng);
        onClose();
      } else {
        setTimeout(() => {
          setSaveSuccess(false);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      console.error('Error saving signature:', err);
      setSaveError(err.message || 'Failed to save signature');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSignature = async () => {
    if (!confirm('Are you sure you want to delete your stored signature?')) return;
    await updateProfile({ signaturePngUrl: '' });
    setPreviewDataUrl(null);
    clearCanvas();
  };

  const handleDownloadPng = () => {
    if (!previewDataUrl) return;
    const a = document.createElement('a');
    a.href = previewDataUrl;
    a.download = `${(user?.fullName || 'signature').toLowerCase().replace(/\s+/g, '_')}_transparent.png`;
    a.click();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
              <PenTool className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Personal Signature Studio</h2>
              <p className="text-xs text-slate-500">
                Create and manage your verified transparent digital signature PNG
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-slate-200 flex space-x-6">
          <button
            onClick={() => setActiveTab('draw')}
            className={`flex items-center space-x-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'draw'
                ? 'border-blue-900 text-blue-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Draw with Pen</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('type');
              handleApplyTyped();
            }}
            className={`flex items-center space-x-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'type'
                ? 'border-blue-900 text-blue-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Type className="w-4 h-4" />
            <span>Type Signature</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-2 pb-3 font-medium text-sm transition-colors border-b-2 ${
              activeTab === 'upload'
                ? 'border-blue-900 text-blue-900 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload Transparent PNG</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'draw' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3 text-xs text-slate-600">
                  <span>Ink:</span>
                  <div className="flex items-center space-x-1.5">
                    {[
                      { color: '#0f2942', label: 'Navy' },
                      { color: '#1e293b', label: 'Charcoal' },
                      { color: '#000000', label: 'Black' },
                      { color: '#1d4ed8', label: 'Blue' },
                    ].map((c) => (
                      <button
                        key={c.color}
                        onClick={() => setInkColor(c.color)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          inkColor === c.color ? 'scale-115 border-blue-500 shadow-xs' : 'border-white'
                        }`}
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                      />
                    ))}
                  </div>

                  <span className="ml-2">Weight:</span>
                  <select
                    value={strokeWidth}
                    onChange={(e) => setStrokeWidth(Number(e.target.value))}
                    className="border border-slate-200 rounded px-2 py-1 text-xs bg-white text-slate-700"
                  >
                    <option value={2}>Fine (2px)</option>
                    <option value={3}>Medium (3px)</option>
                    <option value={4}>Thick (4px)</option>
                  </select>
                </div>

                <button
                  onClick={clearCanvas}
                  className="flex items-center space-x-1 text-xs text-slate-500 hover:text-rose-600 font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Clear Pad</span>
                </button>
              </div>

              {/* Drawing Canvas with transparency checkerboard background */}
              <div
                className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden touch-none"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  backgroundColor: '#ffffff',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={550}
                  height={180}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-44 cursor-crosshair"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-400 text-sm italic">
                    Draw your signature here with mouse or touchscreen
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'type' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name / Legal Signatory Name
                </label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="e.g. Dr. Elena Rostova"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'cursive', label: 'Executive Script', preview: typedName || 'Executive Script' },
                  { id: 'brush', label: 'Modern Flow', preview: typedName || 'Modern Flow' },
                  { id: 'formal', label: 'Classic Elegance', preview: typedName || 'Classic Elegance' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setFontStyle(item.id as any);
                      setTimeout(handleApplyTyped, 10);
                    }}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      fontStyle === item.id
                        ? 'border-blue-900 bg-blue-50/50 shadow-xs ring-1 ring-blue-900'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-700 mb-1">{item.label}</div>
                    <div
                      className="text-lg text-blue-950 truncate py-1"
                      style={{
                        fontFamily:
                          item.id === 'cursive'
                            ? '"Brush Script MT", cursive'
                            : item.id === 'brush'
                            ? '"Segoe Script", cursive'
                            : '"Snell Roundhand", cursive',
                      }}
                    >
                      {item.preview}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
              <label className="border-2 border-dashed border-slate-300 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-700 hover:bg-blue-50/20 transition-colors">
                <Upload className="w-8 h-8 text-blue-900 mb-2" />
                <span className="text-sm font-semibold text-slate-800">
                  Upload Signature Image (PNG, JPG, or WEBP)
                </span>
                <span className="text-xs text-slate-500 mt-1 text-center max-w-sm">
                  Upload a PNG, JPG, or WEBP signature photo. Any white paper background will be
                  automatically removed on canvas and exported as a transparent PNG.
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Current Stored Signature Preview */}
          <div className="mt-5 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Transparent PNG Signature Output
              </span>
              <div className="flex items-center space-x-2">
                {previewDataUrl && (
                  <>
                    <button
                      onClick={handleDownloadPng}
                      className="flex items-center space-x-1 text-xs text-slate-600 hover:text-blue-900"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PNG</span>
                    </button>
                    <button
                      onClick={handleDeleteSignature}
                      className="flex items-center space-x-1 text-xs text-slate-500 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {saveError && (
              <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2">
                <span>{saveError}</span>
              </div>
            )}

            <div
              className="h-28 rounded-xl border border-slate-200 flex items-center justify-center p-3 relative overflow-hidden"
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #f8fafc 25%, transparent 25%), linear-gradient(-45deg, #f8fafc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8fafc 75%), linear-gradient(-45deg, transparent 75%, #f8fafc 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#ffffff',
              }}
            >
              {previewDataUrl ? (
                <img
                  src={previewDataUrl}
                  alt="Signature Preview"
                  className="max-h-full max-w-full object-contain filter drop-shadow-xs"
                />
              ) : (
                <span className="text-xs text-slate-400 italic">No signature saved yet</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Note: Uploading or saving your signature does not automatically sign any document. You will
              always confirm signature placement explicitly.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveSignature}
            disabled={isSaving}
            className="flex items-center space-x-2 px-5 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-sm font-semibold shadow-xs disabled:opacity-50 transition-colors"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Saved Successfully!</span>
              </>
            ) : isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{onSelectSignature ? 'Use This Signature' : 'Save Default Signature'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
