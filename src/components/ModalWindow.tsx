import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '../lib/useModal';

interface ModalWindowProps {
  /** The id of the window's title. */
  labelledBy: string;
  /** Extra classes for the card. */
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A window over the page, with the page frosted behind it.
 *
 * Put on `document.body` rather than wherever it was opened from: a seat's
 * window opens from inside the section panel, and the panel clips, slides
 * and scrolls — none of which a window over the whole page should inherit.
 *
 * A click on the frost closes it. Only a click that started there, though:
 * a drag that began in the card — selecting an address to copy — and let go
 * over the frost is not somebody asking to leave.
 */
export default function ModalWindow({ labelledBy, className, onClose, children }: ModalWindowProps) {
  const card = useModal(onClose);
  const pressedFrost = useRef(false);
  return createPortal(
    <div
      className="sa-modal sa-frost"
      onPointerDown={(e) => { pressedFrost.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedFrost.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`sa-modal__card${className ? ` ${className}` : ''}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
