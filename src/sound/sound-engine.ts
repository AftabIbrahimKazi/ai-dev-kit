import { AUDIO_RUNNING, MASTER_VOLUME, MIN_GAP_MS, SOUND_OFF, SOUND_ON, SOUND_STORAGE_KEY, TONES, TONE_PARAMETER_ORDER, type ToneName } from "./sound-config";

type ZzfxModule = typeof import("zzfx");

export class SoundEngine {
  private _zzfx: ZzfxModule | null = null;
  private _ready: Promise<void> | null = null;
  private _isEnabled: boolean = true;
  private readonly _lastPlayed: Map<ToneName, number> = new Map();
  private readonly _unlockListeners: Set<() => void> = new Set();

  public init(): Promise<void> {
    if (this._ready) return this._ready;
    this._isEnabled = this._readStored();
    this._ready = import("zzfx")
      .then((loaded) => {
        loaded.ZZFX.volume = MASTER_VOLUME;
        this._zzfx = loaded;
      })
      .catch(() => undefined);
    return this._ready;
  }

  public getEnabled(): boolean {
    return this._isEnabled;
  }

  public setEnabled(isEnabled: boolean): void {
    this._isEnabled = isEnabled;
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, isEnabled ? SOUND_ON : SOUND_OFF);
    } catch {
      return;
    }
  }

  public isLocked(): boolean {
    return this._zzfx === null || this._zzfx.ZZFX.audioContext.state !== AUDIO_RUNNING;
  }

  public onUnlock(listener: () => void): () => void {
    this._unlockListeners.add(listener);
    return () => {
      this._unlockListeners.delete(listener);
    };
  }

  public unlock(): void {
    const loaded = this._zzfx;
    if (!loaded || loaded.ZZFX.audioContext.state === AUDIO_RUNNING) return;
    loaded.ZZFX.audioContext
      .resume()
      .then(() => {
        if (loaded.ZZFX.audioContext.state === AUDIO_RUNNING) this._unlockListeners.forEach((listener) => listener());
      })
      .catch(() => undefined);
  }

  public play(name: ToneName): void {
    if (!this._isEnabled || this.isLocked() || !this._zzfx) return;
    const now = performance.now();
    if (now - (this._lastPlayed.get(name) ?? Number.NEGATIVE_INFINITY) < MIN_GAP_MS[name]) return;
    this._lastPlayed.set(name, now);
    const spec = TONES[name];
    this._zzfx.zzfx(...TONE_PARAMETER_ORDER.map((key) => spec[key]));
  }

  private _readStored(): boolean {
    try {
      return localStorage.getItem(SOUND_STORAGE_KEY) !== SOUND_OFF;
    } catch {
      return true;
    }
  }
}

export const soundEngine = new SoundEngine();
