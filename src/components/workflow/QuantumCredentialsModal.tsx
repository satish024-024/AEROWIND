import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import {
  fetchQuantumCredentials,
  saveQuantumCredentials,
  deleteQuantumCredentials,
  testQuantumConnection,
  QuantumCredentialMetadata,
} from '../../services/api';

interface QuantumCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  authToken?: string;
  onOpenAuth?: () => void;
  onCredentialsUpdated?: (configured: boolean) => void;
}

export const QuantumCredentialsModal: React.FC<QuantumCredentialsModalProps> = ({
  isOpen,
  onClose,
  authToken,
  onOpenAuth,
  onCredentialsUpdated,
}) => {
  const [metadata, setMetadata] = useState<QuantumCredentialMetadata | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [apiToken, setApiToken] = useState<string>('');
  const [crn, setCrn] = useState<string>('');
  const [showToken, setShowToken] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; backend_name?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [showConfirmDelete, setShowConfirmDelete] = useState<boolean>(false);

  // Load existing credentials metadata on modal open
  useEffect(() => {
    if (!isOpen) {
      setTestResult(null);
      setErrorMsg('');
      setSuccessMsg('');
      setShowConfirmDelete(false);
      return;
    }

    const token = authToken || localStorage.getItem('aqw_token') || undefined;
    if (!token) {
      setMetadata(null);
      return;
    }

    setIsLoading(true);
    fetchQuantumCredentials(token)
      .then((data) => {
        setMetadata(data);
        setIsEditing(!data.configured);
      })
      .catch((err) => {
        console.warn('Failed to load quantum credentials metadata:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, authToken]);

  if (!isOpen) return null;

  const currentToken = authToken || localStorage.getItem('aqw_token');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setTestResult(null);

    const trimmedToken = apiToken.trim();
    if (!trimmedToken) {
      setErrorMsg('IBM Quantum API token cannot be empty.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await saveQuantumCredentials(
        { api_token: trimmedToken, crn: crn.trim() || undefined },
        currentToken || undefined
      );
      setSuccessMsg(res.message || 'IBM Quantum credentials saved securely.');
      setApiToken('');
      setCrn('');
      setIsEditing(false);

      // Refresh metadata
      const freshMeta = await fetchQuantumCredentials(currentToken || undefined);
      setMetadata(freshMeta);
      onCredentialsUpdated?.(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save IBM Quantum credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setTestResult(null);
    setIsTesting(true);

    try {
      const res = await testQuantumConnection(currentToken || undefined);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'IBM Quantum connection failed. Please verify credentials.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      await deleteQuantumCredentials(currentToken || undefined);
      setMetadata({ configured: false, crn_configured: false });
      setIsEditing(true);
      setShowConfirmDelete(false);
      setSuccessMsg('IBM Quantum credentials removed successfully.');
      onCredentialsUpdated?.(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="quantum-credentials-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/80 animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          id="btn-close-quantum-modal"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="bg-gradient-to-b from-amber-50 to-white pt-6 pb-4 px-6 border-b border-slate-100">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-900 shadow-xs">
              <Cpu className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                IBM Quantum Credentials
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                  AES-256-GCM
                </span>
              </h2>
              <p className="text-[11px] text-slate-500">
                Per-user secure quantum hardware execution credentials
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed mt-2 bg-white/70 p-2.5 rounded-xl border border-slate-200/60">
            Connect your IBM Quantum account to run optimization jobs on IBM Quantum hardware. Your credentials are encrypted server-side and used only to submit quantum jobs on your behalf.
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-4">
          
          {/* Sign In Required Notice */}
          {!currentToken && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Authentication Required</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-normal">
                To isolate and protect IBM Quantum credentials, please sign in with your engineer account before saving credentials.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth?.();
                }}
                className="self-start px-3 py-1.5 rounded-xl bg-slate-950 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
              >
                Sign In Now
              </button>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Test Connection Result */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex flex-col gap-1 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
              {testResult.backend_name && (
                <div className="text-[11px] text-emerald-700 pl-6">
                  Target System: <span className="font-mono font-bold">{testResult.backend_name}</span> (Operational)
                </div>
              )}
            </div>
          )}

          {/* STATE A: Credentials Configured View */}
          {currentToken && metadata?.configured && !isEditing && (
            <div className="flex flex-col gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">
                      Credentials Configured
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                    Active
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600 py-1 border-b border-slate-200/60">
                    <span className="text-slate-400 font-medium">API Token</span>
                    <span className="font-mono text-slate-800 tracking-wider">
                      {metadata.token_masked || '••••••••••••••••'}
                    </span>
                  </div>
                  {metadata.crn_configured && (
                    <div className="flex items-center justify-between text-slate-600 py-1 border-b border-slate-200/60">
                      <span className="text-slate-400 font-medium">Instance / CRN</span>
                      <span className="font-mono text-slate-800">
                        {metadata.instance_masked || 'Configured'}
                      </span>
                    </div>
                  )}
                  {metadata.updated_at && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>Last Updated</span>
                      <span>{metadata.updated_at}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  id="btn-test-quantum-connection"
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Testing IBM Connection...' : 'Test IBM Quantum Connection'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true);
                      setSuccessMsg('');
                      setErrorMsg('');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                  >
                    Update Credentials
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(true)}
                    className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                {/* Confirm Delete Confirmation Dialog */}
                {showConfirmDelete && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col gap-2 mt-2 animate-in fade-in">
                    <p className="text-xs font-bold text-rose-900">
                      Remove IBM Quantum Credentials?
                    </p>
                    <p className="text-[11px] text-rose-700 leading-normal">
                      This will remove your encrypted IBM credentials. Hardware execution will be unavailable until reconfigured.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowConfirmDelete(false)}
                        className="px-3 py-1 text-xs font-bold text-slate-600 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs"
                      >
                        Confirm Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STATE B: Edit / Enter Credentials Form */}
          {currentToken && (!metadata?.configured || isEditing) && (
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              {/* Token Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    IBM Quantum API Token
                  </label>
                  <a
                    href="https://quantum.ibm.com/account"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-amber-700 hover:underline flex items-center gap-0.5"
                  >
                    <span>Get Token</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    id="input-ibm-token"
                    type={showToken ? 'text' : 'password'}
                    required
                    placeholder="Paste IBM Quantum API token"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    className="w-full pl-9 pr-10 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* CRN Input (Optional for Cloud instances) */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  IBM Quantum CRN / Instance <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    id="input-ibm-crn"
                    type="text"
                    placeholder="crn:v1:bluemix:public:quantum-computing:..."
                    value={crn}
                    onChange={(e) => setCrn(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400 focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* Security Safeguard Notice */}
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-600">
                <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Your token is encrypted server-side with AES-256-GCM. It is never stored in browser storage or returned via public APIs.
                </span>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center gap-2 pt-2">
                {metadata?.configured && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setApiToken('');
                      setCrn('');
                      setErrorMsg('');
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  id="btn-save-quantum-credentials"
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Saving Securely...' : 'Save Credentials'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
