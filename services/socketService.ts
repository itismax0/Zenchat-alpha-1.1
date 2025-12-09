
import { io, Socket } from 'socket.io-client';
import { Message, Contact } from '../types';

// Use relative path for unified deployment (Render)
// For local development, the Vite proxy will forward this to the backend port.
const SOCKET_URL = '/';

class SocketService {
    private socket: Socket | null = null;
    private userId: string | null = null;

    connect(userId: string) {
        if (this.socket?.connected && this.userId === userId) return;

        this.userId = userId;
        this.socket = io(SOCKET_URL, {
            path: '/socket.io', // Standard Socket.io path
            transports: ['websocket', 'polling'], // Try websocket first
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        this.socket.on('connect', () => {
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

    sendMessage(message: Message, receiverId: string) {
        if (this.socket) {
            this.socket.emit('send_message', {
                message,
                receiverId
            });
        }
    }

    sendTyping(receiverId: string, isTyping: boolean) {
        if (this.socket) {
            this.socket.emit('typing', {
                to: receiverId,
                from: this.userId,
                isTyping
            });
        }
    }

    // New: Mark messages as read
    markAsRead(chatId: string, readerId: string) {
        if (this.socket) {
            this.socket.emit('mark_read', { chatId, readerId });
        }
    }

    // --- WebRTC Signaling Methods ---

    callUser(userToCall: string, signalData: any, name: string) {
        if (this.socket) {
            this.socket.emit("callUser", {
                userToCall,
                signalData,
                from: this.userId,
                name
            });
        }
    }

    answerCall(to: string, signal: any) {
        if (this.socket) {
            this.socket.emit("answerCall", { signal, to });
        }
    }

    sendIceCandidate(target: string, candidate: any) {
        if (this.socket) {
            this.socket.emit("iceCandidate", { target, candidate });
        }
    }

    endCall(to: string) {
        if (this.socket) {
            this.socket.emit("endCall", { to });
        }
    }

    // --- Listeners ---

    onConnect(callback: () => void) {
        this.socket?.on('connect', callback);
    }

    onMessage(callback: (data: { message: Message, chatId?: string }) => void) {
        this.socket?.on('receive_message', callback);
    }

    onMessageSent(callback: (data: { tempId: string, status: string }) => void) {
        this.socket?.on('message_sent', callback);
    }

    // New: Listen for read receipts
    onMessagesRead(callback: (data: { chatId: string }) => void) {
        this.socket?.on('messages_read', callback);
    }

    onTyping(callback: (data: { from: string, isTyping: boolean }) => void) {
        this.socket?.on('typing', callback);
    }

    onUserStatus(callback: (data: { userId: string, isOnline: boolean }) => void) {
        this.socket?.on('user_status', callback);
    }
    
    // New: Listen for new groups/chats
    onNewChat(callback: (contact: Contact) => void) {
        this.socket?.on('new_chat', callback);
    }
    
    // New: Listen for contact profile updates
    onContactUpdate(callback: (data: any) => void) {
        this.socket?.on('contact_update', callback);
    }

    // Call Listeners
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
