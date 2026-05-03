import { memo } from "react";

const SK_BASE = {
  background: "var(--tac-surface)",
  border: "1px solid var(--tac-border)",
  display: "grid",
  gridTemplateRows: "auto 1fr",
};

const SK_HEADER = {
  borderBottom: "1px solid var(--tac-border)",
  padding: "8px 12px",
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "var(--tac-surface2)",
};

function SkBlock({ height = 14, width = "60%" }) {
  return (
    <div
      className="tac-skeleton"
      style={{ height, width, marginBottom: 8 }}
    />
  );
}

function SkHeader({ width = "40%" }) {
  return (
    <div style={SK_HEADER}>
      <div className="tac-skeleton" style={{ height: 10, width }} />
    </div>
  );
}

function SkBody({ children }) {
  return <div style={{ padding: 14 }}>{children}</div>;
}

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gap: 1, background: "var(--tac-border)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 1, background: "var(--tac-border)" }}>
        <div style={SK_BASE}>
          <SkHeader width="35%" />
          <SkBody>
            <SkBlock height={36} width="55%" />
            <SkBlock height={28} width="100%" />
          </SkBody>
        </div>
        <div style={SK_BASE}>
          <SkHeader width="50%" />
          <SkBody>
            <SkBlock height={20} width="80%" />
            <SkBlock height={12} width="60%" />
            <SkBlock height={12} width="70%" />
            <SkBlock height={12} width="50%" />
          </SkBody>
        </div>
        <div style={SK_BASE}>
          <SkHeader width="50%" />
          <SkBody>
            <SkBlock height={20} width="80%" />
            <SkBlock height={12} width="60%" />
            <SkBlock height={12} width="70%" />
            <SkBlock height={12} width="50%" />
          </SkBody>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "7fr 3fr",
          gap: 1,
          background: "var(--tac-border)",
        }}
      >
        <div style={SK_BASE}>
          <SkHeader width="30%" />
          <SkBody>
            <SkBlock height={70} width="100%" />
          </SkBody>
        </div>
        <div style={SK_BASE}>
          <SkHeader width="60%" />
          <SkBody>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(8, 1fr)",
                gap: 2,
              }}
            >
              {Array.from({ length: 32 }).map((_, i) => (
                <div
                  key={i}
                  className="tac-skeleton"
                  style={{ aspectRatio: "1 / 1" }}
                />
              ))}
            </div>
          </SkBody>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          background: "var(--tac-border)",
        }}
      >
        <div style={SK_BASE}>
          <SkHeader width="50%" />
          <SkBody>
            <SkBlock height={24} width="60%" />
            <SkBlock height={20} width="80%" />
          </SkBody>
        </div>
        <div style={SK_BASE}>
          <SkHeader width="50%" />
          <SkBody>
            <SkBlock height={24} width="60%" />
            <SkBlock height={20} width="80%" />
          </SkBody>
        </div>
        <div style={SK_BASE}>
          <SkHeader width="50%" />
          <SkBody>
            <SkBlock height={24} width="60%" />
            <SkBlock height={20} width="80%" />
          </SkBody>
        </div>
      </div>
    </div>
  );
}

export default memo(SkeletonGrid);
