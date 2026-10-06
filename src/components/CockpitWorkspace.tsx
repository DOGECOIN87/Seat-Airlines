import '@danfessler/trellis/style.css';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  Panel,
  Split,
  Stage,
  View,
  ViewType,
  Workspace,
  WorkspaceProvider,
  useOptionalWorkspace,
  type MenuEntry,
  type PanelMenuContext,
  type WorkspaceHandle,
} from '@danfessler/trellis-react';
import { DeckIcon } from './InstrumentDeck';
import { PANELS, SectionDock, type PanelKey } from './SectionPanels';
import { SIDE_SHARE, STAGE_ID, dockButton, isSection, sectionShown } from '../lib/deskSections';

/**
 * The cockpit on a desk: the view and the sections as one docking workspace.
 *
 * On a phone a section rises over the page as a sheet, and on a narrow desk
 * it opens in a panel beside the view; either way, one at a time. A desk
 * with a mouse has room for more, so here the view is the workspace's stage
 * and the sections are panels around it that can be laid out however suits:
 * the seat map and the cabin chat side by side, the chat floating over the
 * view, one section maximised, a divider dragged to give the view more room.
 * The layout is kept in this browser, and the panel menu puts it back.
 *
 * The tab bar along the bottom still opens and puts away each section; a
 * section put away flies into its tab.
 *
 * This module is loaded only on a desk, so a phone never downloads the
 * workspace at all.
 */

const STORAGE_KEY = 'seat-airlines.cockpit';
/* Bump when the default layout changes: a saved layout of another version
   is set aside for the new default. */
const LAYOUT_VERSION = 1;
/* The site's light panels on the navy ground, in the workspace's terms. The
   gap is wide enough for a panel's shadow to show rather than be clipped by
   the workspace's edge, and the tab bar tall enough to be an easy target. */
const TOKENS: Record<string, string> = {
  '--trellis-font': 'Montserrat, ui-sans-serif, system-ui, sans-serif',
  '--trellis-font-size': '12px',
  '--trellis-gap': '14px',
  '--trellis-radius': '24px',
  '--trellis-tab-radius': '12px',
  '--trellis-tabbar-height': '46px',
  '--trellis-tab-max-width': '200px',
  '--trellis-bg': 'transparent',
  '--trellis-stage': 'transparent',
  '--trellis-panel': '#E3E4E8',
  '--trellis-tabbar': 'transparent',
  '--trellis-tab-hover': 'rgba(255, 255, 255, 0.55)',
  '--trellis-tab-active': '#F1F2F5',
  '--trellis-text': '#24282F',
  '--trellis-text-muted': '#585D66',
  '--trellis-border': 'rgba(163, 167, 180, 0.38)',
  '--trellis-accent': '#0087EA',
  '--trellis-accent-contrast': '#FFFFFF',
  '--trellis-slot': 'rgba(0, 201, 241, 0.22)',
  '--trellis-menu': '#EDEEF1',
  '--trellis-menu-hover': 'rgba(0, 135, 234, 0.12)',
  '--trellis-shadow-float': '0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 24px 52px -12px rgba(0, 0, 0, 0.62)',
  '--trellis-shadow-lifted': '0 1px 0 rgba(255, 255, 255, 0.6) inset, 0 34px 70px -14px rgba(0, 0, 0, 0.72)',
  '--trellis-focus-ring': '0 0 0 2px #00C9F1',
};
const TABS = { fill: false, inset: 6 };
/* Below this a section is drawn smaller rather than squeezed into a column
   too narrow to read: about the old side panel's narrowest. */
const SECTION_MIN = { width: 420, height: 260 };
/* The workspace's gap, in pixels, as in TOKENS. */
const GAP = 14;
/* What the workspace's own Float would size a panel to at most. */
const FLOAT_MAX = { w: 560, h: 400 };
/* The section's title takes focus when it opens, as it does in the side
   panel: the workspace focuses `[autofocus]` first. Set as the attribute,
   since React's autoFocus focuses on mount and leaves no attribute. */
const titleFirst = (el: HTMLElement | null) => el?.setAttribute('autofocus', '');
const dropMissing = () => 'drop' as const;

interface DockProps {
  onToggle: (key: PanelKey) => void;
  onScores: () => void;
  scoresOpen: boolean;
  panels?: readonly PanelKey[];
}

