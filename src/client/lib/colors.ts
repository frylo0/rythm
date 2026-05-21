export const colorFamilies = [
  { name: "Красные", colors: ["#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#b91c1c", "#7f1d1d"] },
  { name: "Тёплые", colors: ["#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#c2410c", "#7c2d12"] },
  { name: "Золото", colors: ["#fef3c7", "#fde68a", "#fcd34d", "#fbbf24", "#d97706", "#b45309", "#92400e", "#78350f"] },
  { name: "Зелёные", colors: ["#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#15803d", "#14532d"] },
  { name: "Бирюза", colors: ["#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488", "#0f766e", "#134e4a"] },
  { name: "Синие", colors: ["#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8", "#1e3a8a"] },
  { name: "Фиолетовые", colors: ["#ede9fe", "#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#4c1d95"] },
  { name: "Розовые", colors: ["#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#be185d", "#831843"] },
  { name: "Нейтральные", colors: ["#ffffff", "#f8fafc", "#e5e7eb", "#cbd5e1", "#94a3b8", "#64748b", "#334155", "#111827"] }
];

export const palette = colorFamilies.flatMap((family) => family.colors);
