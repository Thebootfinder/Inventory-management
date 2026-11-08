import { Icon } from './Icon';

export function Stepper({
  value,
  onChange,
  min = 0,
  label,
  big,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  label?: string;
  big?: boolean;
}) {
  return (
    <div className={`stepper${big ? ' big' : ''}`} aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Moins">
        <Icon name="minus" size={big ? 26 : 18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isNaN(n) ? min : Math.max(min, n));
        }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Plus">
        <Icon name="plus" size={big ? 26 : 18} />
      </button>
    </div>
  );
}
