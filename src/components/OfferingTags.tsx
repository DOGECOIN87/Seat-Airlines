import { OFFERINGS, type Offering } from '../content/offerings';

export default function OfferingTags({ categories = [] }: { categories?: Offering[] }) {
  if (!categories.length) return null;
  return <ul className="sa-offering-tags" aria-label="Offerings">
    {OFFERINGS.filter((option) => categories.includes(option.key)).map((option) => (
      <li key={option.key}>{option.label}</li>
    ))}
  </ul>;
}
