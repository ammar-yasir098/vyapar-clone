import React, { createContext, useContext, useState, useCallback } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Info, 
  X,
  HelpCircle
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showConfirm: (options: ConfirmOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmOptions | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const showConfirm = useCallback((options: ConfirmOptions) => {
    setConfirmModal(options);
  }, []);

  const handleConfirmAction = () => {
    if (confirmModal) {
      confirmModal.onConfirm();
      setConfirmModal(null);
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, showConfirm }}>
      {children}

      {/* FLOATING TOAST NOTIFICATIONS (TOP RIGHT) */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none select-none">
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 animate-in slide-in-from-top-4 fade-in ${
                isSuccess
                  ? 'bg-slate-900/95 text-white border-emerald-500/40 ring-1 ring-emerald-500/20'
                  : isError
                  ? 'bg-slate-900/95 text-white border-red-500/40 ring-1 ring-red-500/20'
                  : isWarning
                  ? 'bg-slate-900/95 text-white border-amber-500/40 ring-1 ring-amber-500/20'
                  : 'bg-slate-900/95 text-white border-blue-500/40 ring-1 ring-blue-500/20'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {isError && <XCircle className="w-5 h-5 text-red-400" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
              </div>

              <div className="flex-1 text-xs font-semibold leading-relaxed text-slate-100">
                {toast.message}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-slate-400 hover:text-white p-0.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* GLOBAL CONFIRMATION MODAL */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3.5">
                <div className={`p-3 rounded-2xl shrink-0 ${
                  confirmModal.type === 'danger'
                    ? 'bg-red-100 text-red-600'
                    : confirmModal.type === 'warning'
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  {confirmModal.type === 'danger' && <XCircle className="w-6 h-6" />}
                  {confirmModal.type === 'warning' && <AlertTriangle className="w-6 h-6" />}
                  {(!confirmModal.type || confirmModal.type === 'info') && <HelpCircle className="w-6 h-6" />}
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{confirmModal.message}</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  {confirmModal.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  className={`px-5 py-2 text-white rounded-xl text-xs font-extrabold shadow-md transition cursor-pointer ${
                    confirmModal.type === 'danger'
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-500/20'
                      : confirmModal.type === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                  }`}
                >
                  {confirmModal.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
