import type { SocialNetwork } from '../lib/networkingApi';

const marks = {
    x: <path fill="currentColor" stroke="none" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
    telegram: <><path d="m3 11 18-7-4 16-6-5-4 3 1-6Z" /><path d="m8 12 9-5-6 8" /></>,
    website: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 7h14M5 17h14" /></>,
    linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 10v7M11 17v-7m0 3c0-4 6-4 6 0v4" /><circle cx="7" cy="7" r=".5" /></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17" cy="7" r=".5" /></>,
    youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 6 3-6 3Z" /></>,
    tiktok: <><path d="M14 3v13a4 4 0 1 1-4-4M14 3c0 4 3 6 7 6" /></>,
    linktree: <><path d="M12 3v18M5 5l7 7 7-7M3 12h18M5 19l7-7 7 7" /></>,
    discord: <><path d="M7 6h10l4 12-5 2-2-3h-4l-2 3-5-2Z" /><circle cx="8.5" cy="12" r="1" /><circle cx="15.5" cy="12" r="1" /><path d="M9 16c2 1 4 1 6 0" /></>,
    github: <><path d="M9 21v-3c-4 1-4-2-6-3m12 6v-4c0-1-.4-2-1-2.5 4-.5 6-2 6-5 0-2-1-3-2-4V2l-4 2a13 13 0 0 0-4 0L6 2v3.5c-1 1-2 2-2 4 0 3 2 4.5 6 5-.6.5-1 1.5-1 2.5" /></>,
};

/** Small inline marks: no image requests or third-party scripts. */
export default function AccountIcon({ account }: { account: SocialNetwork | 'website' | 'linkedin' }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{marks[account]}</svg>;
}
