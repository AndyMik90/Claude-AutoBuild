interface StatusBadgeProps {
  status: 'success' | 'warning' | 'info';
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = {
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-info/10 text-info',
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${colors[status]}`}>
      {label}
    </span>
  );
}
