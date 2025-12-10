
import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message } from '../types';
import Avatar from './Avatar';
import { X, Mail, Bell, Image as ImageIcon, FileText, Link as LinkIcon, Users, ChevronRight, Shield, UserX, Clock, Brush, Ban, Heart, Link, Activity, BellOff, Info, Phone, Video, Search, MoreHorizontal, MapPin, Calendar, Cake, Lock, Forward, Eraser } from 'lucide-react';
import { SAVED_MESSAGES_ID } from '../constants';

interface ProfileInfoProps {
  contact: Contact;
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  onToggleMute?: (contactId: string) => void;
  onBlockUser?: (contactId: string, isBlocked: boolean) => void;
  onClearHistory?: (contactId: string) => void;
  onSetAutoDelete?: (contactId: string, seconds: number) => void;
  onShareContact?: (contactId: string) => void;
  onChangeWallpaper?: () => void;
  onCreateSecretChat?: (contactId: string) => void;
  isBlocked?: boolean;
}

// Telegram-like colors mapping
const PROFILE_COLORS: Record<string, string> = {
    red: 'bg-gradient-to-br from-red-500 to-red-600',
    orange: 'bg-gradient-to-br from-orange-500 to-orange-600',
    blue: 'bg-gradient-to-br from-blue-500 to-blue-600',
    violet: 'bg-gradient-to-br from-violet-500 to-violet-600',
    green: 'bg-gradient-to-br from-green-500 to-green-600',
    cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
    pink: 'bg-gradient-to-br from-pink-500 to-pink-600',
    gray: 'bg-gradient-to-br from-slate-500 to-slate-600',
    default: 'bg-gradient-to-br from-slate-500 to-slate-600'
};

const ProfileInfo: React.FC<ProfileInfoProps> = ({ 
    contact, 
    isOpen, 
    onClose, 
    messages, 
    onToggleMute,
    onBlockUser,
    onClearHistory,
    onSetAutoDelete,
    onShareContact,
    onChangeWallpaper,
    onCreateSecretChat,
    isBlocked = false
}) => {
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links'>('media');
  const [showMembers, setShowMembers] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
              setShowMoreMenu(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const isUser = contact.type === 'user';
  const isGroup = contact.type === 'group';
  const isChannel = contact.type === 'channel';
  const isMuted = contact.isMuted;
  const isSavedMessages = contact.id === SAVED_MESSAGES_ID;

  // Filter messages
  const mediaMessages = messages.filter(m => m.type === 'image' && m.attachmentUrl);
  const fileMessages = messages.filter(m => m.type === 'file');
  const linkMessages = messages.filter(m => m.type === 'text' && /(https?:\/\/[^\s]+)/g.test(m.text));

  const extractFirstLink = (text: string) => {
    const match = text.match(/(https?:\/\/[^\s]+)/);
    return match ? match[0] : '';
  };

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'был(а) недавно';
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
    
    if (isToday) return `был(а) сегодня в ${date.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'})}`;
    return `был(а) ${date.toLocaleDateString('ru-RU')}`;
  };

  const getProfileBackgroundClass = () => {
      if (isSavedMessages) return PROFILE_COLORS.blue;
      if (contact.profileColor && PROFILE_COLORS[contact.profileColor]) {
          return PROFILE_COLORS[contact.profileColor];
      }
      return PROFILE_COLORS.default;
  };

  const renderBackgroundPattern = () => {
      if (!contact.profileBackgroundEmoji) return null;
      // Create a grid of emojis
      const emojis = Array(20).fill(contact.profileBackgroundEmoji);
      return (
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
              <div className="grid grid-cols-5 gap-8 p-4 transform rotate-12 scale-150">
                  {emojis.map((emoji, i) => (
                      <span key={i} className="text-4xl select-none filter blur-[0.5px]">{emoji}</span>
                  ))}
              </div>
          </div>
      );
  };

  const renderActionButtons = () => (
      <div className="flex items-center justify-center gap-2 w-full mt-4 z-10 relative">
          <button className="flex flex-col items-center gap-1 min-w-[64px] group">
              <div className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors shadow-sm border border-white/10">
                  <Phone size={20} className="text-white" />
              </div>
              <span className="text-[10px] text-white/90 font-medium">Звонок</span>
          </button>
          <button className="flex flex-col items-center gap-1 min-w-[64px] group">
              <div className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors shadow-sm border border-white/10">
                  <Video size={20} className="text-white" />
              </div>
              <span className="text-[10px] text-white/90 font-medium">Видео</span>
          </button>
          <button 
            className="flex flex-col items-center gap-1 min-w-[64px] group"
            onClick={() => onToggleMute && onToggleMute(contact.id)}
          >
              <div className={`w-10 h-10 rounded-xl ${isMuted ? 'bg-white text-slate-800' : 'bg-white/20 text-white hover:bg-white/30'} backdrop-blur-md flex items-center justify-center transition-all shadow-sm border border-white/10`}>
                  {isMuted ? <BellOff size={20} /> : <Bell size={20} />}
              </div>
              <span className="text-[10px] text-white/90 font-medium">{isMuted ? 'Вкл.' : 'Звук'}</span>
          </button>
          <button className="flex flex-col items-center gap-1 min-w-[64px] group">
              <div className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors shadow-sm border border-white/10">
                  <Search size={20} className="text-white" />
              </div>
              <span className="text-[10px] text-white/90 font-medium">Поиск</span>
          </button>
          <div className="relative" ref={moreMenuRef}>
            <button 
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="flex flex-col items-center gap-1 min-w-[64px] group"
            >
                <div className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md flex items-center justify-center transition-colors shadow-sm border border-white/10">
                    <MoreHorizontal size={20} className="text-white" />
                </div>
                <span className="text-[10px] text-white/90 font-medium">Ещё</span>
            </button>
            {showMoreMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/10 py-1 z-50 animate-dropdown origin-top-right overflow-hidden">
                    <button onClick={() => { setShowMoreMenu(false); onChangeWallpaper?.(); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/10 text-white transition-colors border-b border-white/10">
                        <span className="font-medium text-sm">Изменить обои</span>
                        <ImageIcon size={18} />
                    </button>
                    
                    {!contact.isSecret && (
                        <button onClick={() => { setShowMoreMenu(false); onClose(); onCreateSecretChat?.(contact.id); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/10 text-white transition-colors border-b border-white/10">
                            <span className="font-medium text-sm">Начать секретный чат</span>
                            <Lock size={18} className="text-green-400" />
                        </button>
                    )}

                    <button onClick={() => { setShowMoreMenu(false); onShareContact?.(contact.id); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/10 text-white transition-colors border-b border-white/10">
                        <span className="font-medium text-sm">Отправить контакт</span>
                        <Forward size={18} />
                    </button>
                    
                    <button onClick={() => { setShowMoreMenu(false); onSetAutoDelete?.(contact.id, 0); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/10 text-white transition-colors">
                        <span className="font-medium text-sm flex items-center gap-2">
                            Автоудаление
                            {contact.autoDelete && contact.autoDelete > 0 && <span className="text-[10px] bg-white/20 px-1.5 rounded">Вкл</span>}
                        </span>
                        <Clock size={18} />
                    </button>
                    <button onClick={() => { setShowMoreMenu(false); onClearHistory?.(contact.id); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-white/10 text-white transition-colors">
                        <span className="font-medium text-sm">Удалить переписку</span>
                        <Eraser size={18} />
                    </button>
                    <button onClick={() => { setShowMoreMenu(false); onBlockUser?.(contact.id, !isBlocked); }} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors">
                        <span className="font-medium text-sm">{isBlocked ? 'Разблокировать' : 'Заблокировать'}</span>
                        <Ban size={18} />
                    </button>
                </div>
            )}
          </div>
      </div>
  );

  const renderGroupMenu = () => (
      <div className="p-4 space-y-1">
          <div className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors active:scale-[0.99]">
              <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-green-500 text-white rounded-lg">
                    <Clock size={18} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">История чата</span>
              </div>
              <span className="text-sm text-gray-400 flex items-center gap-1">
                  Видна <ChevronRight size={16} />
              </span>
          </div>

          <div 
            onClick={() => setShowMembers(true)}
            className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors active:scale-[0.99]"
          >
              <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-cyan-500 text-white rounded-lg">
                    <Users size={18} />
                  </div>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Участники</span>
              </div>
              <span className="text-sm text-gray-400 flex items-center gap-1">
                  {contact.members?.length || contact.membersCount || 1} <ChevronRight size={16} />
              </span>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/20 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div 
        className="w-full sm:w-96 bg-white dark:bg-slate-800 h-full shadow-2xl flex flex-col animate-slide-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - now transparent absolute on top of colored background */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20">
            {showMembers ? (
                 <div className="flex items-center gap-2 animate-view-transition bg-black/20 backdrop-blur-md rounded-full px-3 py-1">
                     <button onClick={() => setShowMembers(false)} className="text-white flex items-center gap-1 text-sm font-medium btn-press">
                         <ChevronRight className="rotate-180" size={20} />
                         Назад
                     </button>
                 </div>
            ) : (
                <>
                    <div></div> {/* Spacer */}
                    <button 
                        onClick={onClose} 
                        className="p-2 bg-black/20 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-colors btn-press"
                    >
                        <X size={20} />
                    </button>
                </>
            )}
        </div>

        <div className="flex-1 overflow-y-auto">
            {!showMembers ? (
                <>
                    {/* Custom Profile Header */}
                    <div className={`relative pt-16 pb-6 px-6 flex flex-col items-center ${getProfileBackgroundClass()} animate-fade-in transition-colors duration-500`}>
                        {renderBackgroundPattern()}
                        
                        <div className="mb-3 shadow-xl rounded-full relative z-10 border-4 border-white/10">
                            <Avatar src={contact.avatarUrl} alt={contact.name} size="xl" id={contact.id} />
                        </div>
                        
                        <div className="text-center z-10">
                            <h2 className={`text-2xl font-bold text-white flex items-center justify-center gap-1.5 drop-shadow-sm ${contact.isSecret ? 'text-green-200' : ''}`}>
                                {contact.name}
                                {contact.statusEmoji && (
                                    <span className="text-2xl" title="Статус">{contact.statusEmoji}</span>
                                )}
                                {contact.isSecret && <Lock size={20} className="text-green-300" />}
                            </h2>
                            <p className="text-sm text-white/80 font-medium mt-1 drop-shadow-sm">
                                {isUser && (contact.isOnline ? 'в сети' : formatLastSeen(contact.lastSeen))}
                                {isGroup && `${contact.membersCount || contact.members?.length || 0} участников`}
                                {isChannel && `${contact.membersCount || 0} подписчиков`}
                            </p>
                        </div>

                        {isUser && !isSavedMessages && renderActionButtons()}
                    </div>

                    {/* Group Specific Menu */}
                    {(isGroup || isChannel) && renderGroupMenu()}

                    {/* User Info Section */}
                    {isUser && (
                         <div className="p-4 space-y-4 animate-fade-in">
                            {/* Phone */}
                            {contact.phoneNumber && (
                                <div className="flex items-center gap-4 p-2">
                                    <Phone className="text-gray-400" size={22} />
                                    <div>
                                        <p className="text-slate-800 dark:text-white text-sm">{contact.phoneNumber}</p>
                                        <p className="text-xs text-gray-500">Телефон</p>
                                    </div>
                                </div>
                            )}

                             {/* Address (New) */}
                             {contact.address && (
                                <div className="flex items-center gap-4 p-2">
                                    <MapPin className="text-gray-400" size={22} />
                                    <div>
                                        <p className="text-slate-800 dark:text-white text-sm">{contact.address}</p>
                                        <p className="text-xs text-gray-500">Адрес</p>
                                    </div>
                                </div>
                            )}

                             {/* BirthDate (New) */}
                             {contact.birthDate && (
                                <div className="flex items-center gap-4 p-2">
                                    <Cake className="text-gray-400" size={22} />
                                    <div>
                                        <p className="text-slate-800 dark:text-white text-sm">
                                            {new Date(contact.birthDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                                        </p>
                                        <p className="text-xs text-gray-500">Дата рождения</p>
                                    </div>
                                </div>
                            )}
                             
                            {/* Bio */}
                            {contact.bio && (
                                <div className="flex items-center gap-4 p-2">
                                    <Info className="text-gray-400" size={22} />
                                    <div>
                                        <p className="text-slate-800 dark:text-white text-sm whitespace-pre-wrap">{contact.bio}</p>
                                        <p className="text-xs text-gray-500">О себе</p>
                                    </div>
                                </div>
                            )}

                            {/* Username / Email */}
                            <div className="flex items-center gap-4 p-2">
                                <Mail className="text-gray-400" size={22} />
                                <div>
                                    <p className="text-slate-800 dark:text-white text-sm">
                                        {contact.username ? `@${contact.username}` : contact.email}
                                    </p>
                                    <p className="text-xs text-gray-500">Имя пользователя</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Media Tabs */}
                    <div className="mt-2 border-t border-gray-100 dark:border-slate-700 animate-fade-in">
                        <div className="flex overflow-x-auto scrollbar-hide p-2 gap-2">
                            <button 
                                onClick={() => setActiveTab('media')}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors btn-press ${activeTab === 'media' ? 'bg-gray-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'}`}
                            >
                                Медиа
                            </button>
                            <button 
                                onClick={() => setActiveTab('files')}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors btn-press ${activeTab === 'files' ? 'bg-gray-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'}`}
                            >
                                Файлы
                            </button>
                            <button 
                                onClick={() => setActiveTab('links')}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors btn-press ${activeTab === 'links' ? 'bg-gray-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400'}`}
                            >
                                Ссылки
                            </button>
                        </div>
                        
                        <div className="min-h-[200px]">
                            {activeTab === 'media' && (
                                mediaMessages.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-1 p-1 animate-fade-in">
                                        {mediaMessages.map((msg) => (
                                            <div key={msg.id} className="aspect-square bg-gray-100 dark:bg-slate-700 rounded overflow-hidden">
                                                <img src={msg.attachmentUrl} alt="media" className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity cursor-pointer" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-gray-400 text-sm animate-fade-in">
                                        Нет фотографий
                                    </div>
                                )
                            )}

                            {activeTab === 'files' && (
                                fileMessages.length > 0 ? (
                                    <div className="p-2 space-y-2 animate-fade-in">
                                        {fileMessages.map(msg => (
                                            <div key={msg.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer">
                                                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                                    <FileText size={20} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{msg.fileName || 'Документ'}</p>
                                                    <p className="text-xs text-gray-500">{msg.fileSize || 'unknown'} • {new Date(msg.timestamp).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-gray-400 text-sm animate-fade-in">
                                        Нет файлов
                                    </div>
                                )
                            )}

                            {activeTab === 'links' && (
                                linkMessages.length > 0 ? (
                                    <div className="p-2 space-y-2 animate-fade-in">
                                        {linkMessages.map(msg => {
                                            const link = extractFirstLink(msg.text);
                                            return (
                                                <div key={msg.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors cursor-pointer">
                                                    <div className="p-2.5 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-lg mt-0.5">
                                                        <LinkIcon size={20} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-500 hover:underline truncate block" onClick={e => e.stopPropagation()}>
                                                            {link}
                                                        </a>
                                                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">
                                                            {msg.text.replace(link, '').trim() || 'Ссылка'}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 mt-1">{new Date(msg.timestamp).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-8 text-center text-gray-400 text-sm animate-fade-in">
                                        Нет ссылок
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </>
            ) : (
                <div className="p-4 space-y-2 animate-view-transition">
                    {contact.members && contact.members.length > 0 ? (
                        contact.members.map((member) => (
                            <div key={member.id} className="flex items-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                <Avatar src={member.avatarUrl} alt={member.name} size="md" />
                                <div className="ml-3 flex-1">
                                    <h4 className="text-sm font-medium text-slate-800 dark:text-white flex items-center gap-1">
                                        {member.name}
                                        {member.role === 'owner' && <span className="text-[10px] text-gray-400 ml-auto">владелец</span>}
                                        {member.role === 'admin' && <span className="text-[10px] text-gray-400 ml-auto">админ</span>}
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {member.lastSeen || 'был(а) недавно'}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-center text-gray-500 p-4">Нет участников</p>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ProfileInfo;
