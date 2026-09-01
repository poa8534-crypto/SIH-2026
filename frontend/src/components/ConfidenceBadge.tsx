interface ConfidenceBadgeProps {
  value: number; // 0 to 1
}

/**
 * Confidence bands. Colours come from --ok / --warn / --danger, which are
 * defined per theme: the dark set is tuned for a near-black surface and the
 * light set is darkened to clear 3:1 on white. The thresholds mirror the
 * matcher's calibrated tau_high (0.775).
 */
export function ConfidenceBadge({ value }: ConfidenceBadgeProps) {
  let colorClass = 'text-danger';
  let band = 'Low Confidence';

  if (value >= 0.775) {
    colorClass = 'text-ok';
    band = 'High Confidence';
  } else if (value >= 0.5) {
    colorClass = 'text-warn';
    band = 'Medium Confidence';
  }

  const percentage = (value * 100).toFixed(1);

  return (
    <span className={`font-mono tabular-nums ${colorClass}`} title={band}>
      {percentage}%
    </span>
  );
}
