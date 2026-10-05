import type { WorkspaceHandle } from '@danfessler/trellis-react';
import { PANELS, type PanelKey } from '../components/SectionPanels';

/**
 * Opening and putting away the sections in the desk cockpit's workspace.
 *
 * Kept apart from the workspace itself so the page can drive it without
 * pulling the workspace into the first download: only the type comes from
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

/**
 * Bring a section up: back where it was if it was put away, forward if it is
 * behind another tab, and otherwise new — as a tab beside the sections already
 * showing, or docked to the right of the view when none are.
 */
export function openSection(ws: WorkspaceHandle, key: PanelKey): void {
  const { views } = ws.getSnapshot();
  if (views.some((v) => v.type === key)) {
    ws.open(key, { reuse: 'type' });
    return;
  }
  const beside = views.find((v) => isSection(v.type) && v.placement !== 'hidden');
  ws.open(key, {
    placement: beside ? { into: beside.panelId } : { beside: STAGE_ID, edge: 'right', share: SIDE_SHARE },
    from: dockButton(key),
  });
}

/** The tab bar's button: put the section away if it is in front, otherwise bring it up. */
export function toggleSection(ws: WorkspaceHandle, key: PanelKey): void {
  const info = ws.getSnapshot().views.find((v) => v.type === key);
  if (!info || info.placement === 'hidden') {
    openSection(ws, key);
    return;
  }
  if (info.selected && ws.view(info.id)?.visible) ws.hide(info.id, { toward: dockButton(key) });
  else ws.focus(info.id);
}

/** Put every section away, leaving the view. */
export function hideSections(ws: WorkspaceHandle): void {
  const panels = new Set(
    ws.getSnapshot().views
      .filter((v) => isSection(v.type) && v.placement !== 'hidden')
      .map((v) => v.panelId),
  );
  panels.forEach((id) => ws.hide(id, { toward: dockButton(ws.getSnapshot().views.find((v) => v.panelId === id && v.selected)?.type ?? '') }));
}
