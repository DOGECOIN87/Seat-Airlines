import Mark from './Mark';

/**
 * The airline's wordmark: the mark, and the name beside it on one line in
 * Montserrat's heaviest capitals, half the mark's height and centred on it
 * by the capitals rather than by the line box.
 *
 * One component, so the landing, the gate sign, the footer and the splash
 * all draw the same thing. Its size is the mark's, set in CSS as `--mark`
 * (see `.sa-wordmark`), so a narrow screen scales the whole of it rather
 * than squeezing one half.
 */
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`sa-wordmark${className ? ` ${className}` : ''}`}>
      <Mark className="sa-wordmark__mark" />
      <span className="sa-wordmark__name">Seat Airlines</span>
    </span>
  );
}
