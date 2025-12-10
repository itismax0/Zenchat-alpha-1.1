
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Contact, Message, AppSettings, MessageType } from '../types';
import { Send, Paperclip, Smile, MoreVertical, Phone, ArrowLeft, Image as ImageIcon, File as FileIcon, X, MapPin, Mic, Trash2, Lock, Reply, Edit2, Check, Pin, List, ChevronDown, Clock, Ban, Eraser, Forward, Wallpaper, BellOff, UserPlus } from 'lucide-react';
import MessageBubble from './MessageBubble';
import Avatar from './Avatar';
import EmojiPicker from './EmojiPicker';
import EncryptionModal from './EncryptionModal';
import SecurityInfoModal from './SecurityInfoModal';
import MessageContextMenu from './MessageContextMenu';
import { ForwardModal, DeleteModal, TranslationModal } from './ActionModals';
import { db } from '../services/db'; 
import { geminiService } from '../services/geminiService';
import { socketService } from '../services/socketService';
import { SAVED_MESSAGES_ID } from '../constants';

interface ChatWindowProps {
  contact: Contact;
  messages: Message[];
  onSendMessage: (text: string, file?: File | null, type?: MessageType, duration?: number, replyToId?: string, isForwarded?: boolean, contactInfo?: any) => void;
  onSendSticker: (url: string) => void;
  onSendLocation: (lat: number, lng: number) => void;
  isTyping: boolean;
  onBack: () => void; 
  appearance: AppSettings['appearance'];
  onOpenProfile: () => void;
  onCall?: () => void; 
  currentUserId?: string; 
  onForwardMessage?: (contactId: string, message: Message) => void;
  
  // New props for context menu features
  onBlockUser?: (contactId: string, isBlocked: boolean) => void;
  onClearHistory?: (contactId: string) => void;
  onSetAutoDelete?: (contactId: string, seconds: number) => void;
  onShareContact?: (contactId: string) => void;
  onChangeWallpaper?: () => void;
  onCreateSecretChat?: (contactId: string) => void;
  isBlocked?: boolean;
}

// Only used for CSS class based presets
const BACKGROUND_THEMES: Record<string, string> = {
  default: 'bg-[#f8fafc] dark:bg-slate-900',
  blue: 'bg-blue-50 dark:bg-blue-950',
  green: 'bg-green-50 dark:bg-green-950',
  pink: 'bg-pink-50 dark:bg-pink-950',
  yellow: 'bg-yellow-50 dark:bg-yellow-950',
  purple: 'bg-purple-50 dark:bg-purple-950',
  slate: 'bg-slate-200 dark:bg-slate-800',
  red: 'bg-red-50 dark:bg-red-950',
  'gradient-1': 'bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-900/40 dark:to-rose-900/40',
  'gradient-2': 'bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-900/40 dark:to-blue-900/40',
  'gradient-3': 'bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40',
  'gradient-4': 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900',
};

