import { useState, type ReactNode } from 'react';
import type { FomoProfile } from '../lib/fomoProfile';

/** Fixed dimensions and a local fallback keep mobile rows from shifting. */
export default function ProfilePicture({ profile, fallback, className = '' }: {
  profile?: FomoProfile | null; fallback: ReactNode; className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const image = profile?.image;
  const requested = image && image !== failed;
  const ready = Boolean(requested && loaded === image);
  return (
    <span className={`sa-profile-picture ${className}`} aria-hidden="true" data-profile-state={ready ? 'ready' : requested ? 'loading' : 'fallback'}>
      {!ready && fallback}
      {requested && (
        <img key={image} src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className="sa-profile-picture__image" style={{ opacity: ready ? 1 : 0 }}
          onLoad={() => setLoaded(image)} onError={() => setFailed(image)} />
      )}
    </span>
  );
}
