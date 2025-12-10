import React, { useEffect, useState, useRef } from 'react';
import { Contact } from '../types';
import Avatar from './Avatar';
import { PhoneOff, Mic, MicOff, Monitor, Settings, Check, X } from 'lucide-react';

interface CallOverlayProps {
  contact: Contact | { name: string; avatarUrl: string }; 
  onEndCall: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  onToggleMute: () => void;
  status?: string;

  // New props for advanced features
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  onToggleAudioFeature?: (feature: 'noise' | 'echo') => void;
}

const CallOverlay: React.FC<CallOverlayProps> = ({ 
    contact, 
    onEndCall, 
    localStream, 
    remoteStream,
    isMuted,
    onToggleMute,
    status = 'Соединение...',
    isScreenSharing,
    onToggleScreenShare,
    noiseSuppression,
    echoCancellation,
    onToggleAudioFeature
}) => {
  const [duration, setDuration] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  
  // Audio refs for stream playback
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Handle stream attachments
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isScreenSharing]); // Re-attach if screen share toggles tracks

  useEffect(() => {
    let interval: any;
    if (status === 'Идет разговор') {
      interval = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  // Click outside to close settings
  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
              setShowSettings(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-white overflow-hidden animate-in fade-in duration-300">
      
      {/* SETTINGS BUTTON (Top Left) */}
      <div className="absolute top-6 left-6 z-50" ref={settingsRef}>
          <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-full transition-all hover:bg-white/10 ${showSettings ? 'bg-white/20 text-white' : 'bg-black/20 text-gray-200 backdrop-blur-md'}`}
          >
              <Settings size={24} />
          </button>
          
          {/* Settings Popup */}
          {showSettings && (
              <div className="absolute top-full mt-2 left-0 w-64 bg-slate-800/90 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 p-4 animate-pop-in origin-top-left">
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Настройки звука</h4>
                  
                  <div className="space-y-2">
                      <button 
                          onClick={() => onToggleAudioFeature?.('noise')}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                          <span className="text-sm font-medium">Шумоподавление</span>
                          <div className={`w-10 h-5 rounded-full relative transition-colors ${noiseSuppression ? 'bg-green-500' : 'bg-slate-600'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${noiseSuppression ? 'left-6' : 'left-1'}`}></div>
                          </div>
                      </button>

                      <button 
                          onClick={() => onToggleAudioFeature?.('echo')}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                          <span className="text-sm font-medium">Эхоподавление</span>
                          <div className={`w-10 h-5 rounded-full relative transition-colors ${echoCancellation ? 'bg-green-500' : 'bg-slate-600'}`}>
                              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${echoCancellation ? 'left-6' : 'left-1'}`}></div>
                          </div>
                      </button>
                  </div>
              </div>
          )}
      </div>

      {/* Video Elements */}
      {/* Remote Stream (Main View) */}
      {remoteStream && (
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
      )}

      {/* Local Stream (PIP) */}
      {localStream && (isScreenSharing || localStream.getVideoTracks().length > 0) && (
          <div className="absolute top-4 right-4 w-32 md:w-48 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl z-20 border border-white/10">
              <video 
                ref={localVideoRef} 
                autoPlay 
                playsInline
                muted 
                className="w-full h-full object-cover"
              />
          </div>
      )}

      {/* Backdrop (Only visible if no video) */}
      {!remoteStream?.getVideoTracks().length && (
          <>
            <div className="absolute inset-0 z-10 bg-gradient-to-br from-slate-800 to-slate-900"></div>
            <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>
          </>
      )}

      {/* Main Info (Only visible if no remote video) */}
      {!remoteStream?.getVideoTracks().length && (
        <div className="relative z-30 flex-1 flex flex-col items-center justify-center w-full max-w-md space-y-12 p-6">
            <div className="relative">
                {status !== 'Идет разговор' && (
                    <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20 scale-150 duration-1000"></div>
                )}
                <Avatar src={contact.avatarUrl} alt={contact.name} size="xl" />
            </div>

            <div className="text-center space-y-3 drop-shadow-md">
            <h2 className="text-3xl font-light tracking-tight text-white">{contact.name}</h2>
            <p className={`text-lg font-medium tracking-wide ${status === 'Идет разговор' ? 'text-white/80' : 'text-blue-300'}`}>
                {status === 'Идет разговор' ? formatDuration(duration) : status}
            </p>
            </div>
        </div>
      )}

      {/* Controls Bar - Absolutely positioned at bottom, no background slab */}
      <div className="absolute bottom-0 left-0 right-0 z-40 pb-12 flex justify-center items-end pointer-events-none">
         <div className="flex items-center gap-8 pointer-events-auto animate-slide-up">
            
            {/* 2. Mute Button */}
            <button 
                onClick={onToggleMute}
                className={`p-4 rounded-full transition-all transform active:scale-95 ${isMuted ? 'bg-white text-slate-900' : 'bg-white/5 text-white hover:bg-white/10'}`}
            >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            {/* 3. End Call Button (Center) */}
            <button 
                onClick={onEndCall}
                className="p-5 bg-red-500 hover:bg-red-600 rounded-2xl text-white shadow-lg transform hover:scale-105 active:scale-95 transition-all mx-2"
            >
                <PhoneOff size={32} />
            </button>

            {/* 4. Screen Share Button (Right of handset) */}
            <button 
                onClick={onToggleScreenShare}
                className={`p-4 rounded-full transition-all transform active:scale-95 ${isScreenSharing ? 'bg-green-500 text-white' : 'bg-white/5 text-white hover:bg-white/10'}`}
                title="Демонстрация экрана"
            >
                {isScreenSharing ? <X size={24} /> : <Monitor size={24} />}
            </button>

         </div>
      </div>
    </div>
  );
};

export default CallOverlay;