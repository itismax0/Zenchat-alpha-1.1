
import React, { useState, useRef, useEffect } from 'react';
import { Contact, ContactType, UserProfile } from '../types';
import Avatar from './Avatar';
import { Search, X, Settings, Edit, Users, Megaphone, Globe, AtSign } from 'lucide-react';
import { SAVED_MESSAGES_ID } from '../constants';

interface SidebarProps {
  contacts: Contact[];
  activeContactId: string | null;
  onSelectContact: (id: string) => void;
  isOpenMobile: boolean;
  closeMobile: () => void;
  onOpenSettings: () => void;
  onCreateChat: (type: ContactType) => void;
  onSearchUsers: (query: string) => Promise<UserProfile[]>;
  onAddContact: (profile: UserProfile) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  contacts,
  activeContactId,
  onSelectContact,
  isOpenMobile,
  closeMobile,
  onOpenSettings,
  onCreateChat,
  onSearchUsers,
  onAddContact
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const [globalResults, setGlobalResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const safeContacts = Array.isArray(contacts) ? contacts : [];
  
  const filteredContacts = safeContacts.filter((c) => {
    if (!c) return false;
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    
    // SAFEGUARDS
    const name = c.name || '';
    const username = c.username || '';
    const bio = c.bio || '';
    const desc = c.description || '';
    const phone = c.phoneNumber || '';

    if (name.toLowerCase().includes(term)) return true;
    const cleanTerm = term.replace('@', '');
    if (username.toLowerCase().includes(cleanTerm)) return true;
    if (bio.toLowerCase().includes(term)) return true;
    if (desc.toLowerCase().includes(term)) return true;
    if (phone.includes(term)) return true;
    return false;
  });

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
        if (searchTerm.trim().length >= 3) {
            setIsSearching(true);
            try {
                const results = await onSearchUsers(searchTerm);
                const newResults = results.filter(user => 
                    !safeContacts.some(contact => contact && contact.id === user.id)
                );
                setGlobalResults(newResults);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsSearching(false);
            }
        } else {
            setGlobalResults([]);
            setIsSearching(false);
        }
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, contacts, onSearchUsers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-40 w-full sm:w-80 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl border-r border-gray-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 flex flex-col h-full shadow-xl md:shadow-none
      `}
    >
      {/* Header */}
      <div className="px-4 py-4 flex items-center justify-between border-b border-gray-50 dark:border-slate-700/50 sticky top-0 z-10">
        <button className="md:hidden p-2 text-gray-500 btn-press" onClick={closeMobile}>
          <X size={20} />
        </button>
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent ml-2 md:ml-0">ZenChat</h1>
        <div className="flex gap-2">
            <div className="relative" ref={createMenuRef}>
              <button 
                  onClick={() => setShowCreateMenu(!showCreateMenu)}
                  className={`p-2 transition-colors rounded-full btn-press ${showCreateMenu ? 'bg-gray-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'text-gray-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
              >
                  <Edit size={18} />
              </button>
              {showCreateMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 py-2 z-50 animate-dropdown origin-top-right">
                  <button onClick={() => { setShowCreateMenu(false); onCreateChat('group'); }} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors active:scale-95 duration-100">
                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><Users size={16} /></div>
                    <span className="font-medium">Новая группа</span>
                  </button>
                  <button onClick={() => { setShowCreateMenu(false); onCreateChat('channel'); }} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors active:scale-95 duration-100">
                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg"><Megaphone size={16} /></div>
                    <span className="font-medium">Новый канал</span>
                  </button>
                </div>
              )}
            </div>
            <button onClick={onOpenSettings} className="p-2 text-gray-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-full hover:bg-gray-50 dark:hover:bg-slate-700 btn-press">
                <Settings size={18} />
            </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={16} />
          <input
            type="text"
            placeholder="Поиск..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-100/80 dark:bg-slate-700/50 backdrop-blur-sm text-base text-slate-800 dark:text-white placeholder-gray-500 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-slate-600 focus:bg-white dark:focus:bg-slate-600 input-transition"
          />
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {filteredContacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => {
              onSelectContact(contact.id);
              closeMobile();
              setSearchTerm('');
            }}
            className={`
              flex items-center px-3 py-2.5 cursor-pointer rounded-xl group transition-all duration-200
              ${activeContactId === contact.id ? 'bg-blue-50 dark:bg-blue-600/20' : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'}
            `}
          >
            <div className="transition-transform duration-300 group-hover:scale-105">
                <Avatar src={contact.avatarUrl} alt={contact.name} size="md" status={contact.isOnline} id={contact.id} />
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-0.5">
                <h3 className={`text-sm font-semibold truncate flex items-center gap-1 transition-colors ${activeContactId === contact.id ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-white'}`}>
                  {contact.type === 'channel' && <Megaphone size={12} className="text-orange-500" />}
                  {contact.type === 'group' && <Users size={12} className="text-blue-500" />}
                  {contact.name || 'Без имени'}
                </h3>
                {contact.lastMessageTime && (
                  <span className="text-[10px] text-gray-400 font-medium">
                    {new Date(contact.lastMessageTime).toLocaleDateString('ru-RU', {weekday: 'short'})}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate pr-2 opacity-90 font-medium">
                    {searchTerm && !contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ? (
                       <span className="text-blue-500">
                           {contact.username?.toLowerCase().includes(searchTerm.toLowerCase().replace('@','')) ? `@${contact.username}` : (contact.bio || contact.description)}
                       </span>
                    ) : (
                       <>
                        {contact.id === activeContactId && contact.type === 'user' && contact.id !== SAVED_MESSAGES_ID ? <span className="text-blue-500">Черновик: </span> : ''}
                        {contact.lastMessage}
                       </>
                    )}
                </p>
                {contact.unreadCount > 0 && (
                  <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-sm shadow-blue-200 dark:shadow-none">
                    {contact.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {/* Global Search */}
        {(globalResults.length > 0 || isSearching) && (
            <div className="mt-4 mb-2 animate-fade-in">
                <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Globe size={12} />
                    Глобальный поиск
                </div>
                {isSearching ? (
                     <div className="p-4 flex justify-center text-gray-400"><span className="animate-pulse text-xs">Ищем пользователей...</span></div>
                ) : (
                    globalResults.map((user) => (
                        <div key={user.id} onClick={() => { onAddContact(user); closeMobile(); setSearchTerm(''); }} className="flex items-center px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-xl mx-2">
                            <Avatar src={user.avatarUrl} alt={user.name} size="md" />
                            <div className="ml-3 flex-1 min-w-0">
                                <h3 className="text-sm font-medium text-slate-800 dark:text-white truncate">{user.name}</h3>
                                <p className="text-xs text-blue-500 flex items-center gap-1 font-medium"><AtSign size={10} />{user.username || 'user'}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        )}

        {filteredContacts.length === 0 && !isSearching && globalResults.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm animate-fade-in">
                {searchTerm ? 'Ничего не найдено' : 'Нет чатов'}
            </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
