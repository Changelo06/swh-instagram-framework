import { memo } from "react";

const SK_BASE = {
  background: "var(--tac-surface)",
  border: "1px solid var(--tac-border)",
  borderRadius: 10,
  padding: 20,
  display: "grid",
  gap: 12,
};

function SkBlock({ height = 14, width = "60%", radius = 4 }) {
  return (
    <div
      className="tac-skeleton"
      style={{ height, width, borderRadius: radius }}
    />
  );
}

function SkHeader({ width = "40%" }) {
  return <SkBlock height={12} width={width} radius={4} />;
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gap: 16, padding: "16px 24px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} style={SK_BASE}>
            <SkHeader width="50%" />
            <SkBlock height={36} width="55%" radius={6} />
            <SkBlock height={28} width="100%" radius={4} />
          </div>
        ))}
      </div>

      <div style={SK_BASE}>
        <SkHeader width="20%" />
        {Array.from({ length: 6 }).map((_, i) => (
          <SkBlock key={i} height={20} width="100%" radius={4} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "7fr 3fr",
          gap: 16,
        }}
      >
        <div style={SK_BASE}>
          <SkHeader width="35%" />
          <SkBlock height={220} width="100%" radius={8} />
        </div>
        <div style={SK_BASE}>
          <SkHeader width="50%" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 6,
              alignItems: "end",
              height: 80,
            }}
          >
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="tac-skeleton"
                style={{
                  height: `${30 + Math.random() * 60}%`,
                  borderRadius: "4px 4px 0 0",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={SK_BASE}>
        <SkHeader width="20%" />
        <SkBlock height={36} width="100%" radius={6} />
      </div>
    </div>
  );
}

export default memo(SkeletonGrid);
