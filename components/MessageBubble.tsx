
import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { CURRENT_USER_ID } from '../constants';
import ReactMarkdown from 'react-markdown';
import { FileText, Download, MapPin, Play, Pause, Check, CheckCheck, Clock, Pin, Edit2, Forward, User, UserPlus } from 'lucide-react';
import './MessageBubble.css';
import Avatar from './Avatar';

interface MessageBubbleProps {
  message: Message;
  currentUserId?: string;
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, message: Message) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  currentUserId, 
  onContextMenu,
  isSelectionMode,
  isSelected,
  onToggleSelect
}) => {
  // Use currentUserId if available, otherwise fallback to constant (for dev/local mode)
  const isMe = message.senderId === (currentUserId || CURRENT_USER_ID);
  
  const isSticker = message.type === 'sticker';
  const isImage = message.type === 'image';
  const isFile = message.type === 'file';
  const isLocation = message.type === 'location';
  const isVoice = message.type === 'voice';
  const isContact = message.type === 'contact';

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
        window.removeEventListener('online', handleStatusChange);
        window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  useEffect(() => {
    if (isVoice && message.attachmentUrl) {
        audioRef.current = new Audio(message.attachmentUrl);
        
        audioRef.current.addEventListener('ended', () => {
            setIsPlaying(false);
            setProgress(0);
        });

        audioRef.current.addEventListener('timeupdate', () => {
            if (audioRef.current) {
                const percent = (audioRef.current.currentTime / audioRef.current.duration) * 100;
                setProgress(percent || 0);
            }
        });

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }
  }, [isVoice, message.attachmentUrl]);

  const togglePlay = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Play sound effect for interaction
      import('../services/soundService').then(({soundService}) => {
          // A very quiet click or interaction sound could go here if desired
      });

      if (audioRef.current) {
          if (isPlaying) {
              audioRef.current.pause();
          } else {
              audioRef.current.play();
          }
          setIsPlaying(!isPlaying);
      }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderStatus = () => {
    if (!isMe) return null;
    
    // Telegram-style status icons
    const iconClass = "text-blue-100 dark:text-white/80"; 
    
    return (
      <span className="message-status flex items-center ml-1 h-3 self-end mb-0.5" title={message.status}>
        {message.isPinned && <Pin size={10} className="mr-1.5 text-slate-300 transform -rotate-45" fill="currentColor" />}
        
        {/* Case 1: Sending + Offline = Clock */}
        {message.status === 'sending' && !isOnline && (
             <Clock size={12} className={`${iconClass} opacity-70`} strokeWidth={2} />
        )}
        
        {/* Case 2: Sending + Online = One Check (Optimistic) OR Sent = One Check */}
        {((message.status === 'sending' && isOnline) || message.status === 'sent') && (
             <Check size={16} className={iconClass} strokeWidth={2} />
        )}
        
        {/* Case 3: Read = Two Checks */}
        {message.status === 'read' && (
             <CheckCheck size={16} className={iconClass} strokeWidth={2} />
        )}
      </span>
    );
  };

  // --- Long Press Logic ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSelectionMode) return;
    e.persist(); // Persist synthetic event
    longPressTimerRef.current = setTimeout(() => {
        onContextMenu(e, message);
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    // If user moves finger, cancel long press
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelectionMode) {
        onContextMenu(e, message);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectionMode && onToggleSelect) {
        e.stopPropagation();
        onToggleSelect(message.id);
    }
  };

  // --- Render ---

  if (isSticker && message.attachmentUrl) {
    return (
      <div 
        id={`msg-${message.id}`}
        className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} mb-6 group relative animate-message origin-bottom`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
      >
        {isSelectionMode && (
           <div className={`mr-2 self-center ${isMe ? 'order-first' : 'order-first'}`}>
               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-blue-500 border-blue-500 scale-110' : 'border-gray-300 dark:border-slate-500'}`}>
                   {isSelected && <Check size={12} className="text-white" />}
               </div>
           </div>
        )}
        <div className="relative max-w-[50%] transition-transform active:scale-95 duration-200">
          <img 
            src={message.attachmentUrl} 
            alt="Sticker" 
            className="w-32 h-32 object-contain drop-shadow-sm hover:scale-110 transition-transform duration-300" 
          />
           {/* Reactions for Sticker */}
           {message.reactions && message.reactions.length > 0 && (
                <div className={`absolute -bottom-2 ${isMe ? 'right-0' : 'left-0'} flex flex-wrap gap-1 z-10`}>
                    {message.reactions.map((r, i) => (
                        <span key={i} className="flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm shadow-sm border border-black/5 dark:border-white/10 rounded-full px-1.5 py-0.5 text-xs transform hover:scale-110 transition-transform cursor-pointer animate-pop-in" style={{ animationDelay: `${i * 50}ms` }}>
                            <span>{r.emoji}</span>
                            {r.count > 1 && <span className="text-[10px] font-bold text-blue-500">{r.count}</span>}
                        </span>
                    ))}
                </div>
            )}
          <div className={`text-[10px] mt-1 opacity-70 flex items-center gap-1 ${isMe ? 'text-slate-400 justify-end' : 'text-slate-400 justify-start'}`}>
             <span>{formatTime(message.timestamp)}</span>
             {renderStatus()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
        id={`msg-${message.id}`}
        className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'} mb-2 group relative select-none animate-message origin-bottom`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
    >
      {isSelectionMode && (
           <div className={`mx-2 self-center ${isMe ? 'order-first' : 'order-first'} animate-fade-in`}>
               <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${isSelected ? 'bg-blue-500 border-blue-500 scale-110' : 'border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-800'}`}>
                   {isSelected && <Check size={12} className="text-white" />}
               </div>
           </div>
      )}

      <div
        className={`max-w-[85%] lg:max-w-[65%] px-3 py-2 rounded-2xl shadow-sm relative text-sm md:text-base transition-all duration-200 ${
          isMe
            ? 'bg-blue-500 text-white rounded-tr-sm dark:bg-blue-600'
            : 'bg-white border border-gray-100 text-slate-800 rounded-tl-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white'
        } ${isImage ? 'p-1' : ''} ${message.reactions && message.reactions.length > 0 ? 'mb-4' : ''} hover:shadow-md`} 
      >
        {/* Forwarded Header */}
        {message.isForwarded && (
             <div className="flex items-center gap-1 mb-1 text-xs opacity-70 italic border-b border-white/10 pb-1">
                 <Forward size={10} />
                 <span>Пересланное сообщение</span>
             </div>
        )}

        {/* Reply Context - Telegram Style */}
        {message.replyTo && (
            <div className={`mb-1.5 pl-2.5 border-l-[3px] ${isMe ? 'border-white/50' : 'border-blue-500'} rounded-[2px] cursor-pointer opacity-90 transition-opacity hover:opacity-100`}>
                <p className={`text-xs font-semibold ${isMe ? 'text-white' : 'text-blue-500 dark:text-blue-400'}`}>
                    {message.replyTo.senderName}
                </p>
                <p className={`text-xs truncate ${isMe ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {message.replyTo.text || 'Вложение'}
                </p>
            </div>
        )}

        {/* Contact Card */}
        {isContact && message.contactInfo && (
            <div className="flex items-center gap-3 min-w-[200px] pb-1">
                <div className="relative">
                    <Avatar 
                        src={message.contactInfo.avatarUrl} 
                        alt={message.contactInfo.name} 
                        size="md" 
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{message.contactInfo.name}</p>
                    <p className={`text-xs truncate ${isMe ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                        {message.contactInfo.phoneNumber || (message.contactInfo.username ? `@${message.contactInfo.username}` : 'Контакт')}
                    </p>
                </div>
            </div>
        )}

        {/* Image Attachment */}
        {isImage && message.attachmentUrl && (
          <div className="mb-2 rounded-lg overflow-hidden relative group/image">
             <img 
               src={message.attachmentUrl} 
               alt="Attachment" 
               className="max-w-full h-auto max-h-72 object-cover rounded-lg cursor-pointer transition-transform duration-500 group-hover/image:scale-[1.02]" 
             />
          </div>
        )}

        {/* File Attachment */}
        {isFile && (
          <div className={`flex items-center gap-3 p-2 rounded-lg mb-2 transition-colors ${isMe ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-50 border border-slate-200 dark:bg-slate-600 dark:border-slate-500 hover:bg-slate-100'}`}>
            <div className={`p-2 rounded-full ${isMe ? 'bg-white/20' : 'bg-white dark:bg-slate-500'}`}>
              <FileText size={24} className={isMe ? 'text-white' : 'text-blue-500 dark:text-white'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-sm">{message.fileName || 'Документ'}</p>
              <p className={`text-xs ${isMe ? 'text-blue-100' : 'text-gray-500 dark:text-gray-300'}`}>{message.fileSize || 'неизв.'}</p>
            </div>
            <button className={`p-2 rounded-full hover:bg-black/10 transition-colors btn-press`}>
              <Download size={18} />
            </button>
          </div>
        )}

        {/* Voice Message */}
        {isVoice && (
            <div className={`flex items-center gap-3 p-1 min-w-[200px] ${isMe ? 'pr-2' : ''}`}>
                <button 
                    onClick={togglePlay}
                    className={`p-2.5 rounded-full flex-shrink-0 transition-all btn-press ${
                        isMe 
                        ? 'bg-white text-blue-500' 
                        : 'bg-blue-100 text-blue-600 dark:bg-slate-600 dark:text-white'
                    }`}
                >
                    {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
                </button>
                <div className="flex-1 flex flex-col justify-center gap-1">
                    <div className="h-1 bg-white/30 dark:bg-slate-600 rounded-full overflow-hidden w-full">
                        <div 
                            className={`h-full rounded-full transition-all duration-300 ease-linear ${isMe ? 'bg-white' : 'bg-blue-500 dark:bg-blue-400'}`} 
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className={`text-[10px] font-medium ${isMe ? 'text-blue-100' : 'text-gray-500 dark:text-gray-300'}`}>
                        {isPlaying && audioRef.current 
                            ? formatDuration(audioRef.current.currentTime) 
                            : formatDuration(message.duration || 0)
                        }
                    </div>
                </div>
            </div>
        )}

        {/* Location Attachment */}
        {isLocation && message.latitude && message.longitude && (
            <div className="mb-2">
                <a 
                    href={`https://www.google.com/maps?q=${message.latitude},${message.longitude}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden relative group/map"
                >
                    <div className="h-32 w-full bg-slate-100 dark:bg-slate-600 flex items-center justify-center relative transition-transform duration-500 group-hover/map:scale-105">
                        <MapPin size={32} className="text-red-500 relative z-10 animate-bounce" />
                    </div>
                    <div className={`p-2 text-xs font-medium ${isMe ? 'text-blue-100' : 'text-slate-500 dark:text-slate-300'}`}>
                        Геолокация
                    </div>
                </a>
            </div>
        )}

        {/* Text Content */}
        {message.text && (
          <div className="markdown-content">
            {isMe ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : (
              <ReactMarkdown 
                components={{
                  p: ({node, ...props}) => <p className="mb-1 last:mb-0 whitespace-pre-wrap" {...props} />,
                  code: ({node, ...props}) => <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-pink-600 dark:text-pink-400 font-mono text-xs" {...props} />
                }}
              >
                {message.text}
              </ReactMarkdown>
            )}
          </div>
        )}
        
        {/* Contact Action Button */}
        {isContact && (
            <div className="mt-2 pt-2 border-t border-white/20 dark:border-slate-500/30">
                <button className={`w-full py-1.5 rounded text-sm font-medium transition-colors ${isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-blue-50 dark:bg-slate-600 text-blue-600 dark:text-white hover:bg-blue-100 dark:hover:bg-slate-500'}`}>
                    Написать сообщение
                </button>
            </div>
        )}
        
        {/* Info Footer */}
        <div className={`text-[10px] mt-1 opacity-80 flex items-center gap-1 ${isMe ? 'text-blue-100 justify-end' : 'text-slate-400 dark:text-slate-300 justify-start'}`}>
          {message.isEncrypted && <Lock size={8} className="opacity-70" />}
          {message.isEdited && <span className="flex items-center gap-0.5"><Edit2 size={8}/> изм.</span>}
          <span>{formatTime(message.timestamp)}</span>
          {renderStatus()}
        </div>

        {/* Reactions Display */}
        {message.reactions && message.reactions.length > 0 && (
            <div 
                className={`absolute -bottom-5 ${isMe ? 'right-0' : 'left-0'} flex flex-wrap gap-1 z-10 cursor-pointer`}
                onClick={(e) => { e.stopPropagation(); onContextMenu(e, message); }}
            >
                {message.reactions.map((r, i) => (
                    <span 
                        key={i} 
                        className={`
                            flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs shadow-sm border
                            backdrop-blur-md transition-transform hover:scale-110 active:scale-95 animate-pop-in
                            ${r.userReacted 
                                ? 'bg-blue-100/90 dark:bg-blue-900/80 border-blue-200 dark:border-blue-700' 
                                : 'bg-white/90 dark:bg-slate-800/90 border-gray-100 dark:border-slate-600'}
                        `}
                        style={{ animationDelay: `${i * 50}ms` }}
                    >
                        <span className="text-[14px] leading-none">{r.emoji}</span>
                        {r.count > 1 && (
                            <span className={`text-[10px] font-bold ${r.userReacted ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}>
                                {r.count}
                            </span>
                        )}
                    </span>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
