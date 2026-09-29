/**
 * Now and then an airliner crosses the gate sign, over the airline's name.
 *
 * Seen from straight above with its nose to the right, it comes in from the
 * left of the mark and goes out past the end of the name, its shadow falling
 * on the sign under it and two contrails drawing out behind its engines. The
 * picture is an `<img>` rather than inline SVG so its gradients' ids stay its
 * own. The flight is all CSS (see `.sa-flyover`): four seconds of every
 * eighteen, and none at all for anybody who has asked for less motion.
 */
const Flyover = () => (
  <span className="sa-flyover" aria-hidden>
    <span className="sa-flyover__craft">
      <img
        src={`${import.meta.env.BASE_URL}plane-top.svg`}
        alt=""
        className="sa-flyover__plane"
        draggable={false}
        decoding="async"
      />
    </span>
  </span>
);

export default Flyover;
