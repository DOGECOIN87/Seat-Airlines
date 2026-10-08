import { useState, type ReactNode } from 'react';
import type { FomoProfile } from '../lib/fomoProfile';

/** Fixed dimensions and a local fallback keep mobile rows from shifting. */
export default function ProfilePicture({ profile, fallback, className = '' }: {
  profile?: FomoProfile | null; fallback: ReactNode; className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const image = profile?.image;
  return (
    <span className={`sa-profile-picture ${className}`} aria-hidden="true">
      {image && image !== failed ? (
        <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(image)} />
      ) : fallback}
    </span>
  );
}