interface CockpitWorkspaceProps {
  /** Receives the workspace once it is up, and null when it goes. */
  onHandle: (ws: WorkspaceHandle | null) => void;
  /** The view, with its frame and rail. */
  view: ReactNode;
  /** What goes in each section. */
  section: (key: PanelKey) => ReactNode;
  dock: DockProps;
  /** The page under the cockpit: the wall and the instrument deck. */
  children?: ReactNode;
}

export default function CockpitWorkspace({ onHandle, view, section, dock, children }: CockpitWorkspaceProps) {
  const ws = useRef<WorkspaceHandle | null>(null);
  const unguard = useRef<(() => void) | null>(null);
  const box = useRef<HTMLDivElement>(null);

  /* The workspace fills the first screen, from where it starts on the page
     down to the tab bar. Where it starts — under the contract bar, the gate
     sign and the hero's margin — is measured rather than assumed, so the
     view's rail is clear of the tab bar on the way in. */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const top = `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`;
      if (el.style.getPropertyValue('--ws-top') !== top) el.style.setProperty('--ws-top', top);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const setHandle = useCallback((handle: WorkspaceHandle | null) => {
    ws.current = handle;
    unguard.current?.();
    unguard.current = handle ? guardScroll(handle.element) : null;
    onHandle(handle);
  }, [onHandle]);

  const menu = useCallback((entries: MenuEntry[], { region, panelId }: PanelMenuContext): MenuEntry[] => {
    /* The view has no menu: it is always there, and always in the middle. */
    if (region === 'stage') return [];
    return [
      ...entries.map((entry) =>
        entry !== 'separator' && entry.id === 'float' ? { ...entry, run: () => floatInside(ws.current, panelId) } : entry,
      ),
      'separator',
      { id: 'reset-layout', label: 'Reset layout', run: () => ws.current?.reset() },
    ];
  }, []);
  /* "Hide" in a panel's menu sends it into its tab on the bar, and keyboard
     focus with it: otherwise it stays on a tab that is no longer there. */
  const toward = useCallback((panelId: string) => {
    const view = ws.current?.getSnapshot().views.find((v) => v.panelId === panelId && v.selected);
    const button = view && isSection(view.type) ? dockButton(view.type) : undefined;
    if (button) {
      const rescue = () => {
        const active = document.activeElement;
        const lost = !active || active === document.body
          || (ws.current?.element.contains(active) && (Boolean(active.closest('[inert]')) || !active.checkVisibility?.({ visibilityProperty: true })));
        if (lost) button.focus({ preventScroll: true });
      };
      window.setTimeout(rescue, 0);
      window.setTimeout(rescue, 420);
    }
    return button;
  }, []);
  /* The view's tab is never shown, so moving to its panel from the keyboard
     (F6) has nothing to land on; its glass takes the focus instead. */
  const onFocus = useCallback((viewId: string | null) => {
    if (viewId !== 'view') return;
    const root = ws.current?.element;
    const active = document.activeElement;
    if (!root || !active || !root.contains(active)) return;
    const stage = root.querySelector<HTMLElement>('.sa-wsstage');
    if (!stage || stage.contains(active)) return;
    requestAnimationFrame(() => stage.querySelector<HTMLElement>('.sd-glass')?.focus({ preventScroll: true }));
  }, []);

  return (
    <WorkspaceProvider>
      <div ref={box} className="sa-wsbox">
        <Workspace
          ref={setHandle}
          className="sa-ws"
          label="Cockpit"
          theme="light"
          navigation="focus"
          tokens={TOKENS}
          tabs={TABS}
          panelMenu={menu}
          hideToward={toward}
          storageKey={STORAGE_KEY}
          version={LAYOUT_VERSION}
          onMissingType={dropMissing}
          onFocus={onFocus}
        >
          <ViewType
            id="view"
            title="View"
            icon={<DeckIcon name="plane" />}
            placement="stage"
            singleton
            closable={false}
            allow={{ side: false, floating: false }}
            tabbar="never"
            scaling={false}
            gestures="exclusive"
            render={() => <div className="sa-wsstage">{view}</div>}
          />
          {PANELS.map((p) => (
            <ViewType
              key={p.key}
              id={p.key}
              title={p.label}
              icon={<DeckIcon name={p.icon} />}
              singleton
              allow={{ stage: false }}
              minSize={SECTION_MIN}
              render={() => (
                <div className="sa-wsview @container" data-scroll-root>
                  <h2 ref={titleFirst} tabIndex={-1} className="sa-wsview__title">{p.title}</h2>
                  {section(p.key)}
                </div>
              )}
            />
          ))}
          <Split weights={[1 - SIDE_SHARE, SIDE_SHARE]}>
            <Stage id={STAGE_ID}>
              <View type="view" id="view" />
            </Stage>
            <Panel id="sections">
              <View type="wall" id="wall" />
              <View type="check-in" id="check-in" />
            </Panel>
          </Split>
        </Workspace>
      </div>
      {children}
      <Dock {...dock} />
    </WorkspaceProvider>
  );
}

