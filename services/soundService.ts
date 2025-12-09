
class SoundService {
  private context: AudioContext | null = null;
  private isMuted: boolean = false;
  private ringtoneInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Context is created lazily on first interaction
  }

  private getContext(): AudioContext {
    if (!this.context) {
      // Support for Safari/Webkit
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.context = new AudioContextClass();
    }
    return this.context;
  }

  // Must be called on user interaction (click/touch) to unlock audio
  init() {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
          console.log("AudioContext resumed successfully");
      }).catch(err => console.error(err));
    }
  }

  play(type: 'send' | 'receive' | 'callStart' | 'callEnd', enabled: boolean = true) {
    if (!enabled || this.isMuted) return;

    try {
        const ctx = this.getContext();
        
        // Ensure context is running
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        switch (type) {
            case 'send':
                this.playSendSound(ctx);
                break;
            case 'receive':
                this.playReceiveSound(ctx);
                break;
            case 'callStart':
                this.playCallConnectSound(ctx);
                break;
            case 'callEnd':
                this.playCallEndSound(ctx);
                break;
        }
    } catch (e) {
        console.error("Error playing sound:", e);
    }
  }

  // --- TELEGRAM-STYLE SOUNDS (Synthesized) ---

  // The classic Telegram "Pop" / "Click" - extremely short and dry
  private playSendSound(ctx: AudioContext) {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pure Sine wave
      osc.type = 'sine';
      
      // Pitch drop: Starts at 500Hz and drops very fast to 50Hz (The "Pop" effect)
      osc.frequency.setValueAtTime(500, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.04);

      // Volume envelope: Extremely short impulse (40ms total)
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.005); // fast attack
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04); // fast decay

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.05);
  }

  // Telegram "Note" / "Tritone" - Soft, woody notification
  private playReceiveSound(ctx: AudioContext) {
      const t = ctx.currentTime;
      
      // We use a triangle wave filtered to sound like a marimba/wood block
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, t); // Approx C#5/D5 area

      // Lowpass filter to dampen the harshness of the triangle wave
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, t);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.3);

      // Envelope
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.01); // Instant attack
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4); // Medium decay

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.5);
  }

  // Call Connect - A subtle double chirp
  private playCallConnectSound(ctx: AudioContext) {
      const t = ctx.currentTime;
      
      const playChirp = (delay: number, freq: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + delay);
          
          gain.gain.setValueAtTime(0, t + delay);
          gain.gain.linearRampToValueAtTime(0.1, t + delay + 0.05);
          gain.gain.linearRampToValueAtTime(0, t + delay + 0.2);

          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(t + delay);
          osc.stop(t + delay + 0.25);
      };

      playChirp(0, 440); // A4
      playChirp(0.2, 880); // A5
  }

  // Call End - Quick drop
  private playCallEndSound(ctx: AudioContext) {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);

      gain.gain.setValueAtTime(0.1, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.3);
  }

  // Standard VoIP electronic ringing
  startRingtone(enabled: boolean = true) {
      if (!enabled || this.isMuted || this.ringtoneInterval) return;
      
      const playLoop = () => {
          try {
            const ctx = this.getContext();
            const t = ctx.currentTime;
            
            // European/VoIP Ring style: "Tururur.... Tururur"
            const playTone = (delay: number, duration: number, freq: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t + delay);
                
                gain.gain.setValueAtTime(0.05, t + delay);
                gain.gain.linearRampToValueAtTime(0.05, t + delay + duration - 0.05);
                gain.gain.linearRampToValueAtTime(0, t + delay + duration);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(t + delay);
                osc.stop(t + delay + duration);
            };

            playTone(0, 0.4, 440); 
            playTone(0.6, 0.4, 440);

          } catch (e) {
              console.error(e);
          }
      };

      playLoop();
      this.ringtoneInterval = setInterval(playLoop, 3000); // 3s loop
  }

  stopRingtone() {
      if (this.ringtoneInterval) {
          clearInterval(this.ringtoneInterval);
          this.ringtoneInterval = null;
      }
  }
}

export const soundService = new SoundService();
