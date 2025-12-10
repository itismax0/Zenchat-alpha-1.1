
import { io, Socket } from 'socket.io-client';
import { Message, Contact } from '../types';
import { encryptionService } from './encryptionService';

const SOCKET_URL = '/';

class SocketService {
    private socket: Socket | null = null;
    private userId: string | null = null;

    connect(userId: string) {
        if (this.socket?.connected && this.userId === userId) return;

        this.userId = userId;
        this.socket = io(SOCKET_URL, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            auth: {
                token: localStorage.getItem('zenchat_session') 
            }
        });

        this.socket.on('connect', async () => {
            console.log('Connected to socket server');
            this.socket?.emit('join', userId);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from socket server');
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    // Updated sendMessage to support encrypted payloads directly
    async sendMessage(message: Message, receiverId: string, encryptedPayload?: { content: string, iv: string }) {
        if (this.socket) {
            if (encryptedPayload) {
                // Send E2EE payload
                this.socket.emit('send_message', {
                    receiverId,
                    message: {
                        ...message,
                        text: encryptedPayload.content, // Send ciphertext in text field
                        isEncrypted: true,
                        iv: encryptedPayload.iv
                    }
                });
            } else {
                // Standard message
                this.socket.emit('send_message', { message, receiverId });
            }
        }
    }

    // --- E2EE Handshake Methods ---

    requestSecretChat(targetId: string, senderPublicKey: string, tempChatId: string) {
        this.socket?.emit('secret_chat_request', { targetId, senderPublicKey, tempChatId });
    }

    acceptSecretChat(targetId: string, acceptorPublicKey: string, tempChatId: string) {
        this.socket?.emit('secret_chat_accepted', { targetId, acceptorPublicKey, tempChatId });
    }

    // --- Standard Methods ---

    editMessage(message: Message, chatId: string) {
        if (this.socket) {
            this.socket.emit('edit_message', { message, chatId });
        }
    }

    sendTyping(receiverId: string, isTyping: boolean) {
        if (this.socket) {
            this.socket.emit('typing', { to: receiverId, from: this.userId, isTyping });
        }
    }

    markAsRead(chatId: string, readerId: string) {
        if (this.socket) {
            this.socket.emit('mark_read', { chatId, readerId });
        }
    }

    callUser(userToCall: string, signalData: any, name: string) {
        if (this.socket) {
            this.socket.emit("callUser", { userToCall, signalData, from: this.userId, name });
        }
    }

    answerCall(to: string, signal: any) {
        if (this.socket) {
            this.socket.emit("answerCall", { signal, to });
        }
    }

    endCall(to: string) {
        if (this.socket) {
            this.socket.emit("endCall", { to });
        }
    }

    sendIceCandidate(target: string, candidate: any) {
        if (this.socket) {
            this.socket.emit("iceCandidate", { target, candidate });
        }
    }

    // --- Listeners ---

    onConnect(callback: () => void) {
        this.socket?.on('connect', callback);
    }

    onMessage(callback: (data: { message: any, chatId?: string }) => void) {
        this.socket?.on('receive_message', (data) => {
            callback(data);
        });
    }

    onMessageSent(callback: (data: { tempId: string, status: string }) => void) {
        this.socket?.on('message_sent', callback);
    }

    // --- E2EE Listeners ---
    
    onSecretChatRequest(callback: (data: { from: string, senderPublicKey: string, tempChatId: string }) => void) {
        this.socket?.on('secret_chat_request', callback);
    }

    onSecretChatAccepted(callback: (data: { from: string, acceptorPublicKey: string, tempChatId: string }) => void) {
        this.socket?.on('secret_chat_accepted', callback);
    }

    // --- Other Listeners ---

    onMessageEdited(callback: (data: { message: Message, chatId: string }) => void) {
        this.socket?.on('message_edited', callback);
    }

    onMessagesRead(callback: (data: { chatId: string }) => void) {
        this.socket?.on('messages_read', callback);
    }

    onTyping(callback: (data: { from: string, isTyping: boolean }) => void) {
        this.socket?.on('typing', callback);
    }

    onUserStatus(callback: (data: { userId: string, isOnline: boolean, lastSeen: number }) => void) {
        this.socket?.on('user_status', callback);
    }
    
    onNewChat(callback: (contact: Contact) => void) {
        this.socket?.on('new_chat', callback);
    }
    
    onContactUpdate(callback: (data: any) => void) {
        this.socket?.on('contact_update', callback);
    }

    onIncomingCall(callback: (data: { from: string, name: string, signal: any }) => void) {
        this.socket?.on('callUser', callback);
    }

    onCallAccepted(callback: (signal: any) => void) {
        this.socket?.on('callAccepted', callback);
    }

    onIceCandidate(callback: (data: { candidate: any }) => void) {
        this.socket?.on('iceCandidate', callback);
    }

    onCallEnded(callback: () => void) {
        this.socket?.on('callEnded', callback);
    }
}

export const socketService = new SocketService();
