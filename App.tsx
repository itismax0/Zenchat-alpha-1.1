
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

// Add type definitions for SimplePeer which is loaded via CDN script
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
  
  // Data State - Initialize with fallback to prevent undefined errors
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS || {
    notifications: { show: true, preview: true, sound: true, chatSounds: true, vibration: false },
    privacy: { email: 'Мои контакты', lastSeen: 'Все', profilePhoto: 'Все', passcode: false, twoFactor: true },
    appearance: { darkMode: false, chatBackground: 'default', textSize: 100 },
    language: 'Русский'
  });
  const [devices, setDevices] = useState<DeviceSession[]>(INITIAL_DEVICES);
  const [userProfile, setUserProfile] = useState<UserProfile>({
      id: '', name: '', email: '', avatarUrl: ''
  });

  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [typingStatus, setTypingStatus] = useState<Record<string, boolean>>({});
  
  // FIX: Default to TRUE so mobile users see the list immediately, preventing white screen
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(true);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileInfoOpen, setIsProfileInfoOpen] = useState(false);
  
  // Create Chat State
  const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
  const [createChatType, setCreateChatType] = useState<ContactType>('group');

  // --- Call State ---
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle');
  // New state to track who we are talking to, even if we switch chats
  const [callPeerId, setCallPeerId] = useState<string | null>(null);

  const [incomingCallData, setIncomingCallData] = useState<{ from: string; name: string; signal: any } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  // Advanced Call Features
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  
  // Ref changed from RTCPeerConnection to SimplePeerInstance
  const connectionRef = useRef<SimplePeerInstance | null>(null);

  // Refs for state access inside callbacks/effects
  const userProfileRef = useRef(userProfile);
  const contactsRef = useRef(contacts);
  const chatHistoryRef = useRef(chatHistory);
  const activeContactIdRef = useRef(activeContactId);
  const settingsRef = useRef(settings);

  // Typing timeout ref to auto-clear stuck typing indicators
  const typingStatusTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    userProfileRef.current = userProfile;
    contactsRef.current = contacts;
    chatHistoryRef.current = chatHistory;
    activeContactIdRef.current = activeContactId;
    settingsRef.current = settings;
  }, [userProfile, contacts, chatHistory, activeContactId, settings]);

  // Unlock Audio Context on first interaction
  useEffect(() => {
    const handleInteraction = () => {
        soundService.init();
        // Remove listeners once unlocked
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

  // Load User Data Helper
  const loadUserData = (userId: string) => {
      try {
          const data = db.getData(userId);
          
          // Safety checks to prevent white screen crashes
          const safeProfile = data.profile || { id: userId, name: 'User', email: '', avatarUrl: '' };
          setUserProfile(safeProfile);
          
          // Ensure Saved Messages is in contacts if missing (for legacy data)
          let loadedContacts = Array.isArray(data.contacts) ? data.contacts : [];
          if (!loadedContacts.some(c => c && c.id === SAVED_MESSAGES_ID)) {
             loadedContacts = [SAVED_MESSAGES_CONTACT, ...loadedContacts];
          }

          setContacts(loadedContacts);
          setChatHistory(data.chatHistory || {});
          
          // Use safe fallback for settings
          setSettings(data.settings || INITIAL_SETTINGS);
          setDevices(data.devices || INITIAL_DEVICES);
          setIsAuthenticated(true);
      } catch (error) {
          console.error("Failed to load user data:", error);
          // Safety fallback: logout to clear bad session state
          db.logout();
          setIsAuthenticated(false);
      }
  };

  // Helper to persist state updates
  const persistState = (overrides: Partial<UserData>) => {
      if (!userProfile.id) return;
      db.saveData(userProfile.id, overrides);
  };

  const handleForwardMessage = (contactId: string, message: Message) => {
      // 1. Prepare forwarded message
      const forwardedMsg: Message = {
          ...message,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, // Robust ID
          timestamp: Date.now(),
          status: contactId === SAVED_MESSAGES_ID ? 'read' : 'sending',
          senderId: userProfile.id || CURRENT_USER_ID,
          isForwarded: true,
          // If forwarding media, ensure we have the URL
          attachmentUrl: message.attachmentUrl,
          type: message.type
      };

      // 2. Update Local State (UI)
      const currentHistory = chatHistoryRef.current;
      const targetHistory = currentHistory[contactId] || [];
      const updatedHistory = {
          ...currentHistory,
          [contactId]: [...targetHistory, forwardedMsg]
      };
      setChatHistory(updatedHistory);

      // 3. Update Contact Last Message
      const currentContacts = contactsRef.current;
      const updatedContacts = currentContacts.map(c => c.id === contactId ? {
          ...c,
          lastMessage: `Forwarded: ${message.text || 'Вложение'}`,
          lastMessageTime: Date.now()
      } : c);
      setContacts(updatedContacts);

      // 4. Persist to DB
      persistState({
          chatHistory: updatedHistory,
          contacts: updatedContacts
      });

      // 5. Emit Socket Event
      if (contactId !== 'gemini-ai') {
          socketService.sendMessage(forwardedMsg, contactId);
      }

      // Play Send Sound
      soundService.play('send', settings.notifications.chatSounds);
  };

  // Check auth on mount
  useEffect(() => {
    const activeSessionId = db.checkSession();
    if (activeSessionId) {
        loadUserData(activeSessionId);
    }
  }, []);

  // --- SOCKET CONNECTION & LISTENERS ---
  useEffect(() => {
    if (isAuthenticated && userProfile.id) {
        socketService.connect(userProfile.id);

        // Request Notification Permission
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        // --- Connection / Reconnection Handling ---
        socketService.onConnect(async () => {
            console.log("Socket connected/reconnected. Syncing data...");
            try {
                await db.syncWithServer(userProfile.id);
                loadUserData(userProfile.id); 
            } catch (e) {
                console.error("Failed to sync on reconnect", e);
            }
        });

        // Listen for new chats (e.g. groups)
        socketService.onNewChat((newContact) => {
             setContacts(prev => {
                 if (prev.some(c => c.id === newContact.id)) return prev;
                 const updated = [newContact, ...prev];
                 persistState({ contacts: updated });
                 return updated;
             });
             setChatHistory(prev => ({
                 ...prev,
                 [newContact.id]: prev[newContact.id] || []
             }));
        });

        // Listen for contact profile updates
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
                    profileBackgroundEmoji: updatedProfile.profileBackgroundEmoji
                };
                
                persistState({ contacts: updatedContacts });
                return updatedContacts;
            });
        });
        
        // Listen for typing events
        socketService.onTyping(({ from, isTyping }) => {
            setTypingStatus(prev => ({ ...prev, [from]: isTyping }));
            if (isTyping) {
                if (typingStatusTimeoutRef.current[from]) {
                    clearTimeout(typingStatusTimeoutRef.current[from]);
                }
                typingStatusTimeoutRef.current[from] = setTimeout(() => {
                    setTypingStatus(prev => ({ ...prev, [from]: false }));
                }, 5000);
            }
        });

        // Listen for incoming messages
        socketService.onMessage(({ message, chatId }) => {
            const senderId = message.senderId;
            const myId = userProfileRef.current.id;

            const targetId = chatId || (senderId === myId ? activeContactIdRef.current || senderId : senderId);

            // --- DUPLICATE CHECK ---
            if (senderId === myId) {
                const existing = chatHistoryRef.current[targetId]?.find(m => m.id === message.id);
                if (existing) return; // Ignore duplicate
            }

            const currentSettings = settingsRef.current;
            const currentContacts = contactsRef.current;
            const targetContact = currentContacts.find(c => c.id === targetId);
            const isMuted = targetContact?.isMuted;
            
            // Play Sound
            if (senderId !== myId && !isMuted) {
                soundService.play('receive', currentSettings.notifications.chatSounds);
            }

            const currentActiveId = activeContactIdRef.current;
            
            // Notification Logic
            const isHidden = document.hidden;
            const isDifferentChat = targetId !== currentActiveId;

            if (currentSettings.notifications.show && (isHidden || isDifferentChat) && senderId !== myId && !isMuted) {
                if ("Notification" in window && Notification.permission === "granted") {
                    const sender = currentContacts.find(c => c.id === senderId);
                    const group = chatId ? currentContacts.find(c => c.id === chatId) : null;
                    
                    const title = group ? `${sender?.name || 'Кто-то'} в ${group.name}` : (sender?.name || 'Новое сообщение');
                    const bodyText = message.type === 'text' ? message.text : 'Вложение';
                    const previewText = currentSettings.notifications.preview ? bodyText : 'Новое сообщение';

                    const notif = new Notification(title, {
                        body: previewText,
                        icon: sender?.avatarUrl || '/vite.svg',
                        tag: targetId 
                    });

                    notif.onclick = () => {
                        window.focus();
                        setActiveContactId(targetId);
                    };
                }
            } else if (senderId !== myId && !isDifferentChat) {
                // If I am in the chat and receive a message, I immediately read it.
                socketService.markAsRead(targetId, myId);
            }

            // Update State
            setChatHistory(prev => {
                const history = prev[targetId] || [];
                if (history.some(m => m.id === message.id)) return prev;
                
                const updatedHistory = { ...prev, [targetId]: [...history, message] };
                persistState({ chatHistory: updatedHistory });
                return updatedHistory;
            });

            // Update Contact (Last Message & Unread)
            setContacts(prev => {
                const exists = prev.find(c => c.id === targetId);
                let updatedList = [...prev];

                const previewText = message.type === 'text' ? message.text : 
                           (message.type === 'image' ? 'Фото' : 'Вложение');

                if (!exists) {
                     const newContact: Contact = {
                         id: targetId,
                         name: chatId ? 'Group' : 'User', // Fallback
                         avatarUrl: '',
                         type: chatId ? 'group' : 'user',
                         lastMessage: previewText,
                         lastMessageTime: message.timestamp,
                         unreadCount: 1,
                         isOnline: true
                     };
                     updatedList = [newContact, ...prev];
                     db.syncWithServer(myId).then(() => loadUserData(myId));
                } else {
                    updatedList = prev.map(c => c.id === targetId ? {
                        ...c,
                        lastMessage: previewText,
                        lastMessageTime: message.timestamp,
                        unreadCount: targetId === currentActiveId ? 0 : c.unreadCount + 1
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

        // Listen for message status updates (Sent)
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
                        updatedMsgs[msgIndex] = { ...updatedMsgs[msgIndex], status: status as 'sending' | 'sent' | 'read' | 'error' };
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

        // NEW: Listen for READ receipts (Double Check)
        socketService.onMessagesRead(({ chatId }) => {
             // The user `chatId` has read my messages.
             // I need to find the chat with `chatId` and mark all my messages as read.
             setChatHistory(prev => {
                 const history = prev[chatId];
                 if (!history) return prev;
                 
                 // If there are any sent messages that are not yet read, mark them
                 const hasUnread = history.some(m => m.senderId === userProfileRef.current.id && m.status === 'sent');
                 
                 if (!hasUnread) return prev;
                 
                 const updatedMsgs = history.map(m => 
                     (m.senderId === userProfileRef.current.id && m.status === 'sent') 
                     ? { ...m, status: 'read' as const } 
                     : m
                 );
                 
                 const newHistory = { ...prev, [chatId]: updatedMsgs };
                 persistState({ chatHistory: newHistory });
                 return newHistory;
             });
        });

        // Call Listeners
        socketService.onIncomingCall(({ from, name, signal }) => {
            // RENEGOTIATION CHECK: If we are already connected to this user, don't show incoming call modal, just signal.
            if (callStatus === 'connected' && callPeerId === from) {
                 connectionRef.current?.signal(signal);
                 return;
            }

            console.log("Incoming call from:", name);
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

        socketService.onIceCandidate(({ candidate }) => {
             connectionRef.current?.signal(candidate);
        });

        socketService.onCallEnded(() => {
            leaveCall();
        });

        // User Status
        socketService.onUserStatus((data) => {
            // data can contain multiple user updates if needed, but for now assuming singular or we can adapt
        });

        return () => {
            socketService.disconnect();
        };
    }
  }, [isAuthenticated, userProfile.id]); 

  // --- CALL LOGIC ---
  const getAudioConstraints = () => ({
      echoCancellation: echoCancellation,
      noiseSuppression: noiseSuppression,
      autoGainControl: true,
      channelCount: 1
  });

  const stopScreenSharing = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: false, 
            audio: getAudioConstraints() 
        });
        
        const screenTrack = localStream?.getVideoTracks()[0];
        
        if (screenTrack) {
            screenTrack.stop();
            if (connectionRef.current) {
                connectionRef.current.removeTrack(screenTrack, localStream!);
            }
            localStream?.removeTrack(screenTrack);
        }
        
        setIsScreenSharing(false);
      } catch (e) {
          console.error("Error stopping screen share", e);
      }
  };

  const startCall = async () => {
      if (!activeContactId) return;
      const contactToCall = contacts.find(c => c.id === activeContactId);
      if (!contactToCall) return;

      setCallStatus('calling');
      setCallPeerId(activeContactId); // Track who we are calling
      soundService.play('callStart', true);
      
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
              video: false, 
              audio: getAudioConstraints() 
          });
          setLocalStream(stream);

          if (!window.SimplePeer) {
              console.error("SimplePeer library not loaded");
              alert("Ошибка инициализации звонка. Попробуйте обновить страницу.");
              setCallStatus('idle');
              return;
          }

          const peer = new window.SimplePeer({
              initiator: true,
              trickle: false,
              stream: stream
          });

          peer.on('signal', (data: any) => {
              socketService.callUser(activeContactId, data, userProfile.name);
          });

          peer.on('stream', (stream: MediaStream) => {
              setRemoteStream(stream);
              // Ensure we re-render if track is added later (e.g. screen share)
              stream.onaddtrack = () => setRemoteStream(new MediaStream(stream.getTracks()));
              stream.onremovetrack = () => setRemoteStream(new MediaStream(stream.getTracks()));
          });
          
          peer.on('error', (err: any) => {
              console.error("Peer error:", err);
              leaveCall();
          });

          connectionRef.current = peer;

      } catch (err) {
          console.error("Error accessing media devices", err);
          alert("Не удалось получить доступ к микрофону. Проверьте разрешения.");
          setCallStatus('idle');
      }
  };

  const answerCall = async () => {
      if (!incomingCallData) return;
      
      soundService.stopRingtone();
      setCallStatus('connected');
      setCallPeerId(incomingCallData.from); // Track who we are answering
      soundService.play('callStart', true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: false, 
            audio: getAudioConstraints() 
        });
        setLocalStream(stream);

        if (!window.SimplePeer) {
              console.error("SimplePeer library not loaded");
              alert("Ошибка инициализации звонка.");
              leaveCall();
              return;
        }

        const peer = new window.SimplePeer({
            initiator: false,
            trickle: false,
            stream: stream
        });

        peer.on('signal', (data: any) => {
            socketService.answerCall(incomingCallData.from, data);
        });

        peer.on('stream', (stream: MediaStream) => {
            setRemoteStream(stream);
            stream.onaddtrack = () => setRemoteStream(new MediaStream(stream.getTracks()));
            stream.onremovetrack = () => setRemoteStream(new MediaStream(stream.getTracks()));
        });
        
        peer.on('error', (err: any) => {
             console.error("Peer error:", err);
             leaveCall();
        });

        peer.signal(incomingCallData.signal);
        connectionRef.current = peer;

      } catch (err) {
         console.error("Error answering call", err);
         alert("Не удалось получить доступ к микрофону.");
         leaveCall();
      }
  };

  const toggleScreenShare = async () => {
      if (isScreenSharing) {
          await stopScreenSharing();
      } else {
          try {
              const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
              const screenTrack = stream.getVideoTracks()[0];
              
              if (connectionRef.current && localStream) {
                  const currentVideoTrack = localStream.getVideoTracks()[0];
                  
                  if (currentVideoTrack) {
                      connectionRef.current.replaceTrack(currentVideoTrack, screenTrack, localStream);
                      currentVideoTrack.stop();
                      localStream.removeTrack(currentVideoTrack);
                  } else {
                      connectionRef.current.addTrack(screenTrack, localStream);
                  }
                  
                  localStream.addTrack(screenTrack);
              }

              screenTrack.onended = () => {
                  stopScreenSharing();
              };

              setIsScreenSharing(true);
          } catch (e) {
              console.error("Error starting screen share", e);
              setIsScreenSharing(false);
          }
      }
  };

  const toggleAudioFeature = async (feature: 'noise' | 'echo') => {
      const newNoise = feature === 'noise' ? !noiseSuppression : noiseSuppression;
      const newEcho = feature === 'echo' ? !echoCancellation : echoCancellation;
      
      if (feature === 'noise') setNoiseSuppression(newNoise);
      if (feature === 'echo') setEchoCancellation(newEcho);

      if (localStream) {
          try {
              const audioTrack = localStream.getAudioTracks()[0];
              if (audioTrack) {
                  const newStream = await navigator.mediaDevices.getUserMedia({
                      audio: {
                          echoCancellation: newEcho,
                          noiseSuppression: newNoise,
                          autoGainControl: true,
                          channelCount: 1
                      },
                      video: false
                  });
                  const newAudioTrack = newStream.getAudioTracks()[0];
                  
                  // Preserve Mute State
                  newAudioTrack.enabled = audioTrack.enabled;
                  
                  if (connectionRef.current) {
                      connectionRef.current.replaceTrack(audioTrack, newAudioTrack, localStream);
                  }
                  
                  localStream.removeTrack(audioTrack);
                  localStream.addTrack(newAudioTrack);
                  audioTrack.stop();
              }
          } catch (e) {
              console.error("Failed to update audio constraints", e);
          }
      }
  };

  const leaveCall = () => {
      soundService.stopRingtone();
      
      if (callStatus !== 'idle') {
          soundService.play('callEnd', true);
      }

      setCallStatus('idle');
      const targetId = callPeerId || (incomingCallData ? incomingCallData.from : null);
      
      if (connectionRef.current) {
          try {
            connectionRef.current.destroy();
          } catch(e) { console.error("Error destroying peer", e) }
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
      
      if (targetId) {
          socketService.endCall(targetId);
      }
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

  // --- STANDARD APP LOGIC ---

  const handleLoginSuccess = (profile: UserProfile) => {
      loadUserData(profile.id);
  };

  const handleLogout = async () => {
      socketService.disconnect();
      await db.logout();
      setIsAuthenticated(false);
      setActiveContactId(null);
      setContacts([]);
  };

  // Safe check for settings existence
  useEffect(() => {
    const isDark = settings?.appearance?.darkMode ?? false;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings?.appearance?.darkMode]);

  useEffect(() => {
    if (isAuthenticated && !activeContactId && window.innerWidth >= 768 && contacts.length > 0) {
        const first = contacts.find(c => c && c.id);
        if (first) {
            setActiveContactId(first.id);
        }
    }
    if (isAuthenticated && !activeContactId && window.innerWidth < 768) {
        setIsMobileSidebarOpen(true);
    }
  }, [isAuthenticated, activeContactId, contacts]);

  const activeContact = contacts.find((c) => c && c.id === activeContactId);
  const activeMessages = activeContactId ? (chatHistory[activeContactId] || []) : [];

  // Reset unread count AND SEND READ RECEIPT when opening a chat
  useEffect(() => {
      if (activeContactId && activeContact) {
          if (activeContact.unreadCount > 0) {
              const updatedContacts = contacts.map(c => 
                  c.id === activeContactId ? { ...c, unreadCount: 0 } : c
              );
              setContacts(updatedContacts);
              persistState({ contacts: updatedContacts });
              
              // Emit Mark As Read
              if (activeContact.type === 'user' && activeContact.id !== 'gemini-ai' && activeContact.id !== SAVED_MESSAGES_ID) {
                   socketService.markAsRead(activeContactId, userProfile.id);
              }
          }
      }
  }, [activeContactId, activeContact]);

  const handleTerminateSessions = () => {
    const newDevices = devices.filter(d => d.isCurrent);
    setDevices(newDevices);
    persistState({ devices: newDevices });
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
      setSettings(newSettings);
      persistState({ settings: newSettings });
  };

  const handleUpdateProfile = async (newProfile: UserProfile) => {
      if (!userProfile.id) return;
      try {
        const updatedProfile = await db.updateProfile(userProfile.id, newProfile);
        setUserProfile(updatedProfile);
      } catch (e) {
        console.error("Failed to update profile", e);
      }
  };

  const handleSearchUsers = async (query: string): Promise<UserProfile[]> => {
      if (!userProfile.id) return [];
      return await db.searchUsers(query, userProfile.id);
  };

  const handleAddContact = (profile: UserProfile) => {
      const existing = contacts.find(c => c.id === profile.id);
      if (existing) {
          setActiveContactId(existing.id);
          setIsMobileSidebarOpen(false); // Close sidebar on mobile
          return;
      }

      const newContact: Contact = {
          id: profile.id,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          lastMessage: 'Начать общение',
          lastMessageTime: Date.now(),
          unreadCount: 0,
          isOnline: false,
          type: 'user',
          email: profile.username ? `@${profile.username}` : profile.email,
          // Hydrate with profile data
          bio: profile.bio,
          phoneNumber: profile.phoneNumber,
          address: profile.address,
          birthDate: profile.birthDate,
          statusEmoji: profile.statusEmoji,
          profileColor: profile.profileColor,
          profileBackgroundEmoji: profile.profileBackgroundEmoji
      };

      const updatedContacts = [newContact, ...contacts];
      const updatedHistory = { ...chatHistory, [profile.id]: [] };

      setContacts(updatedContacts);
      setChatHistory(updatedHistory);
      setActiveContactId(profile.id);
      setIsMobileSidebarOpen(false); // Close sidebar on mobile
      
      persistState({ contacts: updatedContacts, chatHistory: updatedHistory });
  };

  const handleCreateChat = async (name: string, members: string[], avatarUrl: string) => {
    if (createChatType === 'user') return;

    try {
        await db.createGroup(name, createChatType, members, avatarUrl, userProfile.id);
        setIsCreateChatOpen(false);
    } catch (e) {
        console.error("Failed to create group", e);
        alert("Не удалось создать группу");
    }
  };
  
  const handleToggleMute = (contactId: string) => {
      const updatedContacts = contacts.map(c => 
          c.id === contactId ? { ...c, isMuted: !c.isMuted } : c
      );
      setContacts(updatedContacts);
      persistState({ contacts: updatedContacts });
  };

  const handleSendMessage = useCallback(async (
      text: string, 
      file?: File | null, 
      type: MessageType = 'text', 
      duration?: number, 
      replyToId?: string, 
      isForwarded?: boolean
  ) => {
    if (!activeContactId) return;

    const currentContactId = activeContactId;
    const currentContact = contacts.find(c => c.id === currentContactId);
    
    let attachmentUrl = '';
    let base64Data = '';
    if (file) {
        attachmentUrl = URL.createObjectURL(file);
        base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
        });
    }

    let replyToData;
    if (replyToId) {
        const messages = chatHistory[currentContactId] || [];
        const originalMsg = messages.find(m => m.id === replyToId);
        if (originalMsg) {
            let senderName = 'Unknown';
            if (originalMsg.senderId === userProfile.id) senderName = 'Вы';
            else if (currentContact) senderName = currentContact.name;
            else if (currentContact?.members) {
                 const m = currentContact.members.find(u => u.id === originalMsg.senderId);
                 if (m) senderName = m.name;
            }
            
            replyToData = {
                id: originalMsg.id,
                text: originalMsg.text || (originalMsg.type === 'image' ? 'Фото' : 'Вложение'),
                senderName: senderName
            };
        }
    }

    const newMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      text,
      senderId: userProfile.id || CURRENT_USER_ID,
      timestamp: Date.now(),
      status: currentContactId === SAVED_MESSAGES_ID ? 'read' : 'sending',
      type: type,
      attachmentUrl: attachmentUrl, 
      fileName: file?.name,
      fileSize: file ? (file.size / 1024).toFixed(1) + ' КБ' : undefined,
      duration: duration,
      replyTo: replyToData,
      isForwarded: isForwarded
    };

    const updatedMessages = [...(chatHistory[currentContactId] || []), newMessage];
    const newHistory = { ...chatHistory, [currentContactId]: updatedMessages };
    setChatHistory(newHistory);

    const previewText = type === 'image' ? '📷 Фото' : (type === 'file' ? '📄 Файл' : (type === 'voice' ? '🎤 Голосовое сообщение' : text));
    const updatedContacts = contacts.map(c => c.id === currentContactId ? {
        ...c, 
        lastMessage: previewText, 
        lastMessageTime: Date.now() 
    } : c);
    
    updatedContacts.sort((a, b) => {
        if (a.id === currentContactId) return -1;
        if (b.id === currentContactId) return 1;
        return (b.lastMessageTime || 0) - (a.lastMessageTime || 0);
    });

    setContacts(updatedContacts);

    const messageToSave = {
        ...newMessage,
        attachmentUrl: base64Data || attachmentUrl 
    };
    
    const historyForSave = { ...chatHistory, [currentContactId]: [...(chatHistory[currentContactId] || []), messageToSave] };
    
    persistState({ chatHistory: historyForSave, contacts: updatedContacts });

    soundService.play('send', settings.notifications.chatSounds);

    if (currentContactId !== 'gemini-ai') {
        const messageToSend = {
            ...newMessage,
            attachmentUrl: base64Data || attachmentUrl
        };
        socketService.sendMessage(messageToSend, currentContactId);
    }
    
    if (currentContactId === 'gemini-ai') {
        setTypingStatus(prev => ({ ...prev, [currentContactId]: true }));

        try {
            const responseText = await geminiService.sendMessage(
                currentContactId, 
                text, 
                currentContact?.systemInstruction,
                (type === 'image' || type === 'voice') ? base64Data : undefined,
                file?.type
            );

            setTypingStatus(prev => ({ ...prev, [currentContactId]: false }));

            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: responseText,
                senderId: currentContactId,
                timestamp: Date.now(),
                status: 'read',
                type: 'text'
            };

            soundService.play('receive', settings.notifications.chatSounds);

            const historyWithAI = { 
                ...newHistory,
                [currentContactId]: updatedMessages.map(m => m.id === newMessage.id ? {...m, status: 'read' as const} : m).concat(aiMessage)
            };
            
            const contactsWithAI = updatedContacts.map(c => c.id === currentContactId ? {
                ...c, 
                lastMessage: responseText, 
                lastMessageTime: Date.now() 
            } : c);

            setChatHistory(historyWithAI);
            setContacts(contactsWithAI);

            persistState({ chatHistory: historyWithAI, contacts: contactsWithAI });

        } catch (error) {
            setTypingStatus(prev => ({ ...prev, [currentContactId]: false }));
            console.error("Failed to get response", error);
        }
    }

  }, [activeContactId, contacts, chatHistory, userProfile.id, settings.notifications.chatSounds]);

  const handleSendLocation = useCallback(async (latitude: number, longitude: number) => {
      if (!activeContactId) return;
      const currentContactId = activeContactId;

      const newMessage: Message = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          text: '',
          senderId: userProfile.id || CURRENT_USER_ID,
          timestamp: Date.now(),
          status: currentContactId === SAVED_MESSAGES_ID ? 'read' : 'sent', 
          type: 'location',
          latitude,
          longitude
      };

      const updatedMessages = [...(chatHistory[currentContactId] || []), newMessage];
      const newHistory = { ...chatHistory, [currentContactId]: updatedMessages };
      
      const updatedContacts = contacts.map(c => c.id === currentContactId ? {
          ...c, 
          lastMessage: '📍 Геолокация', 
          lastMessageTime: Date.now() 
      } : c);

      setChatHistory(newHistory);
      setContacts(updatedContacts);
      persistState({ chatHistory: newHistory, contacts: updatedContacts });

      soundService.play('send', settings.notifications.chatSounds);

      if (currentContactId !== 'gemini-ai') {
          socketService.sendMessage(newMessage, currentContactId);
      }

      if (currentContactId === 'gemini-ai') {
        // ... gemini location handling ...
      }

  }, [activeContactId, chatHistory, contacts, userProfile.id, settings.notifications.chatSounds]);

  const handleSendSticker = useCallback((url: string) => {
      if (!activeContactId) return;
      const currentContactId = activeContactId;

      const newMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        text: '',
        senderId: userProfile.id || CURRENT_USER_ID,
        timestamp: Date.now(),
        status: currentContactId === SAVED_MESSAGES_ID ? 'read' : 'sending',
        type: 'sticker',
        attachmentUrl: url
      };

      const updatedMessages = [...(chatHistory[currentContactId] || []), newMessage];
      const newHistory = { ...chatHistory, [currentContactId]: updatedMessages };
      setChatHistory(newHistory);
      persistState({ chatHistory: newHistory });

      soundService.play('send', settings.notifications.chatSounds);

      if (currentContactId !== 'gemini-ai') {
          socketService.sendMessage(newMessage, currentContactId);
      }
  }, [activeContactId, contacts, chatHistory, userProfile.id, settings.notifications.chatSounds]);

  if (!isAuthenticated) {
      return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-white font-inter safe-area-bottom">
      <Sidebar
        contacts={contacts}
        activeContactId={activeContactId}
        onSelectContact={(id) => {
            setActiveContactId(id);
            if (window.innerWidth < 768) {
              setIsMobileSidebarOpen(false);
            }
        }}
        isOpenMobile={isMobileSidebarOpen}
        closeMobile={() => setIsMobileSidebarOpen(false)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onCreateChat={(type) => {
            setCreateChatType(type);
            setIsCreateChatOpen(true);
        }}
        onSearchUsers={handleSearchUsers}
        onAddContact={handleAddContact}
      />
      
      <main className={`flex-1 flex flex-col h-full relative transition-all duration-300 w-full`}>
        {activeContact ? (
          <ChatWindow
            contact={activeContact}
            messages={activeMessages}
            onSendMessage={handleSendMessage}
            onSendSticker={handleSendSticker}
            onSendLocation={handleSendLocation}
            isTyping={!!typingStatus[activeContact.id]}
            onBack={() => {
                setIsMobileSidebarOpen(true);
                setActiveContactId(null);
            }}
            appearance={settings?.appearance}
            onOpenProfile={() => setIsProfileInfoOpen(true)}
            onCall={startCall}
            currentUserId={userProfile.id}
            onForwardMessage={handleForwardMessage}
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

      {/* CALL OVERLAYS */}
      {callStatus === 'receiving' && incomingCallData && (
          <IncomingCallModal 
              callerName={incomingCallData.name} 
              onAccept={answerCall}
              onDecline={leaveCall}
          />
      )}

      {(callStatus === 'calling' || callStatus === 'connected') && (
          <CallOverlay 
              contact={contacts.find(c => c && c.id === activeContactId) || { name: incomingCallData?.name || 'Unknown', avatarUrl: '' }} 
              onEndCall={leaveCall}
              localStream={localStream}
              remoteStream={remoteStream}
              isMuted={isMuted}
              onToggleMute={toggleMute}
              status={callStatus === 'calling' ? 'Звоним...' : 'Идет разговор'}
              
              isScreenSharing={isScreenSharing}
              onToggleScreenShare={toggleScreenShare}
              noiseSuppression={noiseSuppression}
              echoCancellation={echoCancellation}
              onToggleAudioFeature={toggleAudioFeature}
          />
      )}

      {/* Settings Modal */}
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
      />

      {/* Create Chat Modal */}
      <CreateChatModal 
        isOpen={isCreateChatOpen}
        onClose={() => setIsCreateChatOpen(false)}
        onCreate={handleCreateChat}
        type={createChatType}
        contacts={contacts}
        onSearchUsers={handleSearchUsers}
      />

      {/* Profile Info Modal */}
      {activeContact && (
        <ProfileInfo 
            isOpen={isProfileInfoOpen}
            onClose={() => setIsProfileInfoOpen(false)}
            contact={activeContact}
            messages={activeMessages}
            onToggleMute={handleToggleMute}
        />
      )}
    </div>
  );
};

export default App;
