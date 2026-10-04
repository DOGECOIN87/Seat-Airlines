import { useEffect, useRef } from 'react';

/** One tiny pulse and a soft, short click for an actual button activation. */
export function usePressFeedback(soundEnabled: boolean) {
  const sound = useRef(soundEnabled);
  sound.current = soundEnabled;
  useEffect(() => {
    let audio: AudioContext | null = null;
    let last = -Infinity;
    const press = (event: MouseEvent) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>('button, [role="button"]');
      if (!button || button.matches(':disabled, [aria-disabled="true"]') || button.closest('[inert]')) return;
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      try { navigator.vibrate?.(5); } catch { /* Optional device capability. */ }
      if (!sound.current) return;
      try {
        const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        audio ??= new Context();
        if (audio.state === 'suspended') void audio.resume().catch(() => {});
        const start = audio.currentTime;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(1100, start);
        oscillator.frequency.exponentialRampToValueAtTime(550, start + 0.016);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.025, start + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.018);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + 0.02);
      } catch { /* Feedback never interrupts the button's action. */ }
    };
    document.addEventListener('click', press, { capture: true, passive: true });
    return () => {
      document.removeEventListener('click', press, true);
      if (audio) void audio.close().catch(() => {});
    };
  }, []);
}
