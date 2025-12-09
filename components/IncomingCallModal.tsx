import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Contact } from '../types';
import Avatar from './Avatar';

interface IncomingCallModalProps {
  callerName: string;
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ callerName, onAccept, onDecline }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center justify-center space-y-8 p-8">
        
        <div className="relative">
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping blur-xl"></div>
            <div className="w-32 h-32 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shadow-2xl relative z-10">
                 <span className="text-4xl font-bold text-slate-700 dark:text-white uppercase">
                    {callerName.charAt(0)}
                 </span>
            </div>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-3xl font-light text-white tracking-tight">{callerName}</h2>
          <p className="text-blue-200 text-lg font-medium animate-pulse">Входящий звонок...</p>
        </div>

        <div className="flex items-center gap-12 mt-8">
            <button 
                onClick={onDecline}
                className="flex flex-col items-center gap-2 group"
            >
                <div className="p-4 bg-red-500 rounded-full shadow-lg group-hover:bg-red-600 transition-all transform group-hover:scale-110 group-active:scale-95">
                    <PhoneOff size={32} className="text-white" />
                </div>
                <span className="text-white text-sm font-medium">Отклонить</span>
            </button>

            <button 
                onClick={onAccept}
                className="flex flex-col items-center gap-2 group"
            >
                <div className="p-4 bg-green-500 rounded-full shadow-lg group-hover:bg-green-600 transition-all transform group-hover:scale-110 group-active:scale-95 animate-bounce">
                    <Phone size={32} className="text-white" />
                </div>
                <span className="text-white text-sm font-medium">Принять</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;