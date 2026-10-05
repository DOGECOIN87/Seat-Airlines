export const OFFERINGS = [
  { key: 'services', label: 'Services' },
  { key: 'nft', label: 'NFT' },
  { key: 'artist', label: 'Artist' },
  { key: 'developer', label: 'Developer' },
  { key: 'project', label: 'Project' },
  { key: 'community', label: 'Community' },
  { key: 'education', label: 'Education' },
  { key: 'designer', label: 'Designer' },
  { key: 'creator', label: 'Content Creator' },
  { key: 'music', label: 'Music' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'defi', label: 'DeFi' },
  { key: 'ai', label: 'AI & Automation' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'consulting', label: 'Consulting' },
  { key: 'ecommerce', label: 'Shop & Products' },
  { key: 'photography', label: 'Photography' },
  { key: 'writing', label: 'Writing' },
] as const;

export type Offering = (typeof OFFERINGS)[number]['key'];
export const MAX_OFFERINGS = 3;

export function readOfferings(value: unknown): { categories: Offering[] } | { error: string } {
  if (value === undefined) return { categories: [] };
  if (!Array.isArray(value) || value.some((key) => !OFFERINGS.some((option) => option.key === key))) {
    return { error: 'Choose offering tags from the listed options.' };
  }
  const categories = [...new Set(value)] as Offering[];
  return categories.length > MAX_OFFERINGS
    ? { error: `Choose up to ${MAX_OFFERINGS} offering tags.` }
    : { categories };
}

export function storedOfferings(value: string | null): Offering[] {
  try {
    const result = readOfferings(JSON.parse(value ?? '[]'));
    return 'categories' in result ? result.categories : [];
  } catch { return []; }
}
