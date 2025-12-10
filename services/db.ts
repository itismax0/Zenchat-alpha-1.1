
import { api } from './api';
import { AppSettings, Contact, Message, UserData, UserProfile, DeviceSession } from '../types';
import { CONTACTS, INITIAL_SETTINGS, INITIAL_DEVICES, SAVED_MESSAGES_ID } from '../constants';

const DATA_PREFIX = 'zenchat_data_';
const SESSION_KEY = 'zenchat_session';
const TOKEN_KEY = 'zenchat_token';

export const db = {
    // --- Auth (Remote) ---

    async register(name: string, email: string, password: string): Promise<UserProfile> {
        // Call the backend API
        const response = await api.register(name, email, password);
        
        // Extract token and profile
        const { token, ...profile } = response;

        // Save session ID and Token locally
        localStorage.setItem(SESSION_KEY, profile.id);
        if (token) localStorage.setItem(TOKEN_KEY, token);
        
        // Initialize local cache for this user
        this._initLocalCache(profile.id, profile);
        
        return profile;
    },

    async login(email: string, password: string): Promise<UserProfile> {
        // Call the backend API
        const response = await api.login(email, password);
        
        const { token, ...profile } = response;
        
        localStorage.setItem(SESSION_KEY, profile.id);
        if (token) localStorage.setItem(TOKEN_KEY, token);
        
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
        // Dev users don't use tokens usually, or use a dummy one if needed
        this._initLocalCache(profile.id, profile);
        console.log("Logged in as Dev User:", profile);
        return profile;
    },

    async logout() {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(TOKEN_KEY);
    },

    checkSession(): string | null {
        return localStorage.getItem(SESSION_KEY);
    },

    clearAllData() {
        localStorage.clear();
    },

    // --- Data Management ---

    async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
        if (userId.startsWith('dev-')) {
            const userData = this.getData(userId);
            const updatedProfile = { ...userData.profile, ...updates };
            userData.profile = updatedProfile;
            this.saveData(userId, userData);
            return updatedProfile;
        }

        const updatedProfile = await api.updateProfile(userId, updates);
        
        const userData = this.getData(userId);
        userData.profile = updatedProfile;
        this.saveData(userId, userData);

        return updatedProfile;
    },

    async createGroup(name: string, type: 'group'|'channel', members: string[], avatarUrl: string, ownerId: string) {
        if (ownerId.startsWith('dev-')) {
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
    
    async syncWithServer(userId: string) {
        if (userId.startsWith('dev-')) return; 

        try {
            const serverData = await api.syncData(userId);
            const localData = this.getData(userId);
            
            // CRITICAL FIX: Merge contacts instead of overwriting to prevent data loss.
            const contactMap = new Map<string, Contact>();
            
            // 1. Populate with local contacts first
            localData.contacts.forEach(c => {
                if(c && c.id) contactMap.set(c.id, c);
            });

            // 2. Merge server contacts
            if (Array.isArray(serverData.contacts)) {
                 serverData.contacts.forEach((serverContact: any) => {
                    const sanitized = this._sanitizeContact(serverContact);
                    if (sanitized) {
                        const local = contactMap.get(sanitized.id);
                        if (local) {
                            // Merge strategy: Trust server for profile info, trust local for recent state if newer
                            contactMap.set(sanitized.id, {
                                ...local,
                                ...sanitized, // Server overwrites name/avatar/username
                                // Keep local transient state if it looks newer (e.g. unread count pending sync)
                                unreadCount: Math.max(local.unreadCount || 0, sanitized.unreadCount || 0),
                                lastMessageTime: Math.max(local.lastMessageTime || 0, sanitized.lastMessageTime || 0),
                                lastMessage: (local.lastMessageTime || 0) > (sanitized.lastMessageTime || 0) ? local.lastMessage : sanitized.lastMessage
                            });
                        } else {
                            contactMap.set(sanitized.id, sanitized);
                        }
                    }
                });
            }

            const mergedContacts = Array.from(contactMap.values());
            
            // 3. Merge Chat History carefully
            const mergedHistory = { ...localData.chatHistory };
            if (serverData.chatHistory) {
                Object.keys(serverData.chatHistory).forEach(chatId => {
                    // Simple merge: trust server array if it exists. 
                    // Ideally we should de-dupe messages here too, but for now server authority is safer for history.
                    if (serverData.chatHistory[chatId] && serverData.chatHistory[chatId].length > 0) {
                        mergedHistory[chatId] = serverData.chatHistory[chatId];
                    }
                });
            }

            const mergedData: UserData = {
                ...localData,
                profile: serverData.profile || localData.profile,
                contacts: mergedContacts,
                chatHistory: mergedHistory,
                settings: this._sanitizeSettings(serverData.settings || localData.settings),
                devices: serverData.devices || localData.devices
            };
            
            this.saveData(userId, mergedData);
        } catch (e) {
            console.warn("Sync failed, utilizing local data cache only.", e);
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
            console.error("Data corrupted, returning default but NOT overwriting yet", e);
            return defaultData;
        }
    },

    _sanitizeContact(c: any): Contact | null {
        if (!c || typeof c !== 'object') return null;
        
        // Fix forSaved Messages
        if (c.id === SAVED_MESSAGES_ID) {
             return { ...c, name: c.name || 'Избранное', type: 'user', id: SAVED_MESSAGES_ID };
        }

        if (!c.id) return null;

        // CRITICAL FIX: Ensure optional fields like username are preserved!
        return {
            ...c,
            id: c.id,
            name: c.name || 'Unknown User', 
            avatarUrl: c.avatarUrl || '',
            unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
            isOnline: !!c.isOnline,
            type: c.type || 'user',
            lastMessage: c.lastMessage || '',
            lastMessageTime: c.lastMessageTime || Date.now(),
            username: c.username || undefined, // WAS MISSING
            bio: c.bio || undefined,           // WAS MISSING
            phoneNumber: c.phoneNumber || undefined, // WAS MISSING
            description: c.description || undefined
        };
    },

    _sanitizeSettings(settings: any): AppSettings {
        if (!settings || typeof settings !== 'object') {
            return INITIAL_SETTINGS;
        }
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
                console.error("CRITICAL: LocalStorage Limit Reached! Data not saved.");
                // We could attempt to trigger a cleanup routine here
            } else {
                console.error("Failed to save local data:", e);
            }
        }
    },

    _initLocalCache(userId: string, profile: UserProfile) {
        const initialData = this._getDefaultData(userId);
        initialData.profile = profile;
        this.saveData(userId, initialData);
    },

    _getDefaultData(userId: string): UserData {
         const initialData: UserData = {
            profile: { id: userId, name: '', email: '', avatarUrl: '' },
            contacts: CONTACTS, 
            chatHistory: {},
            settings: INITIAL_SETTINGS,
            devices: INITIAL_DEVICES
        };
        
        CONTACTS.forEach(c => {
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
