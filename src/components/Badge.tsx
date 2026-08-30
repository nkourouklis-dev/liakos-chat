interface BadgeProps {
  count: number;
  /** "dot" για μικρή κουκκίδα πάνω σε εικονίδιο, "pill" για αριθμό σε λίστα */
  variant?: "dot" | "pill";
}

export default function Badge({ count, variant = "pill" }: BadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : String(count);

  if (variant === "dot") {
    return (
      <span className="absolute -right-1 -top-1 flex min-w-[1.35rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-black leading-none text-white shadow-lg ring-2 ring-liakos-900">
        {label}
      </span>
    );
  }

  return (
    <span className="flex min-w-[1.75rem] items-center justify-center rounded-full bg-red-500 px-2 py-1 text-sm font-black leading-none text-white">
      {label}
    </span>
  );
}
