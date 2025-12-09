import { GoogleGenAI, Chat, Part } from "@google/genai";
import { GEMINI_MODEL } from '../constants';

// Singleton to manage chat sessions
class GeminiService {
  private ai: GoogleGenAI | null = null;
  private chatSessions: Map<string, Chat>;

  constructor() {
    this.chatSessions = new Map();
    // Do not initialize GoogleGenAI here immediately to prevent startup crashes
    // if process.env.API_KEY is undefined or invalid.
  }

  private getAI(): GoogleGenAI {
      if (!this.ai) {
          const apiKey = process.env.API_KEY || ''; 
          // We provide a fallback empty string to prevent constructor crash, 
          // though API calls will fail gracefully later if key is missing.
          this.ai = new GoogleGenAI({ apiKey });
      }
      return this.ai;
  }

  // Get or create a chat session for a specific contact
  private getChatSession(contactId: string, systemInstruction?: string): Chat {
    if (!this.chatSessions.has(contactId)) {
      const ai = this.getAI();
      const chat = ai.chats.create({
        model: GEMINI_MODEL,
        config: {
          systemInstruction: systemInstruction,
        },
      });
      this.chatSessions.set(contactId, chat);
    }
    return this.chatSessions.get(contactId)!;
  }

  // Send a message and get a response
  async sendMessage(
    contactId: string, 
    text: string, 
    systemInstruction?: string,
    mediaBase64?: string,
    mimeType: string = 'text/plain',
    location?: { latitude: number; longitude: number }
  ): Promise<string> {
    try {
      const chat = this.getChatSession(contactId, systemInstruction);
      
      let parts: Part[] = [];
      
      if (mediaBase64) {
        // Handle data URL stripping more generically
        const base64Data = mediaBase64.includes(',') 
            ? mediaBase64.split(',')[1] 
            : mediaBase64;

        parts.push({
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        });
      }
      
      if (text) {
        parts.push({ text: text });
      }

      // If only media without text, add a context prompt
      if (parts.length === 0) {
        parts.push({ text: "[User sent media]" });
      }

      // Configure tools (Google Maps Grounding)
      const config: any = {
        tools: [{ googleMaps: {} }],
      };

      // If location is provided, pass it to the tool config for accurate retrieval
      if (location) {
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: location.latitude,
              longitude: location.longitude
            }
          }
        };
      }

      const result = await chat.sendMessage({ 
          message: parts,
          config: config
      });

      let responseText = result.text || '';

      // Extract Grounding Metadata (Maps & Web)
      const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
          const sources = groundingChunks
            .map((chunk: any) => {
                if (chunk.maps?.uri) {
                    return `[${chunk.maps.title || 'Google Maps'}](${chunk.maps.uri})`;
                }
                if (chunk.web?.uri) {
                    return `[${chunk.web.title || 'Источник'}](${chunk.web.uri})`;
                }
                return null;
            })
            .filter((source: string | null): source is string => Boolean(source));
          
          if (sources.length > 0) {
              // Deduplicate sources
              const uniqueSources = Array.from(new Set(sources));
              responseText += '\n\n**Источники:**\n' + uniqueSources.map(s => `- ${s}`).join('\n');
          }
      }

      return responseText;
    } catch (error) {
      console.error("Gemini API Error:", error);
      return "У меня возникли проблемы с подключением. Проверьте API ключ или интернет соединение.";
    }
  }

  async translateText(text: string, targetLang: string = 'Russian'): Promise<string> {
      try {
          const ai = this.getAI();
          const response = await ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: `Translate the following text to ${targetLang}. Return ONLY the translated text, nothing else. Text: "${text}"`,
          });
          return response.text || "Не удалось перевести.";
      } catch (error) {
          console.error("Translation error", error);
          return "Ошибка перевода.";
      }
  }

  // Helper to re-initialize if needed (e.g. key change)
  reset() {
    this.chatSessions.clear();
    this.ai = null;
  }
}

export const geminiService = new GeminiService();