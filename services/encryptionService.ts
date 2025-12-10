
import { api } from './api';

interface ChatSessionKeys {
    keyPair?: CryptoKeyPair;
    sharedKey?: CryptoKey;
}

class EncryptionService {
  // Map<ChatId, Keys> - Stores keys in memory for the current session
  private chatSessions: Map<string, ChatSessionKeys> = new Map();
  
  constructor() {}

  // --- 1. KEY GENERATION (ECDH P-256) ---
  
  async generateChatKeys(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true, // extractable
      ["deriveKey", "deriveBits"]
    );
  }

  // --- 2. KEY DERIVATION (Shared Secret) ---

  async deriveSharedSessionKey(localPrivateKey: CryptoKey, remotePublicKeyBase64: string): Promise<CryptoKey> {
      try {
          const remotePublicKeyBuffer = this.base64ToArrayBuffer(remotePublicKeyBase64);
          const remotePublicKey = await window.crypto.subtle.importKey(
              "raw",
              remotePublicKeyBuffer,
              { name: "ECDH", namedCurve: "P-256" },
              false,
              []
          );

          const sharedKey = await window.crypto.subtle.deriveKey(
              {
                  name: "ECDH",
                  public: remotePublicKey,
              },
              localPrivateKey,
              {
                  name: "AES-GCM",
                  length: 256,
              },
              true, // Extractable for debugging/visual proof (Fingerprint)
              ["encrypt", "decrypt"]
          );

          return sharedKey;
      } catch (e) {
          console.error("Key Derivation Failed:", e);
          throw e;
      }
  }

  // --- 3. SESSION MANAGEMENT & PERSISTENCE ---

  // Stores keys for a specific chat ID
  storeSessionKeys(chatId: string, keys: ChatSessionKeys) {
      const existing = this.chatSessions.get(chatId) || {};
      this.chatSessions.set(chatId, { ...existing, ...keys });
      this.saveKeys(chatId); // Auto-save to storage
  }

  getSessionKey(chatId: string): CryptoKey | undefined {
      return this.chatSessions.get(chatId)?.sharedKey;
  }
  
  getLocalKeyPair(chatId: string): CryptoKeyPair | undefined {
      return this.chatSessions.get(chatId)?.keyPair;
  }

  // Helpers for Persistence (JWK)
  private async serializeKey(key: CryptoKey): Promise<JsonWebKey> {
      return await window.crypto.subtle.exportKey("jwk", key);
  }

  private async deserializeKey(jwk: JsonWebKey, algorithm: any, usages: KeyUsage[]): Promise<CryptoKey> {
      return await window.crypto.subtle.importKey("jwk", jwk, algorithm, true, usages);
  }

  async saveKeys(chatId: string) {
      const session = this.chatSessions.get(chatId);
      if (!session) return;

      const data: any = {};
      try {
        if (session.keyPair?.privateKey) data.privateKey = await this.serializeKey(session.keyPair.privateKey);
        if (session.keyPair?.publicKey) data.publicKey = await this.serializeKey(session.keyPair.publicKey);
        if (session.sharedKey) data.sharedKey = await this.serializeKey(session.sharedKey);

        localStorage.setItem(`zenchat_keys_${chatId}`, JSON.stringify(data));
      } catch (e) {
          console.error("Failed to save keys", e);
      }
  }

  async restoreKeys(chatId: string): Promise<boolean> {
      if (this.chatSessions.has(chatId)) return true;

      const raw = localStorage.getItem(`zenchat_keys_${chatId}`);
      if (!raw) return false;

      try {
          const data = JSON.parse(raw);
          const keys: ChatSessionKeys = {};
          const ecdhAlgo = { name: "ECDH", namedCurve: "P-256" };
          const aesAlgo = { name: "AES-GCM" };

          if (data.privateKey && data.publicKey) {
              keys.keyPair = {
                  privateKey: await this.deserializeKey(data.privateKey, ecdhAlgo, ["deriveKey", "deriveBits"]),
                  publicKey: await this.deserializeKey(data.publicKey, ecdhAlgo, [])
              };
          }
          if (data.sharedKey) {
              keys.sharedKey = await this.deserializeKey(data.sharedKey, aesAlgo, ["encrypt", "decrypt"]);
          }

          this.chatSessions.set(chatId, keys);
          return true;
      } catch (e) {
          console.error(`Failed to restore keys for ${chatId}`, e);
          return false;
      }
  }

  // --- 4. ENCRYPTION / DECRYPTION (AES-256-GCM) ---

  async encryptMessage(chatId: string, text: string): Promise<{ content: string; iv: string } | null> {
      // Try to restore if missing (e.g. page refresh)
      if (!this.getSessionKey(chatId)) {
          await this.restoreKeys(chatId);
      }

      const key = this.getSessionKey(chatId);
      if (!key) {
          console.error(`No encryption key found for chat ${chatId}`);
          return null;
      }

      try {
          const iv = window.crypto.getRandomValues(new Uint8Array(12));
          const encoded = new TextEncoder().encode(text);

          const encryptedBuffer = await window.crypto.subtle.encrypt(
              { name: "AES-GCM", iv: iv },
              key,
              encoded
          );

          return {
              content: this.arrayBufferToBase64(encryptedBuffer),
              iv: this.arrayBufferToBase64(iv)
          };
      } catch (e) {
          console.error("E2EE Encryption Failed:", e);
          return null;
      }
  }

  async decryptMessage(chatId: string, encryptedBase64: string, ivBase64: string): Promise<string> {
      // Try to restore if missing
      if (!this.getSessionKey(chatId)) {
          await this.restoreKeys(chatId);
      }

      const key = this.getSessionKey(chatId);
      if (!key) return "🔒 Message cannot be decrypted (Key missing)";

      try {
          const iv = this.base64ToArrayBuffer(ivBase64);
          const encryptedData = this.base64ToArrayBuffer(encryptedBase64);

          const decryptedBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: iv },
              key,
              encryptedData
          );

          return new TextDecoder().decode(decryptedBuffer);
      } catch (e) {
          console.error("E2EE Decryption Failed:", e);
          return "🔒 Decryption Error";
      }
  }

  // --- 5. VISUAL FINGERPRINT (Safety Number) ---
  
  async getSafetyNumber(chatId: string, currentUserId: string): Promise<string[]> {
      const key = this.getSessionKey(chatId);
      if (!key) return ["00000", "00000", "00000", "00000"];

      // Export raw key to get consistent bytes
      const rawKey = await window.crypto.subtle.exportKey("raw", key);
      const hashBuffer = await crypto.subtle.digest('SHA-256', rawKey);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      
      const blocks: string[] = [];
      for (let i = 0; i < 20; i += 5) {
          let num = 0;
          for (let j = 0; j < 4; j++) {
              num = (num << 8) + hashArray[i + j];
          }
          blocks.push((num % 100000).toString().padStart(5, '0'));
      }
      return blocks;
  }

  getSecurityColor(chatId: string): string {
    // Generate color based on Chat ID (which is shared)
    let hash = 0;
    for (let i = 0; i < chatId.length; i++) {
      hash = chatId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 50%)`;
  }

  // --- HELPERS ---

  async exportPublicKey(key: CryptoKey): Promise<string> {
      const exported = await window.crypto.subtle.exportKey("raw", key);
      return this.arrayBufferToBase64(exported);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  // Handshake to server (Legacy/Transport Layer)
  async performHandshake(): Promise<void> {
      return Promise.resolve(); 
  }
  
  async encrypt(data: any): Promise<any> { return null; }
  async decrypt(data: any, iv: any): Promise<any> { return null; }
}

export const encryptionService = new EncryptionService();
