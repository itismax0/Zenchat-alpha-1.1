
import React, { useState } from 'react';
import { X, Send, Trash2, Languages, Loader2, Clock, Ban, Eraser } from 'lucide-react';
import { Contact, Message } from '../types';
import Avatar from './Avatar';

// --- FORWARD MODAL ---
interface ForwardModalProps {
    isOpen: boolean;
    onClose: () => void;
    contacts: Contact[];
    onForward: (contactId: string) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({ isOpen, onClose, contacts, onForward }) => {
    const [search, setSearch] = useState('');
    
    if (!isOpen) return null;

    const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && c.id !== 'saved-messages');

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-sm rounded-xl shadow-2xl overflow-hidden m-4 flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800 dark:text-white">Переслать</h3>
                    <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="p-3">
                    <input 
                        className="w-full bg-gray-100 dark:bg-slate-700 px-4 py-2 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none"
                        placeholder="Поиск..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filtered.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => onForward(c.id)}
                            className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                        >
                            <Avatar src={c.avatarUrl} alt={c.name} size="md" />
                            <div className="ml-3">
                                <p className="text-sm font-medium text-slate-800 dark:text-white">{c.name}</p>
                                <p className="text-xs text-gray-500">{c.type === 'user' ? 'Пользователь' : 'Группа'}</p>
                            </div>
                            <Send size={16} className="ml-auto text-blue-500" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- DELETE MODAL ---
interface DeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDelete: (forEveryone: boolean) => void;
    isMe: boolean; // Can only delete for everyone if it's my message
}

export const DeleteModal: React.FC<DeleteModalProps> = ({ isOpen, onClose, onDelete, isMe }) => {
    const [forEveryone, setForEveryone] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-xs rounded-xl shadow-2xl p-6 m-4">
                <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">Удалить сообщение?</h3>
                <p className="text-sm text-gray-500 mb-6">Это действие нельзя отменить.</p>
                
                {isMe && (
                    <div 
                        className="flex items-center gap-2 mb-6 cursor-pointer"
                        onClick={() => setForEveryone(!forEveryone)}
                    >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${forEveryone ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                            {forEveryone && <X size={14} className="text-white" />}
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-200">Удалить также для всех</span>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
                        Отмена
                    </button>
                    <button 
                        onClick={() => onDelete(forEveryone)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 flex items-center gap-2"
                    >
                        <Trash2 size={16} />
                        Удалить
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- TRANSLATION MODAL ---
interface TranslationModalProps {
    isOpen: boolean;
    onClose: () => void;
    originalText: string;
    translatedText: string;
    isLoading: boolean;
}

export const TranslationModal: React.FC<TranslationModalProps> = ({ isOpen, onClose, originalText, translatedText, isLoading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-xl shadow-2xl overflow-hidden m-4">
                <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Languages size={20} />
                        <h3 className="font-semibold">Перевод</h3>
                    </div>
                    <button onClick={onClose}><X size={20} className="text-white/80 hover:text-white" /></button>
                </div>
                
                <div className="p-6 space-y-6">
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Оригинал</p>
                        <p className="text-slate-800 dark:text-white bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg text-sm leading-relaxed">
                            {originalText}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs font-bold text-blue-500 uppercase mb-1">Перевод (Русский)</p>
                         <div className="text-slate-800 dark:text-white bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm leading-relaxed min-h-[60px]">
                            {isLoading ? (
                                <div className="flex items-center gap-2 text-blue-500">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Переводим...</span>
                                </div>
                            ) : (
                                translatedText
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-slate-900/30 border-t border-gray-100 dark:border-slate-700 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- AUTO DELETE MODAL ---
interface AutoDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentValue: number;
    onSet: (seconds: number) => void;
}

export const AutoDeleteModal: React.FC<AutoDeleteModalProps> = ({ isOpen, onClose, currentValue, onSet }) => {
    if (!isOpen) return null;

    const options = [
        { label: 'Отключено', value: 0 },
        { label: '24 часа', value: 86400 },
        { label: '7 дней', value: 604800 },
        { label: '1 месяц', value: 2592000 },
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-xs rounded-xl shadow-2xl overflow-hidden m-4">
                <div className="p-4 border-b border-gray-100 dark:border-slate-700">
                    <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <Clock size={18} className="text-blue-500" />
                        Автоудаление
                    </h3>
                </div>
                <div className="p-2">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => { onSet(opt.value); onClose(); }}
                            className={`w-full text-left px-4 py-3 rounded-lg flex items-center justify-between transition-colors ${
                                currentValue === opt.value 
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' 
                                : 'hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                        >
                            <span className="font-medium">{opt.label}</span>
                            {currentValue === opt.value && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                        </button>
                    ))}
                </div>
                <div className="p-3 bg-gray-50 dark:bg-slate-900/30 text-xs text-gray-500 text-center">
                    Сообщения будут удаляться автоматически через выбранное время.
                </div>
            </div>
        </div>
    );
};

// --- BLOCK USER MODAL ---
interface BlockUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onBlock: () => void;
    userName: string;
    isBlocked: boolean;
}

export const BlockUserModal: React.FC<BlockUserModalProps> = ({ isOpen, onClose, onBlock, userName, isBlocked }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-xs rounded-xl shadow-2xl p-6 m-4 text-center">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Ban size={32} className="text-red-500" />
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">
                    {isBlocked ? 'Разблокировать?' : 'Заблокировать пользователя?'}
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                    {isBlocked 
                        ? `${userName} снова сможет отправлять вам сообщения.` 
                        : `${userName} не сможет писать вам и видеть вашу активность.`}
                </p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                        Отмена
                    </button>
                    <button 
                        onClick={() => { onBlock(); onClose(); }}
                        className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                    >
                        {isBlocked ? 'Разблокировать' : 'Заблокировать'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- CLEAR HISTORY MODAL ---
interface ClearHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onClear: () => void;
}

export const ClearHistoryModal: React.FC<ClearHistoryModalProps> = ({ isOpen, onClose, onClear }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-slate-800 w-full max-w-xs rounded-xl shadow-2xl p-6 m-4 text-center">
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Eraser size={32} className="text-orange-500" />
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">
                    Очистить историю?
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                    Все сообщения в этом чате будут удалены для вас. Это действие нельзя отменить.
                </p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                        Отмена
                    </button>
                    <button 
                        onClick={() => { onClear(); onClose(); }}
                        className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
                    >
                        Очистить
                    </button>
                </div>
            </div>
        </div>
    );
};
