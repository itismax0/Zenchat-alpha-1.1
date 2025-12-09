
import { api } from './api';
import { AppSettings, Contact, Message, UserData, UserProfile, DeviceSession } from '../types';
import { CONTACTS, INITIAL_SETTINGS, INITIAL_DEVICES, SAVED_MESSAGES_ID } from '../constants';

const DATA_PREFIX = 'zenchat_data_';
const SESSION_KEY = 'zenchat_session';

export const db = {
    // --- Auth (Remote) ---

    async register(name: string, email: string, password: string): Promise<UserProfile> {
        // Call the backend API
        const profile = await api.register(name, email, password);
        
        // Save session ID locally
        localStorage.setItem(SESSION_KEY, profile.id);
        
        // Initialize local cache for this user
        this._initLocalCache(profile.id, profile);
        
        return profile;
    },

    async login(email: string, password: string): Promise<UserProfile> {
        // Call the backend API
        const profile = await api.login(email, password);
        
        localStorage.setItem(SESSION_KEY, profile.id);
        
        // Sync latest data from server
        try {
            await this.syncWithServer(profile.id);
        } catch (e) {
            console.error("Initial sync failed", e);
        }

        return profile;
    },

    // --- DEV MODE: Skip Registration ---
    loginAsDev(): UserProfile {
        const devId = 'dev-' + Math.random().toString(36).substr(2, 9);
        const profile: UserProfile = {
            id: devId,
            name: 'Developer',
            email: `dev_${devId}@local.test`,
            avatarUrl: '',
            username: `dev_${Math.floor(Math.random() * 1000)}`
        };

        localStorage.setItem(SESSION_KEY, profile.id);
        this._initLocalCache(profile.id, profile);
        console.log("Logged in as Dev User:", profile);
        return profile;
    },

    async logout() {
        localStorage.removeItem(SESSION_KEY);
        // Optional: Call api.logout() if you implement server-side session clearing
    },

    checkSession(): string | null {
        return localStorage.getItem(SESSION_KEY);
    },

    // Added for ErrorBoundary to allow full reset
    clearAllData() {
        localStorage.clear();
    },

    // --- Data Management ---

    async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
        // update on server
        // If it's a dev user, just update locally
        if (userId.startsWith('dev-')) {
            const userData = this.getData(userId);
            const updatedProfile = { ...userData.profile, ...updates };
            userData.profile = updatedProfile;
            this.saveData(userId, userData);
            return updatedProfile;
        }

        const updatedProfile = await api.updateProfile(userId, updates);
        
        // update local cache
        const userData = this.getData(userId);
        userData.profile = updatedProfile;
        this.saveData(userId, userData);

        return updatedProfile;
    },

    async createGroup(name: string, type: 'group'|'channel', members: string[], avatarUrl: string, ownerId: string) {
        if (ownerId.startsWith('dev-')) {
            // Local dev implementation mock
            return {
                id: Date.now().toString(),
                name,
                type,
                avatarUrl,
                members: [...members, ownerId],
                chatHistory: []
            };
        }
        return await api.createGroup(name, type, members, avatarUrl, ownerId);
    },

    async searchUsers(query: string, currentUserId: string): Promise<UserProfile[]> {
        return await api.searchUsers(query, currentUserId);
    },

    // --- Sync & Local Cache ---
    
    // We keep a local copy of data for speed/offline, but sync with server on load
    async syncWithServer(userId: string) {
        if (userId.startsWith('dev-')) return; // Skip sync for dev users

        try {
            const serverData = await api.syncData(userId);
            const localData = this.getData(userId);
            
            // CRITICAL FIX: Trust Server Data for History and Contacts but SANITIZE IT
            const validServerContacts = Array.isArray(serverData.contacts) 
                ? serverData.contacts.map((c: any) => this._sanitizeContact(c)).filter(Boolean)
                : [];
            
            const validLocalContacts = Array.isArray(localData.contacts) 
                ? localData.contacts.map((c: any) => this._sanitizeContact(c)).filter(Boolean) 
                : [];
            
            const mergedData: UserData = {
                ...localData,
                profile: serverData.profile || localData.profile,
                contacts: validServerContacts.length > 0 ? validServerContacts : validLocalContacts,
                chatHistory: serverData.chatHistory && Object.keys(serverData.chatHistory).length > 0 ? serverData.chatHistory : localData.chatHistory,
                settings: this._sanitizeSettings(serverData.settings || localData.settings),
                devices: serverData.devices || localData.devices
            };
            
            this.saveData(userId, mergedData);
        } catch (e) {
            console.warn("Sync failed, using local data", e);
        }
    },

    getData(userId: string): UserData {
        const defaultData = this._getDefaultData(userId);
        
        try {
            const raw = localStorage.getItem(DATA_PREFIX + userId);
            if (!raw) {
                return defaultData;
            }

            const parsed = JSON.parse(raw);
            
            // Validate Profile
            const profile = parsed.profile || defaultData.profile;
            if (!profile || typeof profile !== 'object') {
                profile.name = 'User';
                profile.id = userId;
            }

            // Validate Contacts
            let contacts = Array.isArray(parsed.contacts) ? parsed.contacts : defaultData.contacts;
            // Strict sanitization: remove invalid entries and fix partial ones
            contacts = contacts
                .map((c: any) => this._sanitizeContact(c))
                .filter((c: Contact | null) => c !== null);

            return {
                profile: profile,
                contacts: contacts,
                chatHistory: parsed.chatHistory || defaultData.chatHistory,
                settings: this._sanitizeSettings(parsed.settings),
                devices: Array.isArray(parsed.devices) ? parsed.devices : defaultData.devices
            };
        } catch (e) {
            console.error("Data corrupted, resetting", e);
            // If corrupt, clear it so we don't crash next time
            localStorage.removeItem(DATA_PREFIX + userId);
            return defaultData;
        }
    },

    // Helper to ensure contact has required fields preventing white screen of death
    _sanitizeContact(c: any): Contact | null {
        if (!c || typeof c !== 'object') return null;
        
        // If it's the Saved Messages placeholder, ensure it has the correct ID
        if (c.id === SAVED_MESSAGES_ID) {
             return { ...c, name: c.name || 'Избранное', type: 'user' };
        }

        // Must have an ID
        if (!c.id) return null;

        return {
            ...c,
            name: c.name || 'Unknown User', // Fallback name prevents Avatar crash
            avatarUrl: c.avatarUrl || '',
            unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
            isOnline: !!c.isOnline,
            type: c.type || 'user',
            lastMessage: c.lastMessage || '',
            lastMessageTime: c.lastMessageTime || Date.now()
        };
    },

    // Helper to deeply merge/repair settings
    _sanitizeSettings(settings: any): AppSettings {
        if (!settings || typeof settings !== 'object') {
            return INITIAL_SETTINGS;
        }

        // We use spread to ensure nested objects exist if they are missing in the source
        return {
            notifications: { ...INITIAL_SETTINGS.notifications, ...settings.notifications },
            privacy: { ...INITIAL_SETTINGS.privacy, ...settings.privacy },
            appearance: { ...INITIAL_SETTINGS.appearance, ...settings.appearance },
            language: settings.language || INITIAL_SETTINGS.language
        };
    },

    saveData(userId: string, data: Partial<UserData>) {
        try {
            const current = this.getData(userId);
            const updated = { ...current, ...data };
            localStorage.setItem(DATA_PREFIX + userId, JSON.stringify(updated));
        } catch (e: any) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                console.error("LocalStorage Limit Reached! Cannot save data.");
                alert("Память браузера переполнена. Некоторые сообщения могли не сохраниться локально. Пожалуйста, очистите кэш или удалите старые чаты.");
                // Optional: Attempt to clean up old chat history here if critical
            } else {
                console.error("Failed to save local data:", e);
            }
        }
    },

    _initLocalCache(userId: string, profile: UserProfile) {
        const initialData = this._getDefaultData(userId);
        initialData.profile = profile;
        try {
            localStorage.setItem(DATA_PREFIX + userId, JSON.stringify(initialData));
        } catch(e) {
            console.error("Init cache failed", e);
        }
    },

    _getDefaultData(userId: string): UserData {
         const initialData: UserData = {
            profile: { id: userId, name: '', email: '', avatarUrl: '' },
            contacts: CONTACTS, 
            chatHistory: {},
            settings: INITIAL_SETTINGS,
            devices: INITIAL_DEVICES
        };
        
        // Init default chats
        CONTACTS.forEach(c => {
            // For Saved Messages, we might want an empty history or a welcome message
            if (c.id === SAVED_MESSAGES_ID) {
                initialData.chatHistory[c.id] = [];
            } else {
                 initialData.chatHistory[c.id] = [
                    {
                        id: `msg-${c.id}-init`,
                        text: c.lastMessage || 'Привет!',
                        senderId: c.id,
                        timestamp: c.lastMessageTime || Date.now(),
                        status: 'read',
                        type: 'text'
                    }
                ];
            }
        });
        
        return initialData;
    }
};
