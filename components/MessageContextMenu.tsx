
import React, { useEffect, useRef, useState } from 'react';
import { Reply, Copy, Edit, Pin, Forward, Trash2, CheckCircle, Languages } from 'lucide-react';
import { Message } from '../types';

interface MessageContextMenuProps {
  message: Message;
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string, message: Message, payload?: any) => void;
  isMe: boolean;
  anchorPoint: { x: number; y: number };
}

const REACTIONS = ["🔥", "👍", "🥰", "🤩", "❤️", "👎", "🤣", "😱"];

const MessageContextMenu: React.FC<MessageContextMenuProps> = ({ 
  message, 
  isOpen, 
  onClose, 
  onAction,
  isMe,
  anchorPoint
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [transformOrigin, setTransformOrigin] = useState('bottom left');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen && menuRef.current) {
        const menuRect = menuRef.current.getBoundingClientRect();
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        // Force Open Upwards by default (User request)
        // Calculate top position: Anchor Y - Menu Height - Padding
        let top = anchorPoint.y - menuRect.height - 20;
        let left = anchorPoint.x;

        let originY = 'bottom';
        let originX = 'left';

        // Horizontal overflow adjustment
        if (left + menuRect.width > screenW - 10) {
            left = screenW - menuRect.width - 10;
            originX = 'right';
        }
        if (left < 10) {
            left = 10;
            originX = 'left';
        }

        // Only flip to bottom if it absolutely doesn't fit on top (very top of screen)
        if (top < 10) {
            top = anchorPoint.y + 20;
            originY = 'top';
        }

        setPosition({ top, left });
        setTransformOrigin(`${originY} ${originX}`);
        
        requestAnimationFrame(() => {
            setIsVisible(true);
        });
    } else {
        setIsVisible(false);
    }
  }, [isOpen, anchorPoint]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] isolate">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 z-10 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      ></div>

      {/* Menu Container */}
      <div 
        ref={menuRef}
        className={`fixed z-20 w-64 flex flex-col gap-2 transition-all duration-[400ms] cubic-bezier(0.16, 1, 0.3, 1) ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-4'}`}
        style={{ 
            top: position.top, 
            left: position.left,
            transformOrigin: transformOrigin,
        }}
      >
        
        {/* Actions Menu */}
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden border border-white/20 dark:border-slate-700 ring-1 ring-black/5 divide-y divide-gray-100/10 dark:divide-slate-700/50">
          
          <div className="p-2 grid grid-cols-4 gap-1 bg-gray-50/50 dark:bg-slate-900/30">
             {REACTIONS.map((emoji, index) => (
                <button
                  key={emoji}
                  onClick={() => onAction('react', message, emoji)}
                  className={`p-2 text-xl flex justify-center items-center hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all hover:scale-110 active:scale-95 ${
                    message.reactions?.some(r => r.emoji === emoji && r.userReacted) 
                      ? 'bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-200 dark:ring-blue-800' 
                      : ''
                  }`}
                >
                  {emoji}
                </button>
              ))}
          </div>

          <button onClick={() => onAction('reply', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
            <span className="text-slate-800 dark:text-white text-[15px] font-medium">Ответить</span>
            <Reply size={18} className="text-gray-500 group-hover:text-blue-500" />
          </button>

          <button onClick={() => onAction('forward', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
            <span className="text-slate-800 dark:text-white text-[15px] font-medium">Переслать</span>
            <Forward size={18} className="text-gray-500 group-hover:text-blue-500" />
          </button>

          <button onClick={() => onAction('copy', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
            <span className="text-slate-800 dark:text-white text-[15px] font-medium">Скопировать</span>
            <Copy size={18} className="text-gray-500 group-hover:text-blue-500" />
          </button>

          {isMe && message.type === 'text' && (
            <button onClick={() => onAction('edit', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
              <span className="text-slate-800 dark:text-white text-[15px] font-medium">Изменить</span>
              <Edit size={18} className="text-gray-500 group-hover:text-blue-500" />
            </button>
          )}

          <button onClick={() => onAction('pin', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
            <span className="text-slate-800 dark:text-white text-[15px] font-medium">{message.isPinned ? 'Открепить' : 'Закрепить'}</span>
            <Pin size={18} className={`text-gray-500 group-hover:text-blue-500 ${message.isPinned ? 'fill-current' : ''}`} />
          </button>

          {message.text && (
            <button onClick={() => onAction('translate', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
                <span className="text-slate-800 dark:text-white text-[15px] font-medium">Перевести</span>
                <Languages size={18} className="text-gray-500 group-hover:text-blue-500" />
            </button>
          )}

          <button onClick={() => onAction('select', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 dark:hover:bg-slate-700/50 transition-colors group active:bg-blue-100">
            <span className="text-slate-800 dark:text-white text-[15px] font-medium">Выбрать</span>
            <CheckCircle size={18} className="text-gray-500 group-hover:text-blue-500" />
          </button>

          <button onClick={() => onAction('delete', message)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group active:bg-red-100">
            <span className="text-red-500 text-[15px] font-medium">Удалить</span>
            <Trash2 size={18} className="text-red-500" />
          </button>

        </div>
      </div>
    </div>
  );
};

export default MessageContextMenu;
