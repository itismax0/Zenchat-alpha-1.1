import { Contact, DeviceSession, AppSettings } from './types';

export const GEMINI_MODEL = 'gemini-2.5-flash';

export const CURRENT_USER_ID = 'me';
export const SAVED_MESSAGES_ID = 'saved-messages';

export const SAVED_MESSAGES_CONTACT: Contact = {
  id: SAVED_MESSAGES_ID,
  name: 'Избранное',
  avatarUrl: '', // Handled specially in Avatar component
  unreadCount: 0,
  isOnline: false,
  lastMessage: 'Сохраняйте сюда сообщения',
  lastMessageTime: Date.now(),
  type: 'user',
  membersCount: 0
};

export const CONTACTS: Contact[] = [
  SAVED_MESSAGES_CONTACT,
  {
    id: 'gemini-ai',
    name: 'Gemini',
    avatarUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
    unreadCount: 0,
    isOnline: true,
    lastMessage: 'Здравствуйте! Я Gemini. Чем могу помочь?',
    lastMessageTime: Date.now(),
    systemInstruction: 'Ты — Gemini, передовая языковая модель от Google. Ты общаешься вежливо, точно и полезно. Твоя цель — помогать пользователю с любыми вопросами. ТЫ ОБЯЗАН ОТВЕЧАТЬ ИСКЛЮЧИТЕЛЬНО НА РУССКОМ ЯЗЫКЕ, независимо от языка ввода пользователя, если он не попросит об обратном.',
    type: 'user',
    membersCount: 0
  }
];

export const INITIAL_DEVICES: DeviceSession[] = [
  { 
    id: '1', 
    name: 'ZenChat Web', 
    platform: 'Chrome, Windows', 
    lastActive: 'Online', 
    isCurrent: true, 
    icon: 'desktop' 
  },
  { 
    id: '2', 
    name: 'iPhone 15 Pro', 
    platform: 'iOS 17.4', 
    lastActive: '2 ч. назад', 
    isCurrent: false, 
    icon: 'mobile' 
  },
  { 
    id: '3', 
    name: 'iPad Air', 
    platform: 'iPadOS 17.0', 
    lastActive: '5 д. назад', 
    isCurrent: false, 
    icon: 'tablet' 
  }
];

export const INITIAL_SETTINGS: AppSettings = {
  notifications: {
    show: true,
    preview: true,
    sound: true,
    chatSounds: true,
    vibration: false
  },
  privacy: {
    email: 'Мои контакты',
    lastSeen: 'Все',
    profilePhoto: 'Все',
    passcode: false,
    twoFactor: true
  },
  appearance: {
    darkMode: false,
    chatBackground: 'default',
    textSize: 100
  },
  language: 'Русский'
};