import { useEffect, useRef, useState } from 'react';
import { geocode } from '../api';
import './PlaceSearchField.css';

// 역명/장소명/임의 주소 검색 입력 필드. GET /api/geocode를 디바운스 호출해
// 후보 목록을 보여주고, 선택 시 {name, address, x, y} 형태로 onSelect에 전달한다.
export default function PlaceSearchField({ placeholder, selected, onSelect, onClear }) {
  const [query, setQuery] = useState(selected?.name ?? '');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(selected?.name ?? '');
    if (selected) setCandidates([]);
  }, [selected]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    setError(null);
    if (selected) onClear?.();

    clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setCandidates([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await geocode(trimmed);
        setCandidates(res.candidates ?? []);
      } catch (err) {
        setError(err.message || '검색 중 오류가 발생했어요');
        setCandidates([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }

  function handleSelect(candidate) {
    setCandidates([]);
    onSelect(candidate);
  }

  const trimmedLength = query.trim().length;

  return (
    <div className="place-search">
      <input
        className="place-search__input"
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={handleChange}
        autoComplete="off"
      />
      {loading && <p className="place-search__hint">검색 중…</p>}
      {!loading && error && <p className="place-search__hint place-search__hint--error">{error}</p>}
      {!loading && !error && !selected && trimmedLength >= 2 && candidates.length === 0 && (
        <p className="place-search__hint">검색 결과가 없어요. 다른 키워드로 시도해보세요.</p>
      )}
      {!selected && candidates.length > 0 && (
        <ul className="place-search__list">
          {candidates.map((candidate, i) => (
            <li key={`${candidate.name}-${i}`}>
              <button type="button" onClick={() => handleSelect(candidate)}>
                <span className="place-search__name">{candidate.name}</span>
                <span className="place-search__address">{candidate.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
