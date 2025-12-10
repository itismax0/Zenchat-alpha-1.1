
import React from 'react';
import { ShieldCheck, X, Server, Key, Lock, RefreshCw, Layers } from 'lucide-react';

interface SecurityInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SecurityInfoModal: React.FC<SecurityInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden m-4 animate-in zoom-in-95 duration-300 flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white relative overflow-hidden">
            {/* Decorative Shield - Added pointer-events-none to prevent blocking clicks */}
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                <ShieldCheck size={120} />
            </div>
            
            {/* Close Button - Fixed Z-index and visibility */}
            <button 
                onClick={onClose} 
                className="absolute top-3 right-3 p-2 bg-black/20 hover:bg-black/30 rounded-full transition-colors text-white z-[60] cursor-pointer active:scale-95"
                aria-label="Close"
            >
                <X size={22} />
            </button>

            <div className="relative z-10">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 shadow-inner border border-white/30">
                    <ShieldCheck size={32} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight">Безопасность</h3>
                <p className="text-blue-100 text-sm font-medium opacity-90">Защищено протоколом шифрования</p>
            </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 bg-white dark:bg-slate-800">
            <div className="space-y-4">
                
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white text-sm">AES-256 Шифрование</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            Все сообщения шифруются с использованием симметричного алгоритма AES с длиной ключа 256 бит.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg">
                        <Key size={20} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white text-sm">Обмен ключами Диффи-Хеллмана</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            Безопасная генерация общего секрета (ECDH P-256) без передачи ключей по сети.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
                        <Server size={20} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white text-sm">MTProto 2.0 Layer</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            Надежный транспортный протокол с защитой от MITM (Man-in-the-Middle) атак и подделки данных.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4">
                    <div className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg">
                        <RefreshCw size={20} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white text-sm">Ротация ключей</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                            Ключи сессий постоянно меняются (Perfect Forward Secrecy), обеспечивая защиту прошлой переписки.
                        </p>
                    </div>
                </div>

            </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700 text-center">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5">
                <Layers size={12} />
                ZenChat Secure Protocol
            </span>
        </div>
      </div>
    </div>
  );
};

export default SecurityInfoModal;
