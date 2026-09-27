class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  constructor() {
    // Initialized on first user interaction
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  playCardDeal() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.08);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playChipSound() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Dual clink sound
    [1200, 2400].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + i * 0.04);

      gain.gain.setValueAtTime(0.2, this.ctx!.currentTime + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + i * 0.04 + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(this.ctx!.currentTime + i * 0.04);
      osc.stop(this.ctx!.currentTime + i * 0.04 + 0.06);
    });
  }

  playTimerTick() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  playWinFanfare() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C, E, G, High C
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.1);

      gain.gain.setValueAtTime(0.2, this.ctx!.currentTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.1 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(this.ctx!.currentTime + idx * 0.1);
      osc.stop(this.ctx!.currentTime + idx * 0.1 + 0.35);
    });
  }

  playShowdownClash() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Dramatic low frequency whoosh & impact
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  playStampRank() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Crisp thud + high metallic ping
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(220, this.ctx.currentTime);
    thud.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.12);
    thudGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    thudGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
    thud.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thud.start();
    thud.stop(this.ctx.currentTime + 0.12);

    const ping = this.ctx.createOscillator();
    const pingGain = this.ctx.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(987.77, this.ctx.currentTime); // B5
    pingGain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    pingGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    ping.connect(pingGain);
    pingGain.connect(this.ctx.destination);
    ping.start();
    ping.stop(this.ctx.currentTime + 0.2);
  }
}

export const sound = new SoundManager();
