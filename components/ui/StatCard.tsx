interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
}

export function StatCard({ label, value, delta, deltaPositive }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      {delta && (
        <p
          className={`mt-1 text-sm font-medium ${
            deltaPositive ? "text-emerald-600" : "text-red-500"
          }`}
        >
          {deltaPositive ? "▲" : "▼"} {delta} vs last month
        </p>
      )}
    </div>
  );
}
