import { OFFERINGS, type Offering } from '../content/offerings';

interface Props {
  query: string;
  offering: Offering | '';
  onQuery: (query: string) => void;
  onOffering: (offering: Offering | '') => void;
  offeringsDisabled?: boolean;
}

export default function PassengerFilters({ query, offering, onQuery, onOffering, offeringsDisabled }: Props) {
  return <div className="sa-passenger-filters">
    <label>Search holders
      <input type="search" value={query} onChange={(event) => onQuery(event.target.value)}
        placeholder="Name, wallet, seat or offering" maxLength={150} autoComplete="off" />
    </label>
    <label>Filter by offering
      <select aria-label="Filter by offering" value={offering} onChange={(event) => onOffering(event.target.value as Offering | '')} disabled={offeringsDisabled}>
        <option value="">All offerings</option>
        {OFFERINGS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select>
    </label>
    {(query || offering) && <button type="button" className="sa-passenger-filters__clear" onClick={() => { onQuery(''); onOffering(''); }}>Clear filters</button>}
  </div>;
}
