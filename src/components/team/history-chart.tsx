import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Report } from "@/lib/moonastery/types";

const colors = {
  VEL: "#00b5f5",
  FIN: "#f70ba5",
  CRI: "#ececf2",
  DEF: "#47d7ac",
  POS: "#aa9bff",
  BST: "#7dceff",
  IMP: "#f5b7dd",
};
export default function HistoryChart({ reports }: { reports: Report[] }) {
  const points = [...reports]
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .map((report) => ({
      date: report.session_date,
      ...report.attributes,
      overall: report.overall,
    }));
  return (
    <div
      className="team-chart"
      role="img"
      aria-label="Histórico dos sete atributos. Valores exatos estão nos relatórios abaixo."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid stroke="#292a33" />
          <XAxis dataKey="date" stroke="#a8afbf" />
          <YAxis domain={[0, 99]} stroke="#a8afbf" />
          <Tooltip
            contentStyle={{ background: "#101116", border: "1px solid #343640", color: "#fff" }}
          />
          <Legend />
          {Object.entries(colors).map(([attribute, color]) => (
            <Line
              key={attribute}
              type="monotone"
              dataKey={attribute}
              stroke={color}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
