/**
 * Kavach Smart Helmet - Web Audio Synthesizer & Speech Voice Assistant
 * Generates audio tones, sirens, countdown ticks, and voice prompts.
 */

class HelmetAudioEngine {
  constructor() {
    this.audioCtx = null;
    this.muted = false;
    this.sosInterval = null;
    this.synth = window.speechSynthesis || null;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      if (this.sosInterval) {
        clearInterval(this.sosInterval);
        this.sosInterval = null;
      }
      if (this.synth) this.synth.cancel();
    }
    return this.muted;
  }

  playTone(frequency, type = 'sine', duration = 0.2, volume = 0.15) {
    if (this.muted) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('Audio tone error:', e);
    }
  }

  // Two-tone chime when helmet is secured
  playHelmetWorn() {
    if (this.muted) return;
    this.playTone(587.33, 'sine', 0.15, 0.2); // D5
    setTimeout(() => {
      this.playTone(880, 'sine', 0.25, 0.2);   // A5
    }, 150);
  }

  // Warning when helmet is removed
  playHelmetRemoved() {
    if (this.muted) return;
    this.playTone(400, 'sawtooth', 0.2, 0.25);
    setTimeout(() => {
      this.playTone(300, 'sawtooth', 0.3, 0.25);
      this.speakText("Please wear your helmet.");
    }, 200);
  }

  // 15-Second Countdown tick for accident false alarm window
  playCountdownTick(second) {
    if (this.muted) return;
    const freq = 600 + (15 - second) * 45; // Frequency rises as time runs out
    this.playTone(freq, 'triangle', 0.08, 0.25);
  }

  // Emergency SOS Siren
  startSosSiren() {
    if (this.muted || this.sosInterval) return;
    let toggle = false;
    this.playTone(960, 'sawtooth', 0.3, 0.3);

    this.sosInterval = setInterval(() => {
      if (this.muted) return;
      toggle = !toggle;
      this.playTone(toggle ? 960 : 770, 'sawtooth', 0.35, 0.3);
    }, 450);
  }

  stopSosSiren() {
    if (this.sosInterval) {
      clearInterval(this.sosInterval);
      this.sosInterval = null;
    }
  }

  // Overspeed warning beep + voice
  playOverspeedAlert() {
    if (this.muted) return;
    this.playTone(1200, 'square', 0.1, 0.15);
    setTimeout(() => {
      this.playTone(900, 'square', 0.15, 0.15);
      this.speakText("Please reduce your speed.");
    }, 120);
  }

  // Speech Synthesizer for Helmet Voice Prompts
  speakText(text) {
    if (this.muted || !this.synth) return;
    try {
      this.synth.cancel(); // Stop prior speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      this.synth.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }

  // Voice Assistance Helpers
  speakWearPrompt() {
    this.speakText("Please wear your helmet.");
  }

  speakReduceSpeedPrompt() {
    this.speakText("Please reduce your speed.");
  }

  speakAccidentPrompt() {
    this.speakText("Accident detected. Press the cancel button if you are safe.");
  }

  speakTurnLeft() {
    this.playTone(659, 'sine', 0.15, 0.2);
    setTimeout(() => this.speakText("Turn left."), 150);
  }

  speakTurnRight() {
    this.playTone(523, 'sine', 0.15, 0.2);
    setTimeout(() => this.speakText("Turn right."), 150);
  }

  speakContinueStraight() {
    this.playTone(784, 'sine', 0.15, 0.2);
    setTimeout(() => this.speakText("Continue straight."), 150);
  }

  speakDestinationReached() {
    this.playTone(523, 'sine', 0.12, 0.2);
    setTimeout(() => this.playTone(659, 'sine', 0.12, 0.2), 120);
    setTimeout(() => this.playTone(1046, 'sine', 0.3, 0.25), 240);
    setTimeout(() => this.speakText("You have reached your destination."), 500);
  }

  speakCancelledPrompt() {
    this.speakText("Emergency alert cancelled.");
  }
}

// Global instance
window.audioEngine = new HelmetAudioEngine();
