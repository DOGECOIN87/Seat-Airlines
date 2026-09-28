/**
 * Who moved: the cause, not the cascade, for the cabin; every change, with
 * what it takes to win the seat back, for yourself.
 *
 *   npm test
 */
import { seatHolders } from '../dist-test/seating.js';
import { headlines, personalMove } from '../dist-test/seatMoves.js';

let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const SIZE = 6;
const seat = (list) => seatHolders(list.map(([address, balance]) => ({ address, balance })), 1_000, true, SIZE);
const seatOf = (m, a) => m.entries.find((e) => e.address === a)?.seat.id ?? null;

const cabin = [['A', 100], ['B', 90], ['C', 80], ['D', 70], ['E', 60], ['F', 50], ['G', 40]];
const before = seat(cabin);

console.log('\nthe cabin');

await check('an aircraft boarding for the first time is not a hundred seats taken', () => {
  assert(headlines(seat([]), before).length === 0, 'a first reading was reported as seats taken');
});

await check('one holder climbing is the news; the four it bumped back are not', () => {
  const after = seat(cabin.map(([a, b]) => [a, a === 'F' ? 95 : b]));
  const news = headlines(before, after);
  assert(news.length === 1, `reported ${news.length} moves: ${JSON.stringify(news)}`);
  const [f] = news;
  assert(f.address === 'F' && f.took === 'B' && f.climbed === 4, `reported ${JSON.stringify(f)}`);
  assert(f.to === seatOf(before, 'B') && f.from === seatOf(before, 'F'), 'the seats were wrong');
});

await check('being carried forward by somebody selling is not taking a seat', () => {
  const after = seat(cabin.map(([a, b]) => [a, a === 'B' ? 5 : b]));
  assert(headlines(before, after).length === 0, 'holders carried forward were reported as taking seats');
});

await check('boarding from the hold by buying in is news', () => {
  const after = seat([...cabin, ['H', 85]]);
  const [h] = headlines(before, after);
  assert(h && h.address === 'H' && h.from === null && h.took === 'C', `reported ${JSON.stringify(h)}`);
});

console.log('\nyour seat');

await check('passed: who did it, and what winning the seat back costs', () => {
  const after = seat(cabin.map(([a, b]) => [a, a === 'F' ? 95 : b]));
  const move = personalMove(before, after, 'C', 80);
  assert(move && !move.up && !move.sold, `read as ${JSON.stringify(move)}`);
  assert(move.from === seatOf(before, 'C') && move.to === seatOf(after, 'C'), 'the seats were wrong');
  assert(move.passed.join() === 'F', `passed by ${move.passed}`);
  // B is in C's old seat now, holding 90 to C's 80.
  assert(move.winBack === 10, `win back ${move.winBack}, not 10`);
});

await check('selling down is said to be selling, not being passed', () => {
  const after = seat(cabin.map(([a, b]) => [a, a === 'C' ? 65 : b]));
  const move = personalMove(before, after, 'C', 65);
  assert(move && !move.up && move.sold, `read as ${JSON.stringify(move)}`);
});

await check('dropped to the hold: the seat lost, and what gets it back', () => {
  const after = seat([...cabin, ['H', 85]]);
  const move = personalMove(before, after, 'F', 50);
  assert(move && move.to === null && move.from === seatOf(before, 'F'), `read as ${JSON.stringify(move)}`);
  assert(move.passed.join() === 'H', `passed by ${move.passed}`);
  assert(move.winBack === 10, `win back ${move.winBack}, not 10 (E holds 60 in that seat now)`);
});

await check('upgraded: who was passed, and nothing to win back', () => {
  const after = seat(cabin.map(([a, b]) => [a, a === 'E' ? 85 : b]));
  const move = personalMove(before, after, 'E', 85);
  assert(move && move.up && move.winBack === null, `read as ${JSON.stringify(move)}`);
  assert(move.passed.join() === 'C,D', `passed ${move.passed}`);
});

await check('the same seat is no news at all', () => {
  const after = seat(cabin.map(([a, b]) => [a, a === 'A' ? 120 : b]));
  assert(personalMove(before, after, 'C', 80) === null, 'an unchanged seat was reported');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
