/**
 * Wake Lock: manté la pantalla encesa només mentre hi ha una ruta activa.
 * Es torna a adquirir quan la pàgina torna a ser visible.
 */
export class WakeLockController {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible' && this.wanted) void this.acquire();
  };

  get supported(): boolean {
    return 'wakeLock' in navigator;
  }

  async acquire(): Promise<boolean> {
    this.wanted = true;
    if (!this.supported) return false;
    document.addEventListener('visibilitychange', this.onVisibility);
    if (this.sentinel && !this.sentinel.released) return true;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  }

  async release(): Promise<void> {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        /* ja alliberat */
      }
      this.sentinel = null;
    }
  }
}
