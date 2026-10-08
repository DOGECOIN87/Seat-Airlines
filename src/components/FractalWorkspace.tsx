import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Workspace, ViewType, Split, Panel, View, type WorkspaceHandle } from '@danfessler/trellis-react';
import '@danfessler/trellis/style.css';
import './FractalWorkspace.css';
import { PANELS, type PanelKey } from './SectionPanels';
import { DeckIcon } from './InstrumentDeck';

interface Props {
  aircraft: ReactNode;
  instruments: ReactNode;
  wall: ReactNode;
  activeSection: PanelKey | null;
  renderSection: (key: PanelKey) => ReactNode;
  onSection: (key: PanelKey) => void;
  onScores: () => void;
  seated: boolean;
}

const isCompact = () => window.matchMedia('(max-width: 1023px)').matches;

/** The application owns data and permissions; Trellis only owns its layout. */
export default function FractalWorkspace({ aircraft, instruments, wall, activeSection, renderSection, onSection, onScores, seated }: Props) {
  const workspace = useRef<WorkspaceHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(isCompact);
  const [help, setHelp] = useState(false);
  const [focused, setFocused] = useState(false);
  const bind = useCallback((handle: WorkspaceHandle | null) => {
    workspace.current = handle;
    setReady(Boolean(handle));
  }, []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  // Hash links, wallet actions and seat selection continue to open the same sections.
  useEffect(() => {
    if (ready && activeSection) workspace.current?.open(activeSection);
  }, [ready, activeSection, compact]);
  const open = (type: string) => {
    workspace.current?.open(type);
    if (compact) {
      const view = workspace.current?.views({ type })[0];
      if (view) workspace.current?.navigation.frame(view.id);
    }
  };
  useEffect(() => {
    const board = () => workspace.current?.open('adverts');
    const section = (event: Event) => workspace.current?.open((event as CustomEvent<PanelKey>).detail);
    window.addEventListener('sa:workspace-on-board', board);
    window.addEventListener('sa:workspace-section', section);
    return () => {
      window.removeEventListener('sa:workspace-on-board', board);
      window.removeEventListener('sa:workspace-section', section);
    };
  }, []);
  const sectionTypes = PANELS.filter(p => seated || p.key === 'wall' || p.key === 'check-in');
  return (
    <div className="sa-fractal">
      <div className="sa-fractal__bar">
        <div className="sa-fractal__identity"><span className="sa-fractal__pulse" /><span>SA350</span></div>
        <div className="sa-fractal__tools" aria-label="Workspace controls">
          <button type="button" onClick={() => { workspace.current?.navigation.overview(); setFocused(false); }}>Overview</button>
          <button type="button" aria-pressed={focused} onClick={() => { workspace.current?.navigation.toggle(); setFocused(Boolean(workspace.current?.navigation.framed)); }}>Focus</button>
          <button type="button" onClick={() => { workspace.current?.reset(); workspace.current?.navigation.overview(); setFocused(false); }}>Reset layout</button>
          <button type="button" aria-expanded={help} aria-controls="sa-fractal-help" onClick={() => setHelp(v => !v)}>How to arrange</button>
        </div>
      </div>
      {help && <div id="sa-fractal-help" className="sa-fractal__help">Drag a tab onto another panel to nest it, or to an edge to split it. Drag dividers to resize. Double-click a tab bar to focus; press Esc to step back out. Your arrangement saves on this device.</div>}
      <nav className="sa-fractal__nav" aria-label="Flight workspace panels">
        <button type="button" onClick={() => open('aircraft')}><DeckIcon name="plane" />Aircraft</button>
        <button type="button" onClick={() => open('instruments')}><DeckIcon name="deck" />Instruments</button>
        <button type="button" onClick={() => open('adverts')}><DeckIcon name="wall" />On board</button>
        {sectionTypes.map(p => <button key={p.key} type="button" onClick={() => { open(p.key); onSection(p.key); }}><DeckIcon name={p.icon} />{p.label}</button>)}
        <button type="button" onClick={onScores}><DeckIcon name="trophy" />Scores</button>
      </nav>
      <Workspace
        key={compact ? 'compact' : 'wide'} ref={bind}
        label="Seat Airlines flight workspace" theme="dark" navigation="free"
        storageKey={`sa350-trellis-screenshot-v2-${compact ? 'compact' : 'wide'}`} version={2}
        className="sa-fractal__workspace" motion="system"
        onNavigate={id => setFocused(Boolean(id))}
        tokens={{ '--trellis-bg': '#070d16', '--trellis-panel': '#0f1725', '--trellis-tabbar': '#162234', '--trellis-tab-active': '#20334b', '--trellis-text': '#e8f2fa', '--trellis-text-muted': '#95a9be', '--trellis-accent': '#7fe3f7', '--trellis-border': '#283b52', '--trellis-gap': '8px', '--trellis-radius': '12px', '--trellis-font': 'inherit', '--trellis-tabbar-height': '38px' }}
      >
        <ViewType id="aircraft" title="01 / Aircraft" singleton closable={false} minSize={{ width: 420, height: 320 }}><div className="sa-fractal__aircraft">{aircraft}</div></ViewType>
        <ViewType id="instruments" title="02 / Flight instruments" singleton minSize={{ width: 480, height: 240 }}><div className="sa-fractal__scroll sa-fractal__instruments">{instruments}</div></ViewType>
        <ViewType id="adverts" title="03 / Who’s on board" singleton minSize={{ width: 350, height: 300 }}><div className="sa-fractal__scroll sa-fractal__wall">{wall}</div></ViewType>
        {sectionTypes.map(p => <ViewType key={p.key} id={p.key} title={p.key === 'wall' ? '04 / Seat map' : p.title} singleton minSize={{ width: 360, height: 300 }}><div className="sa-fractal__scroll sa-fractal__section">{p.key !== 'wall' && <><p className="sa-fractal__eyebrow">{p.eyebrow}</p><h2>{p.title}</h2></>}{renderSection(p.key)}</div></ViewType>)}
        {compact ? (
          <Panel id="flight-mobile"><View type="aircraft" /><View type="adverts" /><View type="instruments" /><View type="wall" /><View type="check-in" /></Panel>
        ) : (
          <Split weights={[7, 4]} id="flight-layout">
            <Split axis="y" weights={[1, 1]} id="flight-operations"><View type="aircraft" /><View type="instruments" /></Split>
            <View type="wall" />
          </Split>
        )}
      </Workspace>
    </div>
  );
}
