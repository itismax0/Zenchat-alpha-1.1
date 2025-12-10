
import React, { useState, useRef, useEffect } from 'react';
import { X, Bell, Moon, Globe, Shield, Smartphone, ChevronRight, ArrowLeft, Camera, Trash2, Monitor, LogOut, User, AtSign, Fingerprint, Loader2, Save, Phone, Info, QrCode, Palette, Smile, Image as ImageIcon, MapPin, Calendar } from 'lucide-react';
import Avatar from './Avatar';
import EmojiPicker from './EmojiPicker';
import { UserProfile, AppSettings, DeviceSession } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => Promise<void>;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  devices: DeviceSession[];
  onTerminateSessions: () => void;
  onLogout: () => void;
  initialTab?: 'main' | 'appearance';
}

type SettingsView = 'main' | 'notifications' | 'privacy' | 'appearance' | 'devices' | 'edit_profile' | 'customize_profile';

const PROFILE_COLORS = [
    { id: 'red', class: 'bg-gradient-to-br from-red-500 to-red-600' },
    { id: 'orange', class: 'bg-gradient-to-br from-orange-500 to-orange-600' },
    { id: 'yellow', class: 'bg-gradient-to-br from-yellow-500 to-yellow-600' },
    { id: 'green', class: 'bg-gradient-to-br from-green-500 to-green-600' },
    { id: 'cyan', class: 'bg-gradient-to-br from-cyan-500 to-cyan-600' },
    { id: 'blue', class: 'bg-gradient-to-br from-blue-500 to-blue-600' },
    { id: 'violet', class: 'bg-gradient-to-br from-violet-500 to-violet-600' },
    { id: 'pink', class: 'bg-gradient-to-br from-pink-500 to-pink-600' },
    { id: 'gray', class: 'bg-gradient-to-br from-slate-500 to-slate-600' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    userProfile, 
    onUpdateProfile,
    settings,
    onUpdateSettings,
    devices,
    onTerminateSessions,
    onLogout,
    initialTab = 'main'
}) => {
  const [view, setView] = useState<SettingsView>('main');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  
  // Customization State
  const [statusEmoji, setStatusEmoji] = useState('');
  const [profileColor, setProfileColor] = useState('gray');
  const [profileBackgroundEmoji, setProfileBackgroundEmoji] = useState('');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  
  const [showQr, setShowQr] = useState(false);

  // Reset view on open
  useEffect(() => {
    if (isOpen) {
        setView(initialTab);
        setEditName(userProfile.name);
        setEditUsername(userProfile.username || '');
        setEditBio(userProfile.bio || '');
        setEditPhone(userProfile.phoneNumber || '');
        setEditAddress(userProfile.address || '');
        setEditBirthDate(userProfile.birthDate || '');
        setStatusEmoji(userProfile.statusEmoji || '');
        setProfileColor(userProfile.profileColor || 'gray');
        setProfileBackgroundEmoji(userProfile.profileBackgroundEmoji || '');
        setSaveError('');
        setShowQr(false);
    }
  }, [isOpen, userProfile, initialTab]);

  if (!isOpen) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const newUrl = ev.target?.result as string;
        // SECURITY: Only send avatarUrl, not full profile
        await onUpdateProfile({ avatarUrl: newUrl } as any);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
      // Basic Client-Side Validation
      if (editUsername) {
          const usernameRegex = /^[a-zA-Z0-9_]{3,25}$/;
          if (!usernameRegex.test(editUsername)) {
              setSaveError('Юзернейм: 3-25 символов (латиница, цифры, _).');
              return;
          }
      }

      setIsSaving(true);
      setSaveError('');
      
      // SECURITY FIX: Do not spread ...userProfile to avoid sending chatHistory/contacts to server
      const updates: any = {};
      
      // Only include fields that are actually managed by this form
      updates.name = editName;
      updates.bio = editBio;
      updates.phoneNumber = editPhone;
      updates.address = editAddress;
      updates.birthDate = editBirthDate;
      updates.statusEmoji = statusEmoji;
      updates.profileColor = profileColor;
      updates.profileBackgroundEmoji = profileBackgroundEmoji;
      
      // FIX: Handle Username Deletion
      // If editUsername is empty string, we send NULL so server deletes it.
      // If it has value, we send value.
      updates.username = editUsername.trim() || null;

      try {
          await onUpdateProfile(updates);
          setView('main');
      } catch (e: any) {
          setSaveError(e.message || 'Ошибка сохранения');
      } finally {
          setIsSaving(false);
      }
  };

  const updateNestedSetting = (category: 'notifications' | 'privacy' | 'appearance', key: string, value: any) => {
      onUpdateSettings({
          ...settings,
          [category]: {
              ...settings[category],
              [key]: value
          }
      });
  };

  const cyclePrivacyOption = (key: keyof AppSettings['privacy']) => {
      if (typeof settings.privacy[key] === 'boolean') return;
      
      const options: ('Все' | 'Мои контакты' | 'Никто')[] = ['Все', 'Мои контакты', 'Никто'];
      const current = settings.privacy[key] as string;
      const nextIndex = (options.indexOf(current as any) + 1) % options.length;
      updateNestedSetting('privacy', key, options[nextIndex]);
  };

  const renderHeader = (title: string, onBack?: () => void, rightElement?: React.ReactNode) => (
    <div className="flex items-center p-4 border-b border-gray-100 dark:border-slate-700 relative bg-white dark:bg-slate-800 sticky top-0 z-10 transition-colors">
      {onBack && (
        <button onClick={onBack} className="absolute left-4 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300 transition-colors btn-press">
          <ArrowLeft size={20} />
        </button>
      )}
      <h2 className={`text-lg font-semibold text-slate-800 dark:text-white w-full text-center ${onBack ? 'ml-0' : 'ml-2 text-left'}`}>{title}</h2>
      
      {rightElement ? (
          <div className="absolute right-4">{rightElement}</div>
      ) : (
          !onBack && (
            <button onClick={onClose} className="absolute right-4 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors btn-press">
              <X size={20} />
            </button>
          )
      )}
    </div>
  );

  const renderMenuItem = (icon: React.ReactNode, label: string, colorClass: string, onClick: () => void, value?: string) => (
    <div onClick={onClick} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors group active:scale-[0.99] duration-150">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-full transition-colors ${colorClass}`}>
          {icon}
        </div>
        <span className="text-slate-700 dark:text-slate-200 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
         {value && <span className="text-sm text-gray-400">{value}</span>}
         <ChevronRight size={18} className="text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );

  const renderToggle = (label: string, enabled: boolean, onChange: (val: boolean) => void) => (
      <div 
        onClick={() => onChange(!enabled)}
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors active:scale-[0.99]"
      >
          <span className="text-slate-700 dark:text-slate-200">{label}</span>
          <div className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-slate-600'}`}>
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${enabled ? 'translate-x-5' : ''}`}></div>
          </div>
      </div>
  );

  // Helper to get active profile style
  const activeColorObj = PROFILE_COLORS.find(c => c.id === userProfile.profileColor) || PROFILE_COLORS.find(c => c.id === 'default') || PROFILE_COLORS[8];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md h-[90vh] md:h-auto md:max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-modal">
        
        {view === 'main' && (
            <div className="flex flex-col h-full animate-view-transition">
                {renderHeader('Настройки')}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Profile Section - Customized Card */}
                    <div className={`relative flex flex-col items-center p-6 rounded-2xl border border-gray-100 dark:border-slate-700 transform transition-transform hover:scale-[1.01] duration-300 overflow-hidden ${activeColorObj.class}`}>
                        
                        {/* Background Pattern */}
                        {userProfile.profileBackgroundEmoji && (
                            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
                                <div className="grid grid-cols-5 gap-8 p-4 transform rotate-12 scale-150">
                                    {Array(20).fill(userProfile.profileBackgroundEmoji).map((emoji, i) => (
                                        <span key={i} className="text-4xl filter blur-[0.5px]">{emoji}</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="relative group cursor-pointer mb-3 btn-press z-10" onClick={() => fileInputRef.current?.click()}>
                            <div className="p-1 bg-white/20 rounded-full backdrop-blur-sm">
                                <Avatar src={userProfile.avatarUrl} alt={userProfile.name} size="xl" />
                            </div>
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="text-white" size={24} />
                            </div>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleAvatarChange}
                            />
                        </div>

                        <h3 className="text-xl font-bold text-white flex items-center gap-1.5 z-10 drop-shadow-sm">
                            {userProfile.name}
                            {userProfile.statusEmoji && <span>{userProfile.statusEmoji}</span>}
                        </h3>
                        <p className="text-white/80 text-sm mb-4 z-10 font-medium">
                            {userProfile.username ? `@${userProfile.username}` : userProfile.email}
                        </p>
                        
                        <div className="flex gap-2 z-10">
                             <button 
                                onClick={() => setView('edit_profile')}
                                className="text-white font-medium text-sm bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-1.5 rounded-full transition-colors btn-press shadow-sm border border-white/10"
                            >
                                Изменить
                            </button>
                             <button 
                                onClick={() => setView('customize_profile')}
                                className="text-white font-medium text-sm bg-white/20 hover:bg-white/30 backdrop-blur-md px-4 py-1.5 rounded-full transition-colors btn-press flex items-center gap-1 shadow-sm border border-white/10"
                            >
                                <Palette size={14} />
                                Оформление
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {renderMenuItem(<Bell size={20} className="text-orange-500" />, 'Уведомления', 'bg-orange-100 dark:bg-orange-900/20', () => setView('notifications'))}
                        {renderMenuItem(<Shield size={20} className="text-green-500" />, 'Конфиденциальность', 'bg-green-100 dark:bg-green-900/20', () => setView('privacy'))}
                        {renderMenuItem(<Moon size={20} className="text-purple-500" />, 'Оформление', 'bg-purple-100 dark:bg-purple-900/20', () => setView('appearance'))}
                        {renderMenuItem(<Smartphone size={20} className="text-blue-500" />, 'Устройства', 'bg-blue-100 dark:bg-blue-900/20', () => setView('devices'))}
                        {renderMenuItem(<Globe size={20} className="text-cyan-500" />, 'Язык', 'bg-cyan-100 dark:bg-cyan-900/20', () => {}, settings.language)}
                    </div>

                    <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                         <button 
                            onClick={onLogout}
                            className="w-full p-3 flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors font-medium btn-press"
                         >
                             <LogOut size={20} />
                             Выйти
                         </button>
                    </div>
                </div>
            </div>
        )}

        {/* CUSTOMIZE PROFILE VIEW */}
        {view === 'customize_profile' && (
            <div className="flex flex-col h-full animate-view-transition">
                 {renderHeader('Оформление профиля', () => setView('main'), 
                    <button onClick={handleSaveProfile} disabled={isSaving} className="text-blue-500 font-medium disabled:opacity-50">
                        {isSaving ? 'Сохранение...' : 'Готово'}
                    </button>
                 )}
                 <div className="flex-1 overflow-y-auto p-0">
                     
                     {/* Preview */}
                     <div className={`relative pt-10 pb-6 flex flex-col items-center ${PROFILE_COLORS.find(c => c.id === profileColor)?.class || PROFILE_COLORS[8].class} transition-colors duration-500`}>
                         {profileBackgroundEmoji && (
                            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
                                <div className="grid grid-cols-5 gap-8 p-4 transform rotate-12 scale-150">
                                    {Array(20).fill(profileBackgroundEmoji).map((emoji, i) => (
                                        <span key={i} className="text-4xl filter blur-[0.5px]">{emoji}</span>
                                    ))}
                                </div>
                            </div>
                         )}
                         <div className="relative z-10 mb-3 border-4 border-white/20 rounded-full">
                            <Avatar src={userProfile.avatarUrl} alt={userProfile.name} size="xl" />
                         </div>
                         <h2 className="text-2xl font-bold text-white relative z-10 flex items-center gap-2 drop-shadow-sm">
                             {userProfile.name}
                             {statusEmoji && <span className="text-2xl">{statusEmoji}</span>}
                         </h2>
                         <p className="text-white/80 text-sm relative z-10 font-medium drop-shadow-sm">в сети</p>
                     </div>

                     <div className="p-6 space-y-6">
                        {/* Color Picker */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-gray-500 uppercase">Цвет профиля</label>
                            <div className="grid grid-cols-5 gap-3">
                                {PROFILE_COLORS.map(color => (
                                    <button 
                                        key={color.id}
                                        onClick={() => setProfileColor(color.id)}
                                        className={`w-10 h-10 rounded-full ${color.class} border-2 ${profileColor === color.id ? 'border-blue-500 scale-110 shadow-lg' : 'border-transparent hover:scale-105'} transition-all`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Emoji Status Picker */}
                        <div className="space-y-3 relative">
                             <label className="text-xs font-bold text-gray-500 uppercase">Эмодзи статус</label>
                             <div className="flex items-center gap-3">
                                 <button 
                                    onClick={() => { setShowStatusPicker(!showStatusPicker); setShowBgPicker(false); }}
                                    className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-2xl border border-gray-200 dark:border-slate-600 hover:border-blue-500 transition-colors"
                                 >
                                     {statusEmoji || <Smile size={24} className="text-gray-400" />}
                                 </button>
                                 {statusEmoji && (
                                     <button onClick={() => setStatusEmoji('')} className="text-red-500 text-sm font-medium">Очистить</button>
                                 )}
                             </div>
                             {showStatusPicker && (
                                <div className="absolute z-20 top-full left-0 mt-2">
                                    <EmojiPicker 
                                        onSelectEmoji={(e) => { setStatusEmoji(e); setShowStatusPicker(false); }}
                                        onSelectSticker={() => {}} 
                                    />
                                </div>
                             )}
                        </div>

                        {/* Background Emoji Picker */}
                        <div className="space-y-3 relative">
                             <label className="text-xs font-bold text-gray-500 uppercase">Фон (Паттерн)</label>
                             <div className="flex items-center gap-3">
                                 <button 
                                    onClick={() => { setShowBgPicker(!showBgPicker); setShowStatusPicker(false); }}
                                    className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-2xl border border-gray-200 dark:border-slate-600 hover:border-blue-500 transition-colors"
                                 >
                                     {profileBackgroundEmoji || <ImageIcon size={24} className="text-gray-400" />}
                                 </button>
                                 {profileBackgroundEmoji && (
                                     <button onClick={() => setProfileBackgroundEmoji('')} className="text-red-500 text-sm font-medium">Очистить</button>
                                 )}
                             </div>
                             {showBgPicker && (
                                <div className="absolute z-20 top-full left-0 mt-2">
                                    <EmojiPicker 
                                        onSelectEmoji={(e) => { setProfileBackgroundEmoji(e); setShowBgPicker(false); }}
                                        onSelectSticker={() => {}} 
                                    />
                                </div>
                             )}
                             <p className="text-xs text-gray-400">Выберите эмодзи, чтобы создать уникальный узор на фоне вашего профиля.</p>
                        </div>
                     </div>
                 </div>
            </div>
        )}

        {view === 'edit_profile' && (
            <div className="flex flex-col h-full animate-view-transition relative">
                {showQr && (
                    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-800 flex flex-col items-center justify-center p-6 animate-fade-in">
                         <button onClick={() => setShowQr(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500">
                             <X size={24} />
                         </button>
                         <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 mb-6">
                            <img 
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=zenchat:${userProfile.id}`} 
                                alt="Profile QR" 
                                className="w-56 h-56"
                            />
                         </div>
                         <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{userProfile.name}</h3>
                         <p className="text-blue-500 font-medium">@{userProfile.username || 'user'}</p>
                         <p className="text-gray-400 text-sm mt-8 text-center px-8">Отсканируйте этот код, чтобы добавить в контакты.</p>
                    </div>
                )}
            
                {renderHeader('Изменить профиль', () => setView('main'), 
                    <button onClick={() => setShowQr(true)} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-slate-700 p-2 rounded-full transition-colors" title="Показать QR">
                        <QrCode size={20} />
                    </button>
                )}
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {saveError && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm text-center animate-fade-in">
                            {saveError}
                        </div>
                    )}
                    
                    {/* Avatar Upload Banner */}
                    <div className="flex justify-center">
                        <div 
                            className="relative w-28 h-28 group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Avatar src={userProfile.avatarUrl} alt={userProfile.name} size="custom" />
                             {/* Custom size simulation for Avatar since it takes fixed strings */}
                             <div className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-[1px]">
                                <Camera className="text-white mb-1" size={24} />
                                <span className="text-[10px] text-white font-medium">Изменить</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                             <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Имя</label>
                             <div className="flex items-center bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                 <User size={18} className="text-gray-400" />
                                 <input 
                                    type="text" 
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-800 dark:text-white pl-3 outline-none"
                                    placeholder="Ваше имя"
                                 />
                             </div>
                        </div>
                        
                        <div className="space-y-1">
                             <label className="text-xs font-semibold text-gray-500 uppercase ml-1">О себе</label>
                             <div className="flex items-start bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-3 py-1 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                 <Info size={18} className="text-gray-400 mt-2.5" />
                                 <div className="flex-1">
                                     <textarea 
                                        value={editBio}
                                        onChange={(e) => setEditBio(e.target.value)}
                                        className="w-full bg-transparent border-none focus:ring-0 py-2 text-slate-800 dark:text-white pl-3 text-sm resize-none outline-none ring-0"
                                        placeholder="Расскажите немного о себе..."
                                        rows={2}
                                        maxLength={70}
                                     />
                                     <div className="text-right text-[10px] text-gray-400 pb-1 pr-1">{editBio.length}/70</div>
                                 </div>
                             </div>
                             <p className="text-xs text-gray-400 ml-1">Любые подробности, например: возраст, род занятий или город.</p>
                        </div>

                        <div className="space-y-1">
                             <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Имя пользователя</label>
                             <div className="flex items-center bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                 <AtSign size={18} className="text-gray-400" />
                                 <input 
                                    type="text" 
                                    value={editUsername}
                                    onChange={(e) => setEditUsername(e.target.value)}
                                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-800 dark:text-white pl-3 outline-none"
                                    placeholder="username"
                                 />
                             </div>
                             <p className="text-xs text-gray-400 ml-1">
                                 По ссылке <strong>@{editUsername || 'username'}</strong> вас смогут найти люди.
                             </p>
                        </div>

                         <div className="space-y-1">
                             <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Номер телефона</label>
                             <div className="flex items-center bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                 <Phone size={18} className="text-gray-400" />
                                 <input 
                                    type="tel" 
                                    value={editPhone}
                                    onChange={(e) => setEditPhone(e.target.value)}
                                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-800 dark:text-white pl-3 outline-none"
                                    placeholder="+7 900 000 00 00"
                                 />
                             </div>
                        </div>

                         <div className="space-y-1">
                             <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Адрес (Город)</label>
                             <div className="flex items-center bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                 <MapPin size={18} className="text-gray-400" />
                                 <input 
                                    type="text" 
                                    value={editAddress}
                                    onChange={(e) => setEditAddress(e.target.value)}
                                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-800 dark:text-white pl-3 outline-none"
                                    placeholder="Москва, Россия"
                                 />
                             </div>
                        </div>

                        <div className="space-y-1">
                             <label className="text-xs font-semibold text-gray-500 uppercase ml-1">Дата рождения</label>
                             <div className="flex items-center bg-gray-50 dark:bg-slate-700 rounded-xl border border-gray-200 dark:border-slate-600 px-3 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                                 <Calendar size={18} className="text-gray-400" />
                                 <input 
                                    type="date" 
                                    value={editBirthDate}
                                    onChange={(e) => setEditBirthDate(e.target.value)}
                                    className="flex-1 bg-transparent border-none focus:ring-0 py-3 text-slate-800 dark:text-white pl-3 outline-none"
                                 />
                             </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={handleSaveProfile}
                            disabled={isSaving}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 btn-press shadow-lg shadow-blue-500/20"
                        >
                            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            Сохранить изменения
                        </button>
                    </div>
                </div>
            </div>
        )}

        {view === 'notifications' && (
            <div className="flex flex-col h-full animate-view-transition">
                {renderHeader('Уведомления', () => setView('main'))}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {renderToggle('Показывать уведомления', settings.notifications.show, (v) => updateNestedSetting('notifications', 'show', v))}
                    {renderToggle('Предпросмотр сообщения', settings.notifications.preview, (v) => updateNestedSetting('notifications', 'preview', v))}
                    {renderToggle('Звук', settings.notifications.sound, (v) => updateNestedSetting('notifications', 'sound', v))}
                    {renderToggle('Звуки в чате', settings.notifications.chatSounds, (v) => updateNestedSetting('notifications', 'chatSounds', v))}
                    {renderToggle('Вибрация', settings.notifications.vibration, (v) => updateNestedSetting('notifications', 'vibration', v))}
                </div>
            </div>
        )}

        {view === 'privacy' && (
            <div className="flex flex-col h-full animate-view-transition">
                {renderHeader('Конфиденциальность', () => setView('main'))}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase ml-2">Кто видит</h4>
                        <div className="bg-gray-50 dark:bg-slate-900/50 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-700">
                            {renderMenuItem(<span className="text-xl">📞</span>, 'Номер телефона', 'bg-transparent', () => cyclePrivacyOption('email'), settings.privacy.email)}
                            {renderMenuItem(<span className="text-xl">👀</span>, 'Последняя активность', 'bg-transparent', () => cyclePrivacyOption('lastSeen'), settings.privacy.lastSeen)}
                            {renderMenuItem(<span className="text-xl">📷</span>, 'Фото профиля', 'bg-transparent', () => cyclePrivacyOption('profilePhoto'), settings.privacy.profilePhoto)}
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                         <h4 className="text-xs font-semibold text-gray-400 uppercase ml-2">Безопасность</h4>
                         <div className="bg-gray-50 dark:bg-slate-900/50 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-700">
                            {renderToggle('Код-пароль', settings.privacy.passcode, (v) => updateNestedSetting('privacy', 'passcode', v))}
                            {renderToggle('Двухэтапная аутентификация', settings.privacy.twoFactor, (v) => updateNestedSetting('privacy', 'twoFactor', v))}
                         </div>
                    </div>
                </div>
            </div>
        )}

        {view === 'appearance' && (
            <div className="flex flex-col h-full animate-view-transition">
                {renderHeader('Оформление', () => setView('main'))}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="space-y-4">
                        {renderToggle('Темная тема', settings.appearance.darkMode, (v) => updateNestedSetting('appearance', 'darkMode', v))}
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 ml-1">Размер текста: {settings.appearance.textSize}%</label>
                            <input 
                                type="range" 
                                min="80" 
                                max="150" 
                                step="10" 
                                value={settings.appearance.textSize}
                                onChange={(e) => updateNestedSetting('appearance', 'textSize', parseInt(e.target.value))}
                                className="w-full accent-blue-500 h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                </div>
            </div>
        )}

        {view === 'devices' && (
            <div className="flex flex-col h-full animate-view-transition">
                 {renderHeader('Устройства', () => setView('main'))}
                 <div className="flex-1 overflow-y-auto p-4 space-y-6">
                     
                     <div className="text-center py-6">
                         <Monitor size={64} className="mx-auto text-blue-500 mb-4 animate-pop-in" />
                         <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Активные сеансы</h3>
                         <p className="text-gray-500 text-sm">Управляйте устройствами, на которых выполнен вход.</p>
                     </div>

                     <button 
                        onClick={onTerminateSessions}
                        className="w-full py-3 text-red-500 font-medium border border-red-200 dark:border-red-900/30 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors btn-press"
                     >
                         Завершить все другие сеансы
                     </button>

                     <div className="space-y-3">
                         {devices.map((device, i) => (
                             <div key={device.id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl animate-fade-in" style={{animationDelay: `${i * 50}ms`}}>
                                 <div className={`p-2.5 rounded-full ${device.isCurrent ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-gray-400'}`}>
                                     {device.icon === 'mobile' ? <Smartphone size={20} /> : <Monitor size={20} />}
                                 </div>
                                 <div className="flex-1">
                                     <h4 className="font-medium text-slate-800 dark:text-white flex items-center gap-2">
                                         {device.name}
                                         {device.isCurrent && <span className="text-[10px] bg-green-500 text-white px-1.5 rounded font-bold">ЭТО</span>}
                                     </h4>
                                     <p className="text-xs text-gray-500">{device.platform} • {device.lastActive}</p>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;
