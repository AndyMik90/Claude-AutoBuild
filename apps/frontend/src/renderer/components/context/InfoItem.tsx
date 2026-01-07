interface InfoItemProps {
  label: string;
  value: string;
}

export function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
