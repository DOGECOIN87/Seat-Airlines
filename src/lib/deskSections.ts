import type { LayoutDocument, LayoutNode, Placement, WorkspaceHandle, WorkspaceSnapshot } from '@danfessler/trellis-react';
import { PANELS, type PanelKey } from '../components/SectionPanels';

/**
 * Opening and putting away the sections in the desk cockpit's workspace.
 *
 * Kept apart from the workspace itself so the page can drive it without
 * pulling the workspace into the first download: only the types come from
 * the library here, and types are gone by the time the page runs.
 */

/** The layout's stage, where the view lives. */
export const STAGE_ID = 'stage';
/** The share of the width a section takes when it docks beside the view. */
export const SIDE_SHARE = 0.36;

/** A desk with a mouse and room for a workspace. */
export const DESK_QUERY = '(min-width: 1280px) and (min-height: 640px) and (hover: hover) and (pointer: fine)';

const SECTIONS: readonly string[] = PANELS.map((p) => p.key);
export const isSection = (type: string): type is PanelKey => SECTIONS.includes(type);

/** A section's button on the tab bar: where it flies to when put away. */
export const dockButton = (key: string) =>
  document.querySelector<HTMLElement>(`.sa-dock [data-dock="${key}"]`) ?? undefined;

/** Whether a dialog is up over the page, which keyboard focus must not leave. */
const modalOpen = () => Boolean(document.querySelector('[aria-modal="true"]'));

/**
 * Where a section goes when it has nowhere of its own: a tab beside the
 * sections already showing (docked ones first), or docked to the right of
 * the view when none are.
 */
function sectionHome(snap: WorkspaceSnapshot, except?: string): { into: string } | { beside: string; edge: 'right'; share: number } {
  const others = snap.views.filter((v) => isSection(v.type) && v.id !== except && v.placement !== 'hidden');
  const beside = others.find((v) => v.placement === 'docked') ?? others[0];
  return beside ? { into: beside.panelId } : { beside: STAGE_ID, edge: 'right', share: SIDE_SHARE };
}

function hasNode(node: LayoutNode | null | undefined, id: string): boolean {
  if (!node) return false;
  if (node.id === id) return true;
  if (node.kind === 'split') return node.children.some((child) => hasNode(child, id));
  if (node.kind === 'stage') return hasNode(node.child, id);
  return false;
}

/**
 * Whether bringing a put-away panel back would land it somewhere it never
 * was. The workspace restores a panel beside the neighbour it left, or into
 * the panel it was a tab of; when that is gone too (put away from the tab bar
 * one after another, say), it floats the panel over the middle of the view.
 */
function wouldStray(doc: LayoutDocument, panelId: string): boolean {
  const hidden = doc.hidden.find((h) => h.panel.id === panelId);
  if (!hidden) return false;
  const { restore } = hidden;
  if (restore.kind === 'floating') return false;
  if (restore.kind === 'docked') return !hasNode(doc.root, restore.beside);
  const target = restore.panel;
  return !hasNode(doc.root, target) && !doc.floating.some((f) => f.panel.id === target);
}

interface OpenOptions {
  /** Move keyboard focus into the section. Not while a dialog is up, whatever this says. */
  focus?: boolean;
}

/**
 * Bring a section up: back where it was if it was put away, forward if it is
 * behind another tab, and otherwise new — as a tab beside the sections already
 * showing, or docked to the right of the view when none are.
 */
export function openSection(ws: WorkspaceHandle, key: PanelKey, { focus = true }: OpenOptions = {}): void {
  const snap = ws.getSnapshot();
  const moveFocus = focus && !modalOpen();
  const info = snap.views.find((v) => v.type === key);
  if (!info) {
    ws.open(key, { placement: sectionHome(snap) as Placement, from: dockButton(key), focus: moveFocus });
    return;
  }
  if (info.placement === 'hidden' && wouldStray(snap.document, info.panelId)) {
    ws.dock(info.id, sectionHome(snap, info.id));
    if (moveFocus) ws.focus(info.id);
    else ws.select(info.id);
    return;
  }
  ws.open(key, { reuse: 'type', focus: moveFocus });
}

/** Whether a section is in front and on screen. */
export function sectionShown(ws: WorkspaceHandle, key: PanelKey): boolean {
  const info = ws.getSnapshot().views.find((v) => v.type === key);
  return Boolean(info && info.placement !== 'hidden' && info.selected && ws.view(info.id)?.visible);
}

/** The tab bar's button: put the section away if it is in front, otherwise bring it up. */
export function toggleSection(ws: WorkspaceHandle, key: PanelKey): void {
  const info = ws.getSnapshot().views.find((v) => v.type === key);
  if (info && sectionShown(ws, key)) {
    ws.hide(info.id, { toward: dockButton(key) });
    return;
  }
  if (!info || info.placement === 'hidden') {
    openSection(ws, key);
    return;
  }
  ws.focus(info.id);
}

/** Put every section away, leaving the view. */
export function hideSections(ws: WorkspaceHandle): void {
  const snap = ws.getSnapshot();
  const panels = new Map<string, string>();
  for (const v of snap.views) {
    if (!isSection(v.type) || v.placement === 'hidden') continue;
    if (!panels.has(v.panelId) || v.selected) panels.set(v.panelId, v.type);
  }
  panels.forEach((type, id) => ws.hide(id, { toward: dockButton(type) }));
}

/** The section to carry over when the cockpit leaves the desk: the one in use, else one showing. */
export function sectionInUse(ws: WorkspaceHandle): PanelKey | null {
  const snap = ws.getSnapshot();
  const showing = snap.views.filter((v) => isSection(v.type) && v.placement !== 'hidden' && v.selected);
  const focused = showing.find((v) => v.id === snap.focusedView);
  const pick = focused ?? showing[0];
  return pick && isSection(pick.type) ? pick.type : null;
}
