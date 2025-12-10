
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CURRENT_USER_ID, INITIAL_DEVICES, INITIAL_SETTINGS, CONTACTS, SAVED_MESSAGES_ID, SAVED_MESSAGES_CONTACT } from './constants';
import { Message, Contact, MessageType, AppSettings, DeviceSession, ContactType, UserProfile, UserData } from './types';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import SettingsModal from './components/SettingsModal';
import CreateChatModal from './components/CreateChatModal';
import AuthScreen from './components/AuthScreen';
import ProfileInfo from './components/ProfileInfo';
import CallOverlay from './components/CallOverlay';
import IncomingCallModal from './components/IncomingCallModal';
import { geminiService } from './services/geminiService';
import { db } from './services/db';
import { socketService } from './services/socketService';
import { soundService } from './services/soundService';
import { encryptionService } from './services/encryptionService';
import { ShieldCheck } from 'lucide-react';
import { AutoDeleteModal, ClearHistoryModal, BlockUserModal } from './components/ActionModals';
import WallpaperModal from './components/WallpaperModal';

interface SimplePeerInstance {
    on(event: string, callback: (data: any) => void): void;
    signal(data: any): void;
    destroy(): void;
    replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack, stream: MediaStream): void;
    addTrack(track: MediaStreamTrack, stream: MediaStream): void;
    removeTrack(track: MediaStreamTrack, stream: MediaStream): void;
}

declare global {
    interface Window {
        SimplePeer: any;
    }
}

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSecure, setIsSecure] = useState(false);
  
  // Data State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [devices, setDevices] = useState<DeviceSession[]>(INITIAL_DEVICES);
  const [userProfile, setUserProfile] = useState<UserProfile>({ id: '', name: '', email: '', avatarUrl: '' });

  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [typingStatus, setTypingStatus] = useState<Record<string, boolean>>({});
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileInfoOpen, setIsProfileInfoOpen] = useState(false);
  const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
  const [createChatType, setCreateChatType] = useState<ContactType>('group');
  const [settingsInitialTab, setSettingsInitialTab] = useState<'main' | 'appearance'>('main');

  // Action Modals State
  const [showAutoDeleteModal, setShowAutoDeleteModal] = useState(false);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [showBlockUserModal, setShowBlockUserModal] = useState(false);
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);

  // Call State
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle');
  const [callPeerId, setCallPeerId] = useState<string | null>(null);
  const [incomingCallData, setIncomingCallData] = useState<{ from: string; name: string; signal: any } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  
  const connectionRef = useRef<SimplePeerInstance | null>(null);
  const userProfileRef = useRef(userProfile);
  const contactsRef = useRef(contacts);
  const chatHistoryRef = useRef(chatHistory);
  const activeContactIdRef = useRef(activeContactId);
  const settingsRef = useRef(settings);
  const typingStatusTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    userProfileRef.current = userProfile;
    contactsRef.current = contacts;
    chatHistoryRef.current = chatHistory;
    activeContactIdRef.current = activeContactId;
    settingsRef.current = settings;
  }, [userProfile, contacts, chatHistory, activeContactId, settings]);

  // Keys Restoration Effect
  useEffect(() => {
      // Attempt to restore keys for any known secret chats from localStorage
      // This prevents key loss on refresh
      contacts.forEach(c => {
          if (c.isSecret) {
              encryptionService.restoreKeys(c.id);
          }
      });
  }, [contacts]);

  // Unlock Audio
  useEffect(() => {
    const handleInteraction = () => {
        soundService.init();
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('keydown', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('keydown', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  const loadUserData = (userId: string) => {
      try {
          const data = db.getData(userId);
          const safeProfile = data.profile || { id: userId, name: 'User', email: '', avatarUrl: '' };
          setUserProfile(safeProfile);
          let loadedContacts = Array.isArray(data.contacts) ? data.contacts : [];
          if (!loadedContacts.some(c => c && c.id === SAVED_MESSAGES_ID)) {
             loadedContacts = [SAVED_MESSAGES_CONTACT, ...loadedContacts];
          }
          setContacts(loadedContacts);
          setChatHistory(data.chatHistory || {});
          setSettings(data.settings || INITIAL_SETTINGS);
          setDevices(data.devices || INITIAL_DEVICES);
          setIsAuthenticated(true);
      } catch (error) {
          console.error("Failed to load user data:", error);
          db.logout();
          setIsAuthenticated(false);
      }
  };

  const persistState = (overrides: Partial<UserData>) => {
      if (!userProfile.id) return;
      db.saveData(userProfile.id, overrides);
  };

  // Check auth
  useEffect(() => {
    const activeSessionId = db.checkSession();
    if (activeSessionId) loadUserData(activeSessionId);
  }, []);

  // --- SOCKET ---
  useEffect(() => {
    if (isAuthenticated && userProfile.id) {
        socketService.connect(userProfile.id);
        
        socketService.onConnect(async () => {
            console.log("Socket connected. Syncing...");
            try { await db.syncWithServer(userProfile.id); loadUserData(userProfile.id); } 
            catch (e) { console.error(e); }
        });

        // --- E2EE HANDSHAKE HANDLERS ---
        socketService.onSecretChatRequest(async ({ from, senderPublicKey, tempChatId }) => {
            // 1. Generate our keys
            const keyPair = await encryptionService.generateChatKeys();
            // 2. Derive Shared Session Key
            const sessionKey = await encryptionService.deriveSharedSessionKey(keyPair.privateKey, senderPublicKey);
            // 3. Store Session Key
            encryptionService.storeSessionKeys(tempChatId, { keyPair, sharedKey: sessionKey });
            
            // 4. Create local contact for this secret session
            const senderContact = contactsRef.current.find(c => c.id === from);
            if (senderContact) {
                const secretContact: Contact = {
                    ...senderContact,
                    id: tempChatId,
                    name: senderContact.name,
                    isSecret: true,
                    unreadCount: 0,
                    lastMessage: '🔒 Секретный чат (E2EE)',
                    lastMessageTime: Date.now()
                };
                setContacts(prev => [secretContact, ...prev]);
                persistState({ contacts: [secretContact, ...contactsRef.current] });
            }

            // 5. Send Accept back with our Public Key
            const myPublicKey = await encryptionService.exportPublicKey(keyPair.publicKey);
            socketService.acceptSecretChat(from, myPublicKey, tempChatId);
        });

        socketService.onSecretChatAccepted(async ({ from, acceptorPublicKey, tempChatId }) => {
            // Try to retrieve keys. If missing (e.g. refresh), try restore.
            let keys = encryptionService.getLocalKeyPair(tempChatId);
            if (!keys) {
                await encryptionService.restoreKeys(tempChatId);
                keys = encryptionService.getLocalKeyPair(tempChatId);
            }

            if (keys) {
                // Finalize handshake: Derive Shared Key using my private + their public
                const sessionKey = await encryptionService.deriveSharedSessionKey(keys.privateKey, acceptorPublicKey);
                encryptionService.storeSessionKeys(tempChatId, { keyPair: keys, sharedKey: sessionKey });
                console.log("✅ Secret Chat Handshake Complete");
                
                // Add system message
                setChatHistory(prev => ({
                    ...prev,
                    [tempChatId]: [{
                        id: Date.now().toString(),
                        text: '🔒 Обмен ключами завершен. Шифрование включено.',
                        senderId: 'system',
                        timestamp: Date.now(),
                        status: 'read',
                        type: 'text'
                    }]
                }));
            } else {
                console.error("Critical: Private key not found for handshake completion. Chat may need to be recreated.");
            }
        });

        socketService.onUserStatus(({ userId, isOnline, lastSeen }) => {
            setContacts(prev => {
                const updated = prev.map(c => {
                    if (c.id === userId) {
                        return { ...c, isOnline, lastSeen };
                    }
                    return c;
                });
                persistState({ contacts: updated });
                return updated;
            });
        });

        socketService.onNewChat((newContact) => {
             setContacts(prev => {
                 if (prev.some(c => c.id === newContact.id)) return prev;
                 const updated = [newContact, ...prev];
                 persistState({ contacts: updated });
                 return updated;
             });
             setChatHistory(prev => ({ ...prev, [newContact.id]: prev[newContact.id] || [] }));
        });

        socketService.onContactUpdate((updatedProfile) => {
            setContacts(prev => {
                const index = prev.findIndex(c => c.id === updatedProfile.id);
                if (index === -1) return prev;
                const updatedContacts = [...prev];
                updatedContacts[index] = {
                    ...updatedContacts[index],
                    name: updatedProfile.name || updatedContacts[index].name,
                    avatarUrl: updatedProfile.avatarUrl || updatedContacts[index].avatarUrl,
                    bio: updatedProfile.bio,
                    username: updatedProfile.username,
                    phoneNumber: updatedProfile.phoneNumber,
                    address: updatedProfile.address,
                    birthDate: updatedProfile.birthDate,
                    statusEmoji: updatedProfile.statusEmoji,
                    profileColor: updatedProfile.profileColor,
                    profileBackgroundEmoji: updatedProfile.profileBackgroundEmoji,
                    autoDelete: updatedProfile.autoDelete
                };
                persistState({ contacts: updatedContacts });
                return updatedContacts;
            });
        });
        
        socketService.onTyping(({ from, isTyping }) => {
            setTypingStatus(prev => ({ ...prev, [from]: isTyping }));
            if (isTyping) {
                if (typingStatusTimeoutRef.current[from]) clearTimeout(typingStatusTimeoutRef.current[from]);
                typingStatusTimeoutRef.current[from] = setTimeout(() => {
                    setTypingStatus(prev => ({ ...prev, [from]: false }));
                }, 5000);
            }
        });

        socketService.onMessageEdited(({ message, chatId }) => {
            const myId = userProfileRef.current.id;
            const targetId = chatId || (message.senderId === myId ? activeContactIdRef.current || message.senderId : message.senderId);
            setChatHistory(prev => {
                const history = prev[targetId] || [];
                const updatedMsgs = history.map(m => m.id === message.id ? { ...m, text: message.text, isEdited: true } : m);
                const newHistory = { ...prev, [targetId]: updatedMsgs };
                persistState({ chatHistory: newHistory });
                return newHistory;
            });
        });

        socketService.onMessage(async ({ message, chatId }) => {
            const senderId = message.senderId;
            const myId = userProfileRef.current.id;
            const targetId = chatId || (senderId === myId ? activeContactIdRef.current || senderId : senderId);

            // Decrypt if needed (Check isEncrypted flag from server)
            let processedMessage = message;
            if (message.isEncrypted && message.iv) {
                // Decrypt payload
                const decryptedText = await encryptionService.decryptMessage(targetId, message.text, message.iv);
                processedMessage = { ...message, text: decryptedText };
            }

            if (senderId === myId) {
                const existing = chatHistoryRef.current[targetId]?.find(m => m.id === message.id);
                if (existing) return;
            }

            const currentSettings = settingsRef.current;
            const currentContacts = contactsRef.current;
            const targetContact = currentContacts.find(c => c.id === targetId);
            const isMuted = targetContact?.isMuted;
            
            if (senderId !== myId && !isMuted) soundService.play('receive', currentSettings.notifications.chatSounds);

            setChatHistory(prev => {
                const history = prev[targetId] || [];
                if (history.some(m => m.id === message.id)) return prev;
                const updatedHistory = { ...prev, [targetId]: [...history, processedMessage] };
                persistState({ chatHistory: updatedHistory });
                return updatedHistory;
            });

            setContacts(prev => {
                const exists = prev.find(c => c.id === targetId);
                let updatedList = [...prev];
                const previewText = processedMessage.type === 'contact' ? 'Контакт' : (processedMessage.type === 'text' ? processedMessage.text : (processedMessage.type === 'image' ? 'Фото' : 'Вложение'));

                if (!exists) {
                     const newContact: Contact = {
                         id: targetId,
                         name: chatId ? 'Group' : 'User',
                         avatarUrl: '',
                         type: chatId ? 'group' : 'user',
                         lastMessage: previewText,
                         lastMessageTime: processedMessage.timestamp,
                         unreadCount: 1,
                         isOnline: true
                     };
                     updatedList = [newContact, ...prev];
                     db.syncWithServer(myId).then(() => loadUserData(myId));
                } else {
                    updatedList = prev.map(c => c.id === targetId ? {
                        ...c,
                        lastMessage: previewText,
                        lastMessageTime: processedMessage.timestamp,
                        unreadCount: targetId === activeContactIdRef.current ? 0 : c.unreadCount + 1
                    } : c);
                }
                updatedList.sort((a, b) => {
                    if (a.id === targetId) return -1;
                    if (b.id === targetId) return 1;
                    return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
                });
                persistState({ contacts: updatedList });
                return updatedList;
            });
        });

        socketService.onMessageSent(({ tempId, status }) => {
            setChatHistory(prev => {
                const newHistory = { ...prev };
                let found = false;
                Object.keys(newHistory).forEach(contactId => {
                    const messages = newHistory[contactId];
                    if (!Array.isArray(messages)) return;
                    const msgIndex = messages.findIndex(m => m.id === tempId);
                    if (msgIndex !== -1) {
                        const updatedMsgs = [...messages];
                        updatedMsgs[msgIndex] = { ...updatedMsgs[msgIndex], status: status as any };
                        newHistory[contactId] = updatedMsgs;
                        found = true;
                    }
                });
                if (found) {
                   persistState({ chatHistory: newHistory });
                   return newHistory;
                }
                return prev;
            });
        });

        socketService.onMessagesRead(({ chatId }) => {
             setChatHistory(prev => {
                 const history = prev[chatId];
                 if (!history) return prev;
                 const hasUnread = history.some(m => m.senderId === userProfileRef.current.id && m.status === 'sent');
                 if (!hasUnread) return prev;
                 const updatedMsgs = history.map(m => (m.senderId === userProfileRef.current.id && m.status === 'sent') ? { ...m, status: 'read' as const } : m);
                 const newHistory = { ...prev, [chatId]: updatedMsgs };
                 persistState({ chatHistory: newHistory });
                 return newHistory;
             });
        });

        socketService.onIncomingCall(({ from, name, signal }) => {
            if (callStatus === 'connected' && callPeerId === from) {
                 connectionRef.current?.signal(signal);
                 return;
            }
            setIncomingCallData({ from, name, signal });
            setCallStatus('receiving');
            soundService.startRingtone(settingsRef.current.notifications.sound);
        });

        socketService.onCallAccepted((signal) => {
             setCallStatus('connected');
             soundService.stopRingtone();
             soundService.play('callStart', true);
             connectionRef.current?.signal(signal);
        });

        socketService.onIceCandidate(({ candidate }) => connectionRef.current?.signal(candidate));
        socketService.onCallEnded(() => leaveCall());

        return () => socketService.disconnect();
    }
  }, [isAuthenticated, userProfile.id]); 

  const getAudioConstraints = () => ({
      echoCancellation: echoCancellation,
      noiseSuppression: noiseSuppression,
      autoGainControl: true,
      channelCount: 1
  });

  const leaveCall = () => {
      soundService.stopRingtone();
      if (callStatus !== 'idle') soundService.play('callEnd', true);
      setCallStatus('idle');
      const targetId = callPeerId || (incomingCallData ? incomingCallData.from : null);
      if (connectionRef.current) {
          try { connectionRef.current.destroy(); } catch(e) {}
          connectionRef.current = null;
      }
      if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
          setLocalStream(null);
      }
      setRemoteStream(null);
      setIncomingCallData(null);
      setCallPeerId(null);
      setIsMuted(false);
      setIsScreenSharing(false);
      if (targetId) socketService.endCall(targetId);
  };

  const startCall = async () => {
      if (!activeContactId) return;
      setCallStatus('calling');
      setCallPeerId(activeContactId);
      soundService.play('callStart', true);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: getAudioConstraints() });
          setLocalStream(stream);
          if (!window.SimplePeer) return;
          const peer = new window.SimplePeer({ initiator: true, trickle: false, stream: stream });
          peer.on('signal', (data: any) => socketService.callUser(activeContactId, data, userProfile.name));
          peer.on('stream', (stream: MediaStream) => {
              setRemoteStream(stream);
              stream.onaddtrack = () => setRemoteStream(new MediaStream(stream.getTracks()));
          });
          peer.on('error', () => leaveCall());
          connectionRef.current = peer;
      } catch (err) { setCallStatus('idle'); }
  };

  const answerCall = async () => {
      if (!incomingCallData) return;
      soundService.stopRingtone();
      setCallStatus('connected');
      setCallPeerId(incomingCallData.from);
      soundService.play('callStart', true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: getAudioConstraints() });
        setLocalStream(stream);
        const peer = new window.SimplePeer({ initiator: false, trickle: false, stream: stream });
        peer.on('signal', (data: any) => socketService.answerCall(incomingCallData.from, data));
        peer.on('stream', (stream: MediaStream) => {
            setRemoteStream(stream);
            stream.onaddtrack = () => setRemoteStream(new MediaStream(stream.getTracks()));
        });
        peer.on('error', () => leaveCall());
        peer.signal(incomingCallData.signal);
        connectionRef.current = peer;
      } catch (err) { leaveCall(); }
  };

  const toggleMute = () => {
      if (localStream) {
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack) {
              audioTrack.enabled = !audioTrack.enabled;
              setIsMuted(!audioTrack.enabled);
          }
      }
  };

  const toggleScreenShare = async () => { 
      if (isScreenSharing) {
          stopScreenSharing();
          return;
      }
      try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          const videoTrack = screenStream.getVideoTracks()[0];
          
          if (localStream && connectionRef.current) {
              const oldVideoTrack = localStream.getVideoTracks()[0];
              if (oldVideoTrack) {
                  connectionRef.current.replaceTrack(oldVideoTrack, videoTrack, localStream);
                  localStream.removeTrack(oldVideoTrack);
                  oldVideoTrack.stop();
              } else {
                  connectionRef.current.addTrack(videoTrack, localStream);
              }
              localStream.addTrack(videoTrack);
              setIsScreenSharing(true);
              
              videoTrack.onended = () => stopScreenSharing();
          }
      } catch(e) {
          console.error("Screen share failed", e);
      }
  };

  const stopScreenSharing = async () => {
      if (!localStream) return;
      const screenTrack = localStream.getVideoTracks()[0];
      if (screenTrack) {
          screenTrack.stop();
          localStream.removeTrack(screenTrack);
          if (connectionRef.current) {
              connectionRef.current.removeTrack(screenTrack, localStream);
          }
      }
      setIsScreenSharing(false);
  };

  const toggleAudioFeature = async (feature: 'noise' | 'echo') => {
      if (feature === 'noise') setNoiseSuppression(!noiseSuppression);
      if (feature === 'echo') setEchoCancellation(!echoCancellation);
      
      // Hot-swap audio track
      if (localStream) {
          const oldTrack = localStream.getAudioTracks()[0];
          const wasEnabled = oldTrack.enabled;
          oldTrack.stop();
          localStream.removeTrack(oldTrack);
          
          const newStream = await navigator.mediaDevices.getUserMedia({ 
              audio: { 
                  noiseSuppression: feature === 'noise' ? !noiseSuppression : noiseSuppression,
                  echoCancellation: feature === 'echo' ? !echoCancellation : echoCancellation,
                  autoGainControl: true
              } 
          });
          const newTrack = newStream.getAudioTracks()[0];
          newTrack.enabled = wasEnabled;
          localStream.addTrack(newTrack);
          
          if (connectionRef.current) {
              connectionRef.current.replaceTrack(oldTrack, newTrack, localStream);
          }
      }
  };

  const handleLoginSuccess = (profile: UserProfile) => loadUserData(profile.id);
  const handleLogout = async () => {
      socketService.disconnect();
      await db.logout();
      setIsAuthenticated(false);
      setActiveContactId(null);
      setContacts([]);
  };
  const handleUpdateSettings = (s: AppSettings) => { setSettings(s); persistState({ settings: s }); };
  const handleUpdateProfile = async (p: UserProfile) => {
      try { const up = await db.updateProfile(userProfile.id, p); setUserProfile(up); } catch(e) { throw e; }
  };
  const handleTerminateSessions = () => { const nd = devices.filter(d => d.isCurrent); setDevices(nd); persistState({ devices: nd }); };
  const handleSearchUsers = (q: string) => db.searchUsers(q, userProfile.id);
  const handleAddContact = (p: UserProfile) => { 
      const newContact: Contact = { id: p.id, name: p.name, avatarUrl: p.avatarUrl, type: 'user', unreadCount:0, isOnline: false, lastMessageTime: Date.now() };
      setContacts([newContact, ...contacts]); setActiveContactId(p.id); setIsMobileSidebarOpen(false);
  };
  const handleCreateChat = async (n: string, m: string[], a: string) => { 
      await db.createGroup(n, createChatType, m, a, userProfile.id); setIsCreateChatOpen(false); 
  };
  const handleToggleMute = (cid: string) => { 
      const uc = contacts.map(c => c.id === cid ? { ...c, isMuted: !c.isMuted } : c); setContacts(uc); persistState({ contacts: uc }); 
  };
  
  // NEW: Handle Create Secret Chat (Real P2P Handshake)
  const handleCreateSecretChat = async (targetId: string) => {
      const originalContact = contacts.find(c => c.id === targetId);
      if (!originalContact) return;

      const secretChatId = `secret-${targetId}-${Date.now()}`;
      
      // 1. Generate our keys
      const keyPair = await encryptionService.generateChatKeys();
      // Store in memory AND persist
      encryptionService.storeSessionKeys(secretChatId, { keyPair });
      
      // 2. Export public key
      const myPublicKey = await encryptionService.exportPublicKey(keyPair.publicKey);

      // 3. Create local placeholder contact
      const secretContact: Contact = {
          ...originalContact,
          id: secretChatId, 
          name: originalContact.name,
          isSecret: true,
          unreadCount: 0,
          lastMessage: '⏳ Ожидание ключей...',
          lastMessageTime: Date.now()
      };

      setContacts([secretContact, ...contacts]);
      setChatHistory(prev => ({ ...prev, [secretChatId]: [] }));
      setActiveContactId(secretChatId);
      persistState({ contacts: [secretContact, ...contacts] });

      // 4. Send Request via Socket
      socketService.requestSecretChat(targetId, myPublicKey, secretChatId);
  };

  const handleSendMessage = useCallback(async (text: string, file?: File | null, type: MessageType = 'text', duration?: number, replyToId?: string, isForwarded?: boolean, contactInfo?: any) => {
      if (!activeContactId) return;
      const mid = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      let attachUrl = '';
      if (file) {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          await new Promise(resolve => reader.onload = resolve);
          attachUrl = reader.result as string;
      }
      
      const msg: Message = {
          id: mid, text, senderId: userProfile.id, timestamp: Date.now(), status: 'sending', type,
          attachmentUrl: attachUrl, replyTo: replyToId ? { id: replyToId, text: 'Reply', senderName: 'User' } : undefined,
          isForwarded, duration, contactInfo
      };
      
      setChatHistory(prev => ({ ...prev, [activeContactId]: [...(prev[activeContactId]||[]), msg] }));
      
      const activeContact = contacts.find(c => c.id === activeContactId);

      if (activeContact?.isSecret) {
          // Encrypt before sending
          const encrypted = await encryptionService.encryptMessage(activeContactId, text);
          if (encrypted) {
              await socketService.sendMessage(msg, activeContactId, encrypted);
          } else {
              console.error("Encryption failed, msg not sent. Keys might be missing.");
              // Optional: Trigger key recovery or alert user
          }
          return; 
      }

      if (activeContactId !== 'gemini-ai' && activeContactId !== SAVED_MESSAGES_ID) {
          await socketService.sendMessage(msg, activeContactId);
      } else if (activeContactId === SAVED_MESSAGES_ID) {
          msg.status = 'read';
          db.saveData(userProfile.id, { chatHistory: { [SAVED_MESSAGES_ID]: [...(chatHistory[SAVED_MESSAGES_ID]||[]), msg] } });
      } else {
          // Gemini Logic
          try {
              const responseText = await geminiService.sendMessage(activeContactId, text, contacts.find(c=>c.id===activeContactId)?.systemInstruction, attachUrl, file?.type);
              const replyMsg: Message = {
                  id: Date.now().toString(), text: responseText, senderId: activeContactId, timestamp: Date.now(), status: 'read', type: 'text'
              };
              setChatHistory(prev => ({ ...prev, [activeContactId]: [...prev[activeContactId], { ...msg, status: 'read' }, replyMsg] }));
          } catch(e) {
              console.error(e);
          }
      }
  }, [activeContactId, userProfile.id, contacts, chatHistory]);

  const handleSendSticker = (url: string) => handleSendMessage('', null, 'sticker');
  const handleSendLocation = (lat: number, lng: number) => { /* ... */ };
  const handleForwardMessage = (cid: string, m: Message) => {
      setActiveContactId(cid);
      handleSendMessage(m.text, null, m.type, m.duration, undefined, true);
  };

  // --- NEW HANDLERS ---
  const handleBlockUser = async (targetId: string, isBlocked: boolean) => {
      try {
          const response = await fetch(`/api/users/${userProfile.id}/block`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('zenchat_session')}`
              },
              body: JSON.stringify({ targetId, isBlocked })
          });
          if (response.ok) {
              const data = await response.json();
              setUserProfile(prev => ({ ...prev, blockedUsers: data.blockedUsers }));
              persistState({ profile: { ...userProfile, blockedUsers: data.blockedUsers } });
          }
      } catch (e) { console.error("Block failed", e); }
  };

  const handleClearHistory = async (targetId: string) => {
      try {
          await fetch(`/api/users/${userProfile.id}/clear`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('zenchat_session')}` 
              },
              body: JSON.stringify({ targetId })
          });
          // Clear messages
          setChatHistory(prev => ({ ...prev, [targetId]: [] }));
          
          // Clear contact preview
          setContacts(prev => {
              const updated = prev.map(c => c.id === targetId ? { ...c, lastMessage: '', lastMessageTime: Date.now() } : c);
              persistState({ contacts: updated, chatHistory: { ...chatHistory, [targetId]: [] } });
              return updated;
          });
      } catch (e) { console.error("Clear failed", e); }
  };

  const handleSetAutoDelete = async (targetId: string, seconds: number) => {
      try {
          await fetch(`/api/users/${userProfile.id}/autodelete`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('zenchat_session')}` 
              },
              body: JSON.stringify({ targetId, seconds })
          });
          setContacts(prev => {
              const updated = prev.map(c => c.id === targetId ? { ...c, autoDelete: seconds } : c);
              persistState({ contacts: updated });
              return updated;
          });
      } catch (e) { console.error("Auto delete failed", e); }
  };

  const handleWallpaperChange = (background: string) => {
      const newSettings = {
          ...settings,
          appearance: {
              ...settings.appearance,
              chatBackground: background
          }
      };
      setSettings(newSettings);
      persistState({ settings: newSettings });
  };

  const handleShareContact = (targetId: string) => {
      const contact = contacts.find(c => c.id === targetId);
      if (!contact) return;
      
      const contactInfo = {
          id: contact.id,
          name: contact.name,
          avatarUrl: contact.avatarUrl,
          username: contact.username,
          phoneNumber: contact.phoneNumber
      };
      
      // If we are currently in a chat, send this contact info to the active chat
      if (activeContactId) {
          handleSendMessage('', null, 'contact', undefined, undefined, false, contactInfo);
          // Show toast?
      } else {
          alert("Откройте чат, куда хотите отправить этот контакт.");
      }
  };

  if (!isAuthenticated) return <AuthScreen onLoginSuccess={handleLoginSuccess} />;

  const activeContact = contacts.find(c => c.id === activeContactId);
  const isBlocked = activeContactId && userProfile.blockedUsers?.includes(activeContactId);

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-white font-inter safe-area-bottom">
      
      {isSecure && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-5 fade-in duration-500">
              <ShieldCheck size={18} />
              <span className="text-sm font-medium">Защищенное соединение (AES-256)</span>
          </div>
      )}

      {/* Action Modals */}
      <AutoDeleteModal 
          isOpen={showAutoDeleteModal}
          onClose={() => setShowAutoDeleteModal(false)}
          currentValue={contacts.find(c => c.id === actionTargetId)?.autoDelete || 0}
          onSet={(seconds) => { if (actionTargetId) handleSetAutoDelete(actionTargetId, seconds); }}
      />
      <ClearHistoryModal 
          isOpen={showClearHistoryModal}
          onClose={() => setShowClearHistoryModal(false)}
          onClear={() => { if (actionTargetId) handleClearHistory(actionTargetId); }}
      />
      <BlockUserModal 
          isOpen={showBlockUserModal}
          onClose={() => setShowBlockUserModal(false)}
          userName={contacts.find(c => c.id === actionTargetId)?.name || 'User'}
          isBlocked={actionTargetId ? userProfile.blockedUsers?.includes(actionTargetId) || false : false}
          onBlock={() => { if (actionTargetId) handleBlockUser(actionTargetId, !userProfile.blockedUsers?.includes(actionTargetId)); }}
      />
      <WallpaperModal 
          isOpen={showWallpaperModal}
          onClose={() => setShowWallpaperModal(false)}
          onSave={handleWallpaperChange}
          currentBackground={settings.appearance.chatBackground}
      />

      <Sidebar
        contacts={contacts}
        activeContactId={activeContactId}
        onSelectContact={(id) => { setActiveContactId(id); if (window.innerWidth < 768) setIsMobileSidebarOpen(false); }}
        isOpenMobile={isMobileSidebarOpen}
        closeMobile={() => setIsMobileSidebarOpen(false)}
        onOpenSettings={() => { setSettingsInitialTab('main'); setIsSettingsOpen(true); }}
        onCreateChat={(type) => { setCreateChatType(type); setIsCreateChatOpen(true); }}
        onSearchUsers={handleSearchUsers}
        onAddContact={handleAddContact}
      />
      
      <main className="flex-1 flex flex-col h-full relative transition-all duration-300 w-full">
        {activeContactId && activeContact ? (
          <ChatWindow
            contact={activeContact}
            messages={chatHistory[activeContactId] || []}
            onSendMessage={handleSendMessage}
            onSendSticker={handleSendSticker}
            onSendLocation={handleSendLocation}
            isTyping={!!typingStatus[activeContactId]}
            onBack={() => { setIsMobileSidebarOpen(true); setActiveContactId(null); }}
            appearance={settings?.appearance}
            onOpenProfile={() => setIsProfileInfoOpen(true)}
            onCall={startCall}
            currentUserId={userProfile.id}
            onForwardMessage={handleForwardMessage}
            
            // New Actions
            onBlockUser={(id) => { setActionTargetId(id); setShowBlockUserModal(true); }}
            onClearHistory={(id) => { setActionTargetId(id); setShowClearHistoryModal(true); }}
            onSetAutoDelete={(id) => { setActionTargetId(id); setShowAutoDeleteModal(true); }}
            onShareContact={handleShareContact}
            onChangeWallpaper={() => setShowWallpaperModal(true)}
            onCreateSecretChat={handleCreateSecretChat}
            isBlocked={!!isBlocked}
          />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-[#f8fafc] dark:bg-slate-900 flex-col text-gray-400">
            <div className="w-24 h-24 bg-gray-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <span className="text-4xl">👋</span>
            </div>
            <p className="text-lg font-medium">Выберите чат для начала общения</p>
          </div>
        )}
      </main>

      {callStatus === 'receiving' && incomingCallData && <IncomingCallModal callerName={incomingCallData.name} onAccept={answerCall} onDecline={leaveCall} />}
      {(callStatus === 'calling' || callStatus === 'connected') && <CallOverlay contact={contacts.find(c => c.id === activeContactId) || { name: 'User', avatarUrl: '' } as any} onEndCall={leaveCall} localStream={localStream} remoteStream={remoteStream} isMuted={isMuted} onToggleMute={toggleMute} status={callStatus === 'calling' ? 'Звоним...' : 'Идет разговор'} isScreenSharing={isScreenSharing} onToggleScreenShare={toggleScreenShare} noiseSuppression={noiseSuppression} echoCancellation={echoCancellation} onToggleAudioFeature={toggleAudioFeature} />}
      
      <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          userProfile={userProfile} 
          onUpdateProfile={handleUpdateProfile} 
          settings={settings} 
          onUpdateSettings={handleUpdateSettings} 
          devices={devices} 
          onTerminateSessions={handleTerminateSessions} 
          onLogout={handleLogout} 
          initialTab={settingsInitialTab}
      />
      <CreateChatModal isOpen={isCreateChatOpen} onClose={() => setIsCreateChatOpen(false)} onCreate={handleCreateChat} type={createChatType} contacts={contacts} onSearchUsers={handleSearchUsers} />
      
      {activeContactId && activeContact && (
          <ProfileInfo 
              isOpen={isProfileInfoOpen} 
              onClose={() => setIsProfileInfoOpen(false)} 
              contact={activeContact} 
              messages={chatHistory[activeContactId] || []} 
              onToggleMute={handleToggleMute} 
              onBlockUser={(id) => { setActionTargetId(id); setShowBlockUserModal(true); }}
              onClearHistory={(id) => { setActionTargetId(id); setShowClearHistoryModal(true); }}
              onSetAutoDelete={(id) => { setActionTargetId(id); setShowAutoDeleteModal(true); }}
              onShareContact={handleShareContact}
              onChangeWallpaper={() => setShowWallpaperModal(true)}
              onCreateSecretChat={handleCreateSecretChat}
              isBlocked={!!isBlocked}
          />
      )}
    </div>
  );
};

export default App;
