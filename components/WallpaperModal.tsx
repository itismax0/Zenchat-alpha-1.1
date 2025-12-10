
import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Check, Upload, ArrowLeft } from 'lucide-react';

interface WallpaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (background: string) => void;
  currentBackground: string;
}

const PRESETS = [
  { id: 'default', label: 'По умолчанию', class: 'bg-[#f8fafc] dark:bg-slate-900' },
  { id: 'blue', label: 'Синий', class: 'bg-blue-50 dark:bg-blue-950' },
  { id: 'green', label: 'Зеленый', class: 'bg-green-50 dark:bg-green-950' },
  { id: 'pink', label: 'Розовый', class: 'bg-pink-50 dark:bg-pink-950' },
  { id: 'yellow', label: 'Желтый', class: 'bg-yellow-50 dark:bg-yellow-950' },
  { id: 'purple', label: 'Фиолетовый', class: 'bg-purple-50 dark:bg-purple-950' },
  { id: 'red', label: 'Красный', class: 'bg-red-50 dark:bg-red-950' },
  { id: 'slate', label: 'Серый', class: 'bg-slate-200 dark:bg-slate-800' },
  { id: 'gradient-1', label: 'Закат', class: 'bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-900/40 dark:to-rose-900/40' },
  { id: 'gradient-2', label: 'Океан', class: 'bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-900/40 dark:to-blue-900/40' },
  { id: 'gradient-3', label: 'Лес', class: 'bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/40' },
  { id: 'gradient-4', label: 'Ночь', class: 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' },
];

const WallpaperModal: React.FC<WallpaperModalProps> = ({ isOpen, onClose, onSave, currentBackground }) => {
  const [selectedBg, setSelectedBg] = useState(currentBackground);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setSelectedBg(result); // Set base64 string
      };
      reader.readAsDataURL(file);
    }
  };

  const isCustomImage = selectedBg.startsWith('data:') || selectedBg.startsWith('http') || selectedBg.startsWith('url');
  
  // Helper to render the preview background style
  const getPreviewStyle = () => {
      if (isCustomImage) {
          return { backgroundImage: `url(${selectedBg})`, backgroundSize: 'cover', backgroundPosition: 'center' };
      }
      // If it's a preset ID, we don't return style here, we use className on the container
      return {};
  };

  const getPreviewClass = () => {
      if (isCustomImage) return 'bg-white dark:bg-slate-900'; // Fallback
      const preset = PRESETS.find(p => p.id === selectedBg);
      return preset ? preset.class : PRESETS[0].class;
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md h-[90vh] md:h-[800px] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-modal">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 z-10">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors">
                <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
            <h3 className="font-semibold text-lg text-slate-800 dark:text-white">Изменить обои</h3>
            <button 
                onClick={() => { onSave(selectedBg); onClose(); }}
                className="text-blue-500 font-medium hover:text-blue-600 px-2"
            >
                Готово
            </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900 scrollbar-thin">
            
            {/* Preview Section */}
            <div className="sticky top-0 z-0 w-full aspect-[3/4] max-h-[40vh] overflow-hidden border-b border-gray-200 dark:border-slate-700 relative group">
                <div 
                    className={`absolute inset-0 transition-all duration-300 ${getPreviewClass()}`}
                    style={getPreviewStyle()}
                />
                
                {/* Fake Messages for Preview */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 space-y-3 pointer-events-none">
                    <div className="bg-white dark:bg-slate-700 self-start rounded-2xl rounded-tl-none px-4 py-2 shadow-sm max-w-[80%]">
                        <p className="text-sm text-slate-800 dark:text-white">Как вам этот фон?</p>
                        <span className="text-[10px] text-gray-400 block text-right mt-1">10:00</span>
                    </div>
                    <div className="bg-blue-500 self-end rounded-2xl rounded-tr-none px-4 py-2 shadow-sm max-w-[80%]">
                        <p className="text-sm text-white">Выглядит отлично! ✨</p>
                        <span className="text-[10px] text-blue-100 block text-right mt-1 flex items-center justify-end gap-1">
                            10:01 <Check size={12} />
                        </span>
                    </div>
                </div>

                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/30 backdrop-blur-md text-white text-xs px-3 py-1 rounded-full font-medium">
                    Предпросмотр
                </div>
            </div>

            {/* Controls */}
            <div className="p-6 bg-white dark:bg-slate-800 min-h-[50vh] rounded-t-3xl -mt-6 relative z-10 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
                
                {/* Custom Upload */}
                <div className="mb-8">
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 ml-1">Своё фото</h4>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-16 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group btn-press"
                    >
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-500">
                            <Upload size={20} />
                        </div>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-blue-500 transition-colors">Загрузить из галереи</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                </div>

                {/* Presets Grid */}
                <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 ml-1">Цвета и градиенты</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                onClick={() => setSelectedBg(preset.id)}
                                className={`
                                    relative aspect-square rounded-2xl overflow-hidden border-2 transition-all duration-200
                                    ${selectedBg === preset.id ? 'border-blue-500 scale-95 ring-2 ring-blue-200 dark:ring-blue-900' : 'border-transparent hover:scale-105'}
                                    ${preset.class}
                                `}
                                title={preset.label}
                            >
                                {selectedBg === preset.id && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                                        <div className="bg-blue-500 rounded-full p-1">
                                            <Check size={16} className="text-white" strokeWidth={3} />
                                        </div>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default WallpaperModal;
