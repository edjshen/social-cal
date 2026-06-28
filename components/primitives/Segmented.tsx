'use client';
export default function Segmented({
  options,
  value,
  onChange,
  width,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  width?: number;
}) {
  return (
    <div className="seg" style={width ? { margin: 0, width } : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