const ChatWindow: React.FC<ChatWindowProps> = ({ 
    contact, 
    messages: initialMessages, 
    onSendMessage, 
    onSendSticker, 
    onSendLocation,
    isTyping, 
    onBack, 
    appearance,
    onOpenProfile, 
    onCall, 
    currentUserId,
    onForwardMessage,
    onBlockUser,
    onClearHistory,
    onSetAutoDelete,
    onShareContact,
    onChangeWallpaper,
    onCreateSecretChat,
    isBlocked
}) => {
  const [localMessages, setLocalMessages] = useState<Message[]>(initialMessages);

  const [inputValue, setInputValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Modals
  const [showEncryptionModal, setShowEncryptionModal] = useState(false); // For Secret Chat Key
  const [showSecurityModal, setShowSecurityModal] = useState(false); // For Normal Chat Info

  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });

  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [translationModalOpen, setTranslationModalOpen] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [messageToForward, setMessageToForward] = useState<Message | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [messageToTranslate, setMessageToTranslate] = useState<Message | null>(null);
  const [showForwardSuccess, setShowForwardSuccess] = useState(false);

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  const [allContacts, setAllContacts] = useState<Contact[]>([]);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const showMic = !inputValue.trim() && !selectedFile && !editingMessage;

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);

  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const safeAppearance = appearance || { chatBackground: 'default', textSize: 100, darkMode: false };

  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const pinnedMessages = localMessages.filter(m => m.isPinned);
  const activePinIndexState = useState(0);
  const activePinIndex = activePinIndexState[0];
  const setActivePinIndex = activePinIndexState[1];

  useEffect(() => {
     if (activePinIndex >= pinnedMessages.length && pinnedMessages.length > 0) {
         setActivePinIndex(pinnedMessages.length - 1);
     }
  }, [pinnedMessages.length]);

  const currentPinnedMessage = pinnedMessages.length > 0 ? pinnedMessages[activePinIndex] : null;

  const cyclePinnedMessage = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pinnedMessages.length > 1) {
          const nextIndex = (activePinIndex + 1) % pinnedMessages.length;
          setActivePinIndex(nextIndex);
          scrollToMessage(pinnedMessages[nextIndex].id);
      } else if (pinnedMessages.length === 1) {
          scrollToMessage(pinnedMessages[0].id);
      }
  };

  const getSenderName = (senderId: string) => {
    if (senderId === currentUserId) return 'Вы';
    if (senderId === contact.id) return contact.name;
    if (contact.members) {
        const member = contact.members.find(m => m.id === senderId);
        if (member) return member.name;
    }
    return contact.name;
  };

  useEffect(() => {
    setLocalMessages(initialMessages);
  }, [initialMessages]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleScroll = () => {
      if (messagesContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
          setShowScrollBottom(!isNearBottom);
      }
  };

  useLayoutEffect(() => {
    const lastMessage = localMessages[localMessages.length - 1];
    const isMe = lastMessage?.senderId === currentUserId;

    if (messagesContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;

        if (isMe || isNearBottom) {
            scrollToBottom();
        }
    } else {
        scrollToBottom(false);
    }
  }, [localMessages, isTyping, previewUrl, replyingTo, editingMessage]);

  const scrollToMessage = (messageId: string) => {
      const element = document.getElementById(`msg-${messageId}`);
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('bg-blue-100', 'dark:bg-slate-700/50', 'transition-colors', 'duration-500');
          setTimeout(() => {
              element.classList.remove('bg-blue-100', 'dark:bg-slate-700/50');
          }, 1500);
      }
  };

  useEffect(() => {
     if (currentUserId) {
         const data = db.getData(currentUserId);
         setAllContacts(data.contacts || []);
     }
  }, [currentUserId, forwardModalOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.emoji-trigger') && !target.closest('.attach-trigger')) {
            setShowEmojiPicker(false);
            setShowAttachMenu(false);
        }
        if (headerMenuRef.current && !headerMenuRef.current.contains(target)) {
            setShowHeaderMenu(false);
        }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
        }
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);

      if (contact.type === 'user' && contact.id !== 'gemini-ai' && contact.id !== 'saved-messages') {
          socketService.sendTyping(contact.id, true);
          if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
              socketService.sendTyping(contact.id, false);
          }, 2000);
      }
  };

  const handleSend = () => {
    if (editingMessage) {
        const editedMsg = { ...editingMessage, text: inputValue, isEdited: true };
        const updatedMessages = localMessages.map(m => 
            m.id === editingMessage.id ? editedMsg : m
        );
        setLocalMessages(updatedMessages);
        db.saveData(currentUserId || '', { chatHistory: { [contact.id]: updatedMessages } });
        
        if (contact.id !== 'gemini-ai') {
            socketService.editMessage(editedMsg, contact.id);
        }

        setEditingMessage(null);
        setInputValue('');
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        socketService.sendTyping(contact.id, false);
        return;
    }

    if (inputValue.trim() || selectedFile) {
      onSendMessage(
          inputValue, 
          selectedFile, 
          selectedFile ? (selectedFile.type.startsWith('image/') ? 'image' : 'file') : 'text',
          undefined,
          replyingTo ? replyingTo.id : undefined
      );
      setInputValue('');
      setSelectedFile(null);
      setPreviewUrl(null);
      setReplyingTo(null);

      setTimeout(() => scrollToBottom(), 50);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (contact.type === 'user' && contact.id !== 'gemini-ai') {
          socketService.sendTyping(contact.id, false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setSelectedFile(file);
          setShowAttachMenu(false);
          
          if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (ev) => {
                  setPreviewUrl(ev.target?.result as string);
              };
              reader.readAsDataURL(file);
          } else {
              setPreviewUrl(null);
          }
      }
      e.target.value = '';
  };

  const handleLocationClick = () => {
    setShowAttachMenu(false);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                onSendLocation(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                console.error("Error getting location", error);
                alert("Не удалось получить геолокацию");
            }
        );
    } else {
        alert("Геолокация не поддерживается вашим браузером");
    }
  };

  const startRecording = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  audioChunksRef.current.push(event.data);
              }
          };

          mediaRecorder.start();
          setIsRecording(true);
          setRecordingDuration(0);

          if (contact.type === 'user' && contact.id !== 'gemini-ai') {
              socketService.sendTyping(contact.id, true);
          }

          recordingTimerRef.current = setInterval(() => {
              setRecordingDuration(prev => prev + 1);
          }, 1000);

      } catch (err) {
          console.error("Error accessing microphone:", err);
          alert("Не удалось получить доступ к микрофону. Проверьте разрешения.");
      }
  };

  const stopRecording = (send: boolean) => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.onstop = () => {
              if (send) {
                  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); 
                  const audioFile = new File([audioBlob], 'voice-message.webm', { type: 'audio/webm' });
                  
                  onSendMessage('', audioFile, 'voice', recordingDuration);
              }
              
              mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
              
              setIsRecording(false);
              setRecordingDuration(0);
              mediaRecorderRef.current = null;
              audioChunksRef.current = [];

              if (contact.type === 'user' && contact.id !== 'gemini-ai') {
                  socketService.sendTyping(contact.id, false);
              }
          };
          
          mediaRecorderRef.current.stop();
          if (recordingTimerRef.current) {
              clearInterval(recordingTimerRef.current);
              recordingTimerRef.current = null;
          }
      } else {
          setIsRecording(false);
          setRecordingDuration(0);
      }
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, message: Message) => {
    e.preventDefault();
    if (isSelectionMode) return;
    
    if (navigator.vibrate) navigator.vibrate(50);
    
    let x = 0;
    let y = 0;

    if ('touches' in e) {
        const touch = e.touches[0];
        x = touch.clientX;
        y = touch.clientY;
    } else {
        const mouseEvent = e as React.MouseEvent;
        x = mouseEvent.clientX;
        y = mouseEvent.clientY;
    }

    setMenuAnchor({ x, y });
    setContextMenuMsg(message);
    setIsContextMenuOpen(true);
  };

  const handleMenuAction = async (action: string, message: Message, payload?: any) => {
      setIsContextMenuOpen(false);

      switch (action) {
          case 'react':
              const updatedWithReaction = localMessages.map(m => {
                  if (m.id === message.id) {
                      const reactions = m.reactions || [];
                      const existing = reactions.find(r => r.emoji === payload);
                      let newReactions;
                      
                      if (existing) {
                          if (existing.userReacted) {
                              newReactions = reactions.map(r => r.emoji === payload ? { ...r, count: r.count - 1, userReacted: false } : r).filter(r => r.count > 0);
                          } else {
                              newReactions = reactions.map(r => r.emoji === payload ? { ...r, count: r.count + 1, userReacted: true } : r);
                          }
                      } else {
                          newReactions = [...reactions, { emoji: payload, count: 1, userReacted: true }];
                      }
                      return { ...m, reactions: newReactions };
                  }
                  return m;
              });
              setLocalMessages(updatedWithReaction);
              db.saveData(currentUserId || '', { chatHistory: { [contact.id]: updatedWithReaction } });
              break;

          case 'reply':
              setReplyingTo(message);
              setTimeout(() => inputRef.current?.focus(), 100);
              break;

          case 'copy':
              navigator.clipboard.writeText(message.text);
              break;
            
          case 'translate':
             setMessageToTranslate(message);
             setTranslationModalOpen(true);
             setIsTranslating(true);
             setTranslatedText('');
             try {
                const translation = await geminiService.translateText(message.text);
                setTranslatedText(translation);
             } catch (e) {
                setTranslatedText("Ошибка при переводе.");
             } finally {
                setIsTranslating(false);
             }
             break;

          case 'edit':
              setEditingMessage(message);
              setInputValue(message.text);
              setTimeout(() => inputRef.current?.focus(), 100);
              break;

          case 'pin':
              const newPinnedState = !message.isPinned;
              const pinnedMsgs = localMessages.map(m => 
                 m.id === message.id ? { ...m, isPinned: newPinnedState } : m
              );
              setLocalMessages(pinnedMsgs);
              db.saveData(currentUserId || '', { chatHistory: { [contact.id]: pinnedMsgs } });
              
              if (newPinnedState) {
                  setActivePinIndex(pinnedMsgs.filter(m => m.isPinned).length - 1);
              }
              break;

          case 'delete':
               setMessageToDelete(message);
               setDeleteModalOpen(true);
               break;

          case 'forward':
              setMessageToForward(message);
              setForwardModalOpen(true);
              break;
            
          case 'select':
              setIsSelectionMode(true);
              setSelectedMessageIds([message.id]);
              break;
      }
  };

  const confirmDelete = (forEveryone: boolean) => {
      if (!messageToDelete) return;

      const remainingMessages = localMessages.filter(m => m.id !== messageToDelete.id);
      setLocalMessages(remainingMessages);
      db.saveData(currentUserId || '', { chatHistory: { [contact.id]: remainingMessages } });

      if (forEveryone && contact.id !== 'gemini-ai') {
          // Emit socket event for delete (Mock implementation for now)
      }

      setDeleteModalOpen(false);
      setMessageToDelete(null);
  };

  const confirmForward = (targetContactId: string) => {
      if (!messageToForward || !currentUserId) return;

      if (onForwardMessage) {
        onForwardMessage(targetContactId, messageToForward);
      }
      
      setForwardModalOpen(false);
      setMessageToForward(null);

      setShowForwardSuccess(true);
      setTimeout(() => setShowForwardSuccess(false), 2000);
  };

  const handleToggleSelect = (id: string) => {
      if (selectedMessageIds.includes(id)) {
          setSelectedMessageIds(prev => prev.filter(mid => mid !== id));
      } else {
          setSelectedMessageIds(prev => [...prev, id]);
      }
  };

  const deleteSelected = () => {
      const remainingMessages = localMessages.filter(m => !selectedMessageIds.includes(m.id));
      setLocalMessages(remainingMessages);
      setIsSelectionMode(false);
      setSelectedMessageIds([]);
      db.saveData(currentUserId || '', { chatHistory: { [contact.id]: remainingMessages } });
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- SMART STATUS LOGIC ---
  const formatLastSeen = (timestamp?: number) => {
      if (!timestamp) return 'был(а) недавно';
      const now = Date.now();
      const diff = now - timestamp;
      
      // Less than 1 minute
      if (diff < 60000) return 'был(а) только что';
      
      // Less than 1 hour
      if (diff < 3600000) {
          const mins = Math.floor(diff / 60000);
          // Proper pluralization for Russian 'minutes'
          let suffix = 'минут';
          const lastDigit = mins % 10;
          const lastTwoDigits = mins % 100;
          
          if (lastDigit === 1 && lastTwoDigits !== 11) suffix = 'минуту';
          else if ([2,3,4].includes(lastDigit) && ![12,13,14].includes(lastTwoDigits)) suffix = 'минуты';
          
          return `был(а) ${mins} ${suffix} назад`;
      }
      
      const date = new Date(timestamp);
      const today = new Date();
      const isToday = date.getDate() === today.getDate() && 
                      date.getMonth() === today.getMonth() && 
                      date.getFullYear() === today.getFullYear();
      
      if (isToday) {
          return `был(а) сегодня в ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
      }
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = date.getDate() === yesterday.getDate() && 
                          date.getMonth() === yesterday.getMonth() && 
                          date.getFullYear() === yesterday.getFullYear();
      
      if (isYesterday) {
          return `был(а) вчера в ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
      }
      
      return `был(а) ${date.toLocaleDateString('ru-RU')}`;
  };

  const getStatusText = () => {
      if (contact.id === SAVED_MESSAGES_ID) return '';
      if (contact.id === 'gemini-ai') return 'bot';
      
      if (isTyping) return 'печатает...';
      
      if (contact.type === 'channel') return `${contact.membersCount || 245} подписчиков`;
      if (contact.type === 'group') return `${contact.membersCount || 3} участников`;
      
      if (contact.isOnline) return 'в сети';
      
      return formatLastSeen(contact.lastSeen);
  };

  // BACKGROUND LOGIC
  const bgSetting = safeAppearance.chatBackground;
  
  // Check if it's a custom background (starts with data:, http, or is a url)
  const isCustomBg = bgSetting && (bgSetting.startsWith('data:') || bgSetting.startsWith('http') || bgSetting.startsWith('url'));
  
  // If custom, use inline style. If preset, use class from map.
  const bgStyle = isCustomBg ? { 
      backgroundImage: `url(${bgSetting})`, 
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
  } : {};
  
  const bgClass = !isCustomBg ? (BACKGROUND_THEMES[bgSetting] || BACKGROUND_THEMES['default']) : 'bg-white dark:bg-slate-900';

  return (
    <div 
        className={`flex flex-col h-full relative transition-colors duration-200 ${bgClass}`}
        style={{ fontSize: `${safeAppearance.textSize}%`, ...bgStyle }}
    >
       {!isCustomBg && (
           <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" 
            // Removed pattern as per previous request, keeping minimal
           />
       )}

      {showForwardSuccess && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[150] bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium animate-in fade-in slide-in-from-top-5 duration-300">
              Сообщение переслано
          </div>
      )}

      {showScrollBottom && (
          <button 
             onClick={() => scrollToBottom()}
             className="absolute bottom-20 right-4 z-40 p-2 bg-white dark:bg-slate-700 rounded-full shadow-lg text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-all animate-pop-in"
          >
              <ChevronDown size={24} />
          </button>
      )}

      {/* MODALS */}
      <EncryptionModal 
        isOpen={showEncryptionModal}
        onClose={() => setShowEncryptionModal(false)}
        contact={contact}
      />

      <SecurityInfoModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
      />

      <ForwardModal 
          isOpen={forwardModalOpen}
          onClose={() => setForwardModalOpen(false)}
          contacts={allContacts}
          onForward={confirmForward}
      />

      <DeleteModal 
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onDelete={confirmDelete}
          isMe={messageToDelete?.senderId === currentUserId}
      />

      <TranslationModal 
          isOpen={translationModalOpen}
          onClose={() => setTranslationModalOpen(false)}
          originalText={messageToTranslate?.text || ''}
          translatedText={translatedText}
          isLoading={isTranslating}
      />

      {contextMenuMsg && (
          <MessageContextMenu 
             message={contextMenuMsg}
             isOpen={isContextMenuOpen}
             onClose={() => setIsContextMenuOpen(false)}
             onAction={handleMenuAction}
             isMe={contextMenuMsg.senderId === currentUserId}
             anchorPoint={menuAnchor}
          />
      )}

      <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={handleFileSelect} />
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

      <header 
        className="flex-none px-4 py-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-b border-gray-200 dark:border-slate-700 flex justify-between items-center z-20 sticky top-0 transition-colors"
      >
        {isSelectionMode ? (
             <div className="flex items-center gap-4 w-full animate-in fade-in slide-in-from-top-2 duration-200">
                 <button onClick={() => { setIsSelectionMode(false); setSelectedMessageIds([]); }} className="text-gray-500 hover:text-gray-700 btn-press">
                     <X size={20} />
                 </button>
                 <span className="font-semibold text-slate-800 dark:text-white flex-1 text-center">
                     Выбрано: {selectedMessageIds.length}
                 </span>
                 <button onClick={deleteSelected} className="text-red-500 hover:text-red-600 btn-press">
                     <Trash2 size={20} />
                 </button>
             </div>
        ) : (
            <>
                <div className="flex items-center gap-3 cursor-pointer group" onClick={onOpenProfile}>
                    <button onClick={(e) => { e.stopPropagation(); onBack(); }} className="md:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 btn-press p-1">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="transition-transform group-active:scale-95 duration-200">
                         <Avatar src={contact.avatarUrl} alt={contact.name} size="md" id={contact.id} />
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h2 className={`text-slate-900 dark:text-white font-semibold text-sm leading-tight ${contact.isSecret ? 'text-green-600 dark:text-green-400' : ''}`}>
                                {contact.name}
                            </h2>
                            {contact.autoDelete && contact.autoDelete > 0 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSetAutoDelete?.(contact.id, 0); }}
                                    className="text-blue-500 hover:text-blue-600"
                                    title={`Автоудаление через ${Math.round(contact.autoDelete / 3600)}ч`}
                                >
                                    <Clock size={12} strokeWidth={2.5} />
                                </button>
                            )}
                            <button 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (contact.isSecret) {
                                        setShowEncryptionModal(true); 
                                    } else {
                                        setShowSecurityModal(true);
                                    }
                                }}
                                className={`${contact.isSecret ? 'text-green-500 hover:text-green-600' : 'text-gray-400 hover:text-green-500'} transition-colors focus:outline-none`}
                                title={contact.isSecret ? "Секретный чат (E2EE)" : "Зашифровано"}
                            >
                                <Lock size={12} strokeWidth={2.5} />
                            </button>
                        </div>
                        <p className={`text-xs font-medium ${contact.isOnline ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'} animate-fade-in`}>
                            {getStatusText()}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onCall?.(); }} 
                        className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors text-blue-500 btn-press"
                    >
                        <Phone size={20} />
                    </button>
                    
                    <div className="relative" ref={headerMenuRef}>
                        <button 
                            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors btn-press"
                        >
                            <MoreVertical size={20} />
                        </button>
                        
                        {showHeaderMenu && (
                            <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 py-1 z-50 animate-dropdown origin-top-right overflow-hidden">
                                {contact.type === 'user' && (
                                    <>
                                    <button onClick={() => { setShowHeaderMenu(false); onChangeWallpaper?.(); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors">
                                        <span className="font-medium text-sm">Изменить обои</span>
                                        <Wallpaper size={18} className="text-gray-500" />
                                    </button>
                                    
                                    {!contact.isSecret && (
                                        <button onClick={() => { setShowHeaderMenu(false); onCreateSecretChat?.(contact.id); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors">
                                            <span className="font-medium text-sm">Начать секретный чат</span>
                                            <Lock size={18} className="text-green-500" />
                                        </button>
                                    )}

                                    <button onClick={() => { setShowHeaderMenu(false); onShareContact?.(contact.id); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors">
                                        <span className="font-medium text-sm">Отправить контакт</span>
                                        <Forward size={18} className="text-gray-500" />
                                    </button>
                                    <button onClick={() => { setShowHeaderMenu(false); onSetAutoDelete?.(contact.id, 0); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors">
                                        <span className="font-medium text-sm flex items-center gap-2">
                                            Автоудаление
                                            {contact.autoDelete && contact.autoDelete > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded">Вкл</span>}
                                        </span>
                                        <Clock size={18} className="text-gray-500" />
                                    </button>
                                    <button onClick={() => { setShowHeaderMenu(false); onClearHistory?.(contact.id); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors">
                                        <span className="font-medium text-sm">Удалить переписку</span>
                                        <Eraser size={18} className="text-gray-500" />
                                    </button>
                                    <button onClick={() => { setShowHeaderMenu(false); onBlockUser?.(contact.id, !isBlocked); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors">
                                        <span className="font-medium text-sm">{isBlocked ? 'Разблокировать' : 'Заблокировать'}</span>
                                        <Ban size={18} />
                                    </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </>
        )}
      </header>

      {currentPinnedMessage && !isSelectionMode && (
          <div 
             className="sticky top-[61px] md:top-[69px] z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center cursor-pointer shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-all animate-in slide-in-from-top-5 duration-300"
             onClick={cyclePinnedMessage}
          >
              <div className="flex items-center gap-3 overflow-hidden">
                  <div className="h-8 w-0.5 bg-blue-500 rounded-full flex-shrink-0"></div>
                  <div className="flex flex-col overflow-hidden">
                      <h4 className="text-blue-500 text-xs font-bold flex items-center gap-1">
                          {pinnedMessages.length > 1 ? `Закрепленное сообщение #${activePinIndex + 1}` : 'Закрепленное сообщение'}
                      </h4>
                      <p key={currentPinnedMessage.id} className="text-sm text-slate-700 dark:text-slate-300 truncate animate-fade-in">
                          {currentPinnedMessage.text || (currentPinnedMessage.type === 'image' ? 'Фотография' : 'Вложение')}
                      </p>
                  </div>
              </div>
              <div className="flex items-center gap-2">
                 {pinnedMessages.length > 1 && (
                     <div className="text-xs text-gray-400 bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                         {activePinIndex + 1}/{pinnedMessages.length}
                     </div>
                 )}
                 <button className="p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full transition-colors">
                      {pinnedMessages.length > 1 ? <List size={16} /> : <Pin size={16} />}
                 </button>
              </div>
          </div>
      )}

      <div 
          className="flex-1 overflow-y-auto p-4 md:p-6 z-0 scroll-smooth"
          ref={messagesContainerRef}
          onScroll={handleScroll}
      >
        <div className="max-w-3xl mx-auto flex flex-col justify-end min-h-full">
            
            <div className="flex justify-center mb-6">
                <button 
                    onClick={() => contact.isSecret ? setShowEncryptionModal(true) : setShowSecurityModal(true)}
                    className="bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-[10px] md:text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-yellow-200 dark:hover:bg-yellow-900/40 transition-colors cursor-pointer btn-press"
                >
                    <Lock size={10} />
                    <span>Сообщения и звонки защищены сквозным шифрованием</span>
                </button>
            </div>

            <div className="text-center text-xs text-gray-400 my-4 uppercase tracking-widest opacity-80">Сегодня</div>
            
            {localMessages.map((msg) => (
            <MessageBubble 
                key={msg.id} 
                message={msg} 
                currentUserId={currentUserId} 
                onContextMenu={handleContextMenu}
                isSelectionMode={isSelectionMode}
                isSelected={selectedMessageIds.includes(msg.id)}
                onToggleSelect={handleToggleSelect}
            />
            ))}

            {isTyping && (
                <div className="flex justify-start mb-4 animate-slide-up">
                    <div className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm transition-colors">
                        <div className="flex space-x-1 h-2 items-center">
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                        </div>
                    </div>
                </div>
            )}
            
            <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      <div className="flex-none bg-white dark:bg-slate-800 p-3 md:p-4 border-t border-gray-200 dark:border-slate-700 z-10 transition-colors safe-area-bottom">
        
        {isBlocked ? (
            <div className="max-w-3xl mx-auto flex justify-center">
                <button 
                    onClick={() => onBlockUser?.(contact.id, false)}
                    className="w-full py-3 bg-white dark:bg-slate-800 text-slate-800 dark:text-white uppercase tracking-widest text-sm font-bold border-t border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                >
                    РАЗБЛОКИРОВАТЬ
                </button>
            </div>
        ) : (
            <div className="max-w-3xl mx-auto">
                {(replyingTo || editingMessage) && (
                    <div className="flex items-center justify-between mb-2 px-4 py-2 bg-gray-50 dark:bg-slate-700/50 rounded-lg border-l-4 border-blue-500 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-blue-500 text-sm font-semibold mb-0.5">
                                {editingMessage ? <Edit2 size={14}/> : <Reply size={14}/>}
                                <span>{editingMessage ? 'Редактирование' : `Ответ ${replyingTo ? getSenderName(replyingTo.senderId) : 'пользователю'}`}</span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {editingMessage ? editingMessage.text : replyingTo?.text}
                            </p>
                        </div>
                        <button 
                            onClick={() => { setReplyingTo(null); setEditingMessage(null); setInputValue(''); }}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-full text-gray-400 btn-press"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                <div className="flex items-end gap-2 relative">
                
                {selectedFile && (
                    <div className="absolute bottom-full left-0 mb-3 ml-12 bg-white dark:bg-slate-800 p-2 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 flex items-start gap-3 animate-pop-in origin-bottom-left">
                        {previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded-md" />
                        ) : (
                            <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-md flex items-center justify-center">
                                <FileIcon size={24} className="text-gray-400" />
                            </div>
                        )}
                        <div className="max-w-[150px]">
                            <p className="text-sm font-medium truncate text-slate-700 dark:text-slate-200">{selectedFile.name}</p>
                            <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} КБ</p>
                        </div>
                        <button 
                            onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                            className="text-gray-400 hover:text-red-500 btn-press"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {!isRecording ? (
                    <>
                        <div className="relative attach-trigger">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowAttachMenu(!showAttachMenu); setShowEmojiPicker(false); }}
                                className={`p-2 transition-all rounded-full btn-press ${showAttachMenu ? 'bg-gray-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rotate-45' : 'text-gray-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <Paperclip size={20} />
                            </button>
                            {showAttachMenu && (
                                <div className="absolute bottom-full left-0 mb-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden py-1 z-20 animate-pop-in origin-bottom-left">
                                    <button 
                                        onClick={() => imageInputRef.current?.click()}
                                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                            <ImageIcon size={18} />
                                        </div>
                                        <span className="text-sm font-medium">Фото или видео</span>
                                    </button>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
                                            <FileIcon size={18} />
                                        </div>
                                        <span className="text-sm font-medium">Файл</span>
                                    </button>
                                    <button 
                                        onClick={handleLocationClick}
                                        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                            <MapPin size={18} />
                                        </div>
                                        <span className="text-sm font-medium">Геолокация</span>
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 bg-gray-50 dark:bg-slate-700/50 rounded-2xl border border-gray-200 dark:border-slate-600 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900 focus-within:border-blue-300 dark:focus-within:border-blue-500 input-transition flex items-end">
                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={contact.type === 'channel' ? "Опубликовать в канал..." : (selectedFile ? "Добавить подпись..." : "Написать сообщение...")}
                                rows={1}
                                className="w-full bg-transparent border-none focus:ring-0 outline-none resize-none py-3 px-4 text-slate-800 dark:text-white placeholder-gray-400 max-h-32 min-h-[44px] text-base"
                                style={{ height: 'auto', overflow: 'hidden' }}
                                onInput={(e) => {
                                    const target = e.target as HTMLTextAreaElement;
                                    target.style.height = 'auto';
                                    target.style.height = `${target.scrollHeight}px`;
                                }}
                            />
                            
                            <div className="relative emoji-trigger">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(!showEmojiPicker); setShowAttachMenu(false); }}
                                    className={`p-3 transition-colors rounded-full btn-press ${showEmojiPicker ? 'text-blue-500' : 'text-gray-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    <Smile size={20} />
                                </button>
                                {showEmojiPicker && (
                                <EmojiPicker 
                                        onSelectEmoji={(emoji) => setInputValue(prev => prev + emoji)} 
                                        onSelectSticker={(url) => {
                                            onSendSticker(url);
                                            setShowEmojiPicker(false);
                                        }}
                                />
                                )}
                            </div>
                        </div>

                        <button 
                            onClick={showMic ? startRecording : handleSend}
                            className={`p-3 rounded-full shadow-md text-white transition-all transform hover:scale-105 active:scale-95 flex-shrink-0 flex items-center justify-center ${
                                showMic 
                                    ? 'bg-blue-500 hover:bg-blue-600' 
                                    : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {showMic ? <Mic size={20} /> : (editingMessage ? <Check size={20} /> : <Send size={20} className={inputValue.trim() || selectedFile ? 'ml-0.5' : ''} />)}
                        </button>
                    </>
                ) : (
                    <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-between px-2 animate-in fade-in duration-200">
                        <div className="flex items-center gap-3">
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-slate-800 dark:text-white font-mono font-medium">
                                {formatTime(recordingDuration)}
                            </span>
                            <span className="text-sm text-gray-400">Запись...</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => stopRecording(false)}
                                className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors btn-press"
                            >
                                <Trash2 size={20} />
                            </button>
                            <button 
                                onClick={() => stopRecording(true)}
                                className="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors shadow-md btn-press"
                            >
                                <Send size={20} className="ml-0.5" />
                            </button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ChatWindow;
