import React, { useState, useRef, useEffect } from 'react';
import { X, Check, ChevronRight, ArrowLeft, Camera, Search, AtSign } from 'lucide-react';
import { ContactType, Contact, UserProfile } from '../types';
import Avatar from './Avatar';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, members: string[], avatarUrl: string) => void;
  type: ContactType;
  contacts: Contact[];
  onSearchUsers: (query: string) => Promise<UserProfile[]>;
}

const CreateChatModal: React.FC<CreateChatModalProps> = ({ isOpen, onClose, onCreate, type, contacts, onSearchUsers }) => {
  const [step, setStep] = useState<'info' | 'members'>('info');
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [globalResults, setGlobalResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
        setStep('info');
        setName('');
        setAvatarUrl('');
        setSelectedMembers([]);
        setSearchTerm('');
        setGlobalResults([]);
    }
  }, [isOpen]);

  // Debounced Global Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
        if (step === 'members' && searchTerm.trim().length >= 3) {
            setIsSearching(true);
            try {
                const results = await onSearchUsers(searchTerm);
                setGlobalResults(results);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsSearching(false);
            }
        } else {
            setGlobalResults([]);
            setIsSearching(false);
        }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, step, onSearchUsers]);

  if (!isOpen) return null;

  const isGroup = type === 'group';

  // Filter only user contacts
  const userContacts = contacts.filter(c => c.type === 'user' && c.id !== 'gemini-ai' && c.id !== 'saved-messages');
  const filteredLocalContacts = userContacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredGlobalResults = globalResults.filter(user => 
      !userContacts.some(c => c.id === user.id)
  );

  const handleNext = () => {
      if (name.trim()) {
          setStep('members');
      }
  };

  const handleSubmit = () => {
    onCreate(name, selectedMembers, avatarUrl);
    onClose();
  };

  const toggleMember = (id: string) => {
      if (selectedMembers.includes(id)) {
          setSelectedMembers(selectedMembers.filter(m => m !== id));
      } else {
          setSelectedMembers([...selectedMembers, id]);
      }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setAvatarUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden m-4 animate-modal flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0 z-10">
            <div className="flex items-center gap-2">
                {step === 'members' && (
                    <button onClick={() => setStep('info')} className="mr-2 text-gray-500 hover:text-slate-800 dark:hover:text-white transition-colors btn-press">
                        <ArrowLeft size={20} />
                    </button>
                )}
                <h3 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-2 animate-fade-in">
                    {step === 'info' ? 'Новая группа' : 'Добавить участников'}
                </h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 btn-press">
                <X size={24} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            
            {step === 'info' && (
                <div className="space-y-6 animate-view-transition">
                    {/* Avatar Upload */}
                    <div className="flex justify-center my-4">
                        <div 
                            className="relative group cursor-pointer btn-press"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className={`w-28 h-28 rounded-full flex items-center justify-center overflow-hidden transition-colors border-2 ${avatarUrl ? 'border-transparent' : 'border-dashed border-gray-300 dark:border-slate-600'} ${avatarUrl ? '' : (isGroup ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' : 'bg-orange-50 dark:bg-orange-900/20 text-orange-500')}`}>
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="Group Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <Camera size={36} />
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="text-white" size={28} />
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleAvatarChange}
                            />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={isGroup ? "Название группы" : "Название канала"}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-400"
                            autoFocus
                        />
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
                        <div className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors rounded-t-xl active:scale-[0.99]">
                            <span className="text-slate-700 dark:text-slate-300 text-sm font-medium">Автоудаление сообщений</span>
                            <span className="text-blue-500 text-sm font-medium">Нет</span>
                        </div>
                    </div>
                    
                    <p className="text-xs text-center text-gray-400">
                        Автоматически удалять сообщения в этой группе у всех участников спустя указанное время.
                    </p>
                </div>
            )}

            {step === 'members' && (
                <div className="space-y-4 animate-view-transition">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Поиск людей"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-gray-100 dark:bg-slate-700 text-sm text-slate-800 dark:text-white placeholder-gray-500 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div className="space-y-1">
                        {/* Local Contacts */}
                        {filteredLocalContacts.length > 0 && (
                             <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1">Ваши контакты</div>
                        )}
                        
                        {filteredLocalContacts.map(contact => (
                            <div 
                                key={contact.id}
                                onClick={() => toggleMember(contact.id)}
                                className="flex items-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors active:scale-[0.99]"
                            >
                                <div className="relative">
                                    <Avatar src={contact.avatarUrl} alt={contact.name} size="md" />
                                    {selectedMembers.includes(contact.id) && (
                                        <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5 border-2 border-white dark:border-slate-800 animate-pop-in">
                                            <Check size={10} className="text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="ml-3 flex-1">
                                    <h4 className="text-sm font-medium text-slate-800 dark:text-white">{contact.name}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {contact.isOnline ? 'в сети' : 'был(а) недавно'}
                                    </p>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMembers.includes(contact.id) ? 'bg-blue-500 border-blue-500 scale-110' : 'border-gray-300 dark:border-slate-500'}`}>
                                    {selectedMembers.includes(contact.id) && <Check size={12} className="text-white" />}
                                </div>
                            </div>
                        ))}

                        {/* Global Search Results */}
                        {(filteredGlobalResults.length > 0 || isSearching) && (
                            <div className="mt-4">
                                <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1 mb-1">Глобальный поиск</div>
                                
                                {isSearching ? (
                                    <div className="text-center py-2 text-gray-400 text-xs animate-pulse">Поиск...</div>
                                ) : (
                                    filteredGlobalResults.map(user => (
                                        <div 
                                            key={user.id}
                                            onClick={() => toggleMember(user.id)}
                                            className="flex items-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors active:scale-[0.99]"
                                        >
                                            <div className="relative">
                                                <Avatar src={user.avatarUrl} alt={user.name} size="md" />
                                                {selectedMembers.includes(user.id) && (
                                                    <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5 border-2 border-white dark:border-slate-800 animate-pop-in">
                                                        <Check size={10} className="text-white" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="ml-3 flex-1">
                                                <h4 className="text-sm font-medium text-slate-800 dark:text-white">{user.name}</h4>
                                                <p className="text-xs text-blue-500 flex items-center gap-0.5">
                                                    <AtSign size={10} /> {user.username || 'user'}
                                                </p>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedMembers.includes(user.id) ? 'bg-blue-500 border-blue-500 scale-110' : 'border-gray-300 dark:border-slate-500'}`}>
                                                {selectedMembers.includes(user.id) && <Check size={12} className="text-white" />}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {filteredLocalContacts.length === 0 && filteredGlobalResults.length === 0 && !isSearching && (
                            <p className="text-center text-gray-400 text-sm py-4 animate-fade-in">Нет результатов</p>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
            {step === 'info' ? (
                <button 
                    onClick={handleNext}
                    disabled={!name.trim()}
                    className={`w-full py-3.5 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all duration-300 ${
                        name.trim() 
                        ? 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 transform hover:-translate-y-0.5' 
                        : 'bg-gray-300 dark:bg-slate-700 cursor-not-allowed text-gray-500'
                    }`}
                >
                    Далее
                    <ChevronRight size={20} />
                </button>
            ) : (
                <button 
                    onClick={handleSubmit}
                    className="w-full py-3.5 rounded-xl font-medium text-white flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30 transform hover:-translate-y-0.5 transition-all btn-press"
                >
                    <Check size={20} />
                    Создать
                </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default CreateChatModal;