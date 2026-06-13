import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Brand palette pulled from the app (globals.css / layout.tsx):
// background #ffffff, surround gray-50 #f9fafb, foreground text gray-900 #111827.
const BG = "#f9fafb";
const CARD = "#ffffff";
const TEXT = "#111827";
const MUTED = "#6b7280";
const ACCENT = "#0a0a0a";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hook = (searchParams.get("hook") || "Momentum").slice(0, 180);

  return new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1080px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: BG,
          padding: "96px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 700, color: ACCENT, letterSpacing: "-0.02em" }}>
          Momentum
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: CARD,
            borderRadius: "32px",
            border: "1px solid #e5e7eb",
            padding: "80px",
            margin: "40px 0",
          }}
        >
          <div style={{ width: "72px", height: "8px", backgroundColor: ACCENT, borderRadius: "9999px", marginBottom: "48px" }} />
          <div
            style={{
              display: "flex",
              fontSize: hook.length > 90 ? 64 : 80,
              lineHeight: 1.15,
              fontWeight: 800,
              color: TEXT,
              letterSpacing: "-0.02em",
            }}
          >
            {hook}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: MUTED }}>
          Momentum Growth OS
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
