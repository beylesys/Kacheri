// frontend/src/components/ProviderBadge.tsx

type Props = {
  provider?: string | null;
  model?: string | null;
  seed?: string | number | null;
  className?: string;
};

export default function ProviderBadge({ provider, model, seed, className }: Props) {
  if (!provider && !model) return null;
  const label = [provider, model].filter(Boolean).join(" • ");
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        lineHeight: "16px",
        padding: "2px 8px",
        borderRadius: 6,
        border: "1px solid currentColor",
        opacity: 0.8,
        whiteSpace: "nowrap"
      }}
      title={seed != null ? `Seed: ${seed}` : undefined}
    >
      {label}
    </span>
  );
}