/**
 * The tab bar, lit for every section on screen: in front in its panel, and
 * not pushed out of sight by another panel that has been maximised.
 */
function Dock(props: DockProps) {
  const ws = useOptionalWorkspace();
  const [key, setKey] = useState('');
  useEffect(() => {
    if (!ws) return;
    const watched = new Map<string, () => void>();
    const update = () => {
      const ids = new Set(ws.getSnapshot().views.filter((v) => isSection(v.type)).map((v) => v.id));
      for (const [id, off] of watched) {
        if (!ids.has(id)) {
          off();
          watched.delete(id);
        }
      }
      for (const id of ids) {
        const view = watched.has(id) ? null : ws.view(id);
        if (view) watched.set(id, view.on('visibility', update));
      }
      setKey(PANELS.filter((p) => sectionShown(ws, p.key)).map((p) => p.key).join(' '));
    };
    update();
    const stop = ws.subscribe(update);
    return () => {
      stop();
      watched.forEach((off) => off());
    };
  }, [ws]);
  const shown = (key ? key.split(' ') : []) as PanelKey[];
  return <SectionDock open={null} shown={shown} {...props} />;
}

/**
 * Float a panel from its menu, kept inside the workspace.
 *
 * The workspace's own Float drops the panel a little right of and below
 * where it was docked, which for a section docked against the right-hand
 * edge puts its border and its menu past the edge. This floats it to the
 * same size, offset to the left instead, and held within the gap.
 */
function floatInside(ws: WorkspaceHandle | null, panelId: string): void {
  if (!ws) return;
  const root = ws.element.getBoundingClientRect();
  const el = ws.element.querySelector(`[data-trellis-part="panel"][data-panel="${CSS.escape(panelId)}"]`);
  const at = el?.getBoundingClientRect() ?? root;
  const w = Math.min(at.width, FLOAT_MAX.w, root.width - GAP * 2);
  const h = Math.min(at.height, FLOAT_MAX.h, root.height - GAP * 2);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const x = clamp(at.left - root.left + (at.width - w) / 2 - 24, GAP, root.width - GAP - w);
  const y = clamp(at.top - root.top + (at.height - h) / 2 + 24, GAP, root.height - GAP - h);
  ws.float(panelId, { x: x / root.width, y: y / root.height, w: w / root.width, h: h / root.height });
}

/**
 * Keep the workspace's own boxes where it put them.
 *
 * They clip rather than scroll, but anything that scrolls an element into view
 * scrolls clipping boxes too, which slides a panel's insides out from under
 * its frame. A section scrolls in its own box (`.sa-wsview`), which is left
 * alone; anything of the workspace's that moves goes straight back.
 */
function guardScroll(root: HTMLElement): () => void {
  const onScroll = (e: Event) => {
    const box = e.target;
    if (!(box instanceof HTMLElement)) return;
    /* The tab strip scrolls on purpose, when its tabs overflow. */
    if (box.getAttribute('data-trellis-part') === 'tabs') return;
    if (box !== root && !box.hasAttribute('data-trellis-part') && !box.classList.contains('trellis-layer')) return;
    if (box.scrollTop) box.scrollTop = 0;
    if (box.scrollLeft) box.scrollLeft = 0;
  };
  root.addEventListener('scroll', onScroll, true);
  return () => root.removeEventListener('scroll', onScroll, true);
}
