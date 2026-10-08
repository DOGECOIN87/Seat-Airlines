import type { LandingHud } from './LandingScene';

export default function JetWeapons({ hud, onFire }: { hud: LandingHud; onFire: () => void }) {
  return <>
    <div className="sa-jet-reticle" ref={hud.targetReticle} hidden aria-hidden />
    <div className="sa-jet-aim" ref={hud.targetAim} aria-hidden><i /><i /></div>
    <aside className="sa-jet-weapons" aria-label="Fighter targeting and missiles" onPointerDown={e => e.stopPropagation()}>
      <span ref={hud.mach} className="sa-jet-mach">MACH 0.60</span>
      <span ref={hud.targetName} className="sa-jet-target">Find a target</span>
      <span ref={hud.targetLock} className="sa-jet-lock">Scan ahead</span>
      <button ref={hud.fire} type="button" className="sa-jet-fire" disabled aria-label="Acquire a target to fire a missile" title="Fire one missile (R or gamepad RT)"
        onPointerDown={e => { e.preventDefault(); e.stopPropagation(); onFire(); }}
        onClick={e => { if (e.detail === 0) onFire(); }}>
        <span>FIRE</span><span ref={hud.ammo}>2 / 2</span>
      </button>
    </aside>
  </>;
}
