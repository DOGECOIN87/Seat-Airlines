import { BOOST, DASH, GAME } from './landingGame';
import { JET } from './aerialCombat';
import type { PlayMode } from './rides';

/**
 * What the hangar's spec sheet says about each craft.
 *
 * Every figure is read from the constants the flight itself runs on, so the
 * sheet cannot promise a burn the game does not give or a missile it does not
 * carry: retune the game and the sheet follows.
 */

export interface CraftSpec {
  /** The tail number, as the roster shows it. */
  name: string;
  /** What it is, in a line. */
  role: string;
  /** Over the name. */
  tag: string;
  blurb: string;
  specs: readonly (readonly [label: string, value: string])[];
  abilities: readonly string[];
}

const n = (value: number) => value.toLocaleString('en-US');

export const CRAFT_SPECS: Record<PlayMode, CraftSpec> = {
  airliner: {
    name: 'SA350',
    role: 'Seat Airlines flagship',
    tag: 'Airliner · twin engine',
    blurb: 'The airline’s own: two engines, flaps and three burns of afterburner. Climb to 10,000 ft before an engine goes, then keep her in the air.',
    specs: [
      ['Afterburner', `${BOOST.charges} burns · ${BOOST.seconds} s each`],
      ['A burn adds', `+${n(BOOST.dash)} m/s · +${n(BOOST.extraClimb)} m/s climb`],
      ['Recharge', `${BOOST.recharge} s a burn`],
      ['Climb limit', `${n(GAME.maxClimb)} m/s`],
      ['Bank · pitch', `${GAME.maxBank}° · ${GAME.maxPitch}°`],
      ['Mission', `Reach ${n(GAME.blastFeet)} ft, then survive the engine-out`],
    ],
    abilities: ['Flaps', 'Afterburner', 'Engine-out recovery'],
  },
  jet: {
    name: 'F35',
    role: 'Fighter · two guided missiles',
    tag: 'Fighter · single engine',
    blurb: 'Faster than the airliner at cruise and supersonic on a burn. Lock on and fire at the blimp and the UFO.',
    specs: [
      ['Cruise', `${JET.cruiseScale}× the SA350`],
      ['Burn', `To Mach 1 · ${BOOST.charges} × ${JET.boostSeconds} s`],
      ['Missiles', `2 guided · ${n(JET.missileSpeed)} m/s`],
      ['Lock-on', `${JET.lockSeconds} s, inside ${n(JET.lockRange / 1000)} km`],
      ['Missile life', `${JET.missileLife} s`],
      ['Targets', 'The blimp · the UFO'],
    ],
    abilities: ['Mach 1 burn', 'Target lock', 'Guided missiles'],
  },
  ufo: {
    name: 'UFO',
    role: 'Experimental interceptor',
    tag: 'Saucer · vertical drive',
    blurb: 'Dash any way at the flick of the stick, dodge the airliners, and push past Earth’s sky to the moon and Mars.',
    specs: [
      ['Dash ahead', `${n(DASH.forward)} m/s`],
      ['Dash up · down', `${n(DASH.vertical)} m/s`],
      ['Dash sideways', `${n(DASH.strafe)} m/s`],
      ['Dash', `${BOOST.charges} charges · ${DASH.seconds} s each`],
      ['Worlds', 'Earth · the moon · Mars'],
      ['Unlock', 'Hold 1,000,000 $SEAT'],
    ],
    abilities: ['Omni-directional dash', 'Vertical drive', 'Moon & Mars'],
  },
};
