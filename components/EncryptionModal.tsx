
import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, X, Check } from 'lucide-react';
import { Contact } from '../types';
import { encryptionService } from '../services/encryptionService';
import { CURRENT_USER_ID } from '../constants';

interface EncryptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
}

const EncryptionModal: React.FC<EncryptionModalProps> = ({ isOpen, onClose, contact }) => {
  const [safetyNumbers, setSafetyNumbers] = useState<string[]>([]);
  const [securityColor, setSecurityColor] = useState<string>('#3b82f6');

  useEffect(() => {
    if (isOpen) {
      encryptionService.getSafetyNumber(contact.id, CURRENT_USER_ID).then(setSafetyNumbers);
      setSecurityColor(encryptionService.getSecurityColor(contact.id));
    }
  }, [isOpen, contact.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden m-4 animate-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <Lock size={18} className="text-green-500" />
                Секретный чат
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="p-8 flex flex-col items-center text-center">
            
            {/* Visual Fingerprint (Lock Animation) */}
            <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <ShieldCheck size={48} className="text-green-500" />
                </div>
                <div className="absolute -bottom-2 -right-2 bg-white dark:bg-slate-800 p-1.5 rounded-full shadow-sm border border-black/10 dark:border-white/10">
                    <Check size={16} className="text-green-500" />
                </div>
            </div>

            <h4 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Общий секретный ключ</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                Это уникальный код, созданный из ваших ключей шифрования. Сравните его с кодом вашего собеседника, чтобы убедиться, что ваш чат защищен.
            </p>

            <div 
                className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700 w-full max-w-xs justify-items-center"
                style={{borderColor: securityColor}}
            >
                {safetyNumbers.map((num, i) => (
                    <span key={i} className="font-mono text-xl text-slate-800 dark:text-white font-bold tracking-wider" style={{color: securityColor}}>{num}</span>
                ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">
                Цвет и номера должны совпадать.
            </p>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700 text-center">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5">
                <Lock size={12} />
                Ваши сообщения защищены
            </span>
        </div>
      </div>
    </div>
  );
};

export { EncryptionModal };