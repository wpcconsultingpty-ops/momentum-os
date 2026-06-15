import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Brand palette pulled from the app (globals.css / layout.tsx).
const TEXT_LIGHT = "#ffffff";
const TEXT_MUTED_LIGHT = "rgba(255,255,255,0.82)";

// Curated, health/inspirational background "scenes". These are code-drawn
// gradients so they render reliably in next/og with no hosted assets.
// To swap to real photography later (B1), replace `gradient` with a
// `backgroundImage: \`url(\${origin}/og-backgrounds/bg-0X.jpg)\`` and keep
// the scrim + text overlay unchanged.
const BACKGROUNDS = [
    // Dashboard-aligned palette: vivid app green accent on clean gradients.
  // 0 - app green (primary accent)
  "linear-gradient(160deg, #34d399 0%, #16a34a 55%, #15803d 100%)",
  // 1 - emerald bright
  "linear-gradient(160deg, #4ade80 0%, #22c55e 50%, #16a34a 100%)",
  // 2 - teal mint
  "linear-gradient(160deg, #5eead4 0%, #2dd4bf 50%, #0d9488 100%)",
  // 3 - lime spring
  "linear-gradient(160deg, #a3e635 0%, #4ade80 50%, #16a34a 100%)",
  // 4 - green to slate
  "linear-gradient(160deg, #22c55e 0%, #15803d 55%, #1e293b 100%)",
  // 5 - fresh mint
  "linear-gradient(160deg, #6ee7b7 0%, #34d399 50%, #059669 100%)",
  // 6 - deep emerald
  "linear-gradient(160deg, #10b981 0%, #047857 55%, #064e3b 100%)",
  // 7 - green glow
  "linear-gradient(160deg, #86efac 0%, #22c55e 50%, #15803d 100%)",
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hook = (searchParams.get("hook") || "Momentum").slice(0, 180);
  const bgIndex =
    ((parseInt(searchParams.get("bg") || "0", 10) || 0) % BACKGROUNDS.length +
      BACKGROUNDS.length) %
    BACKGROUNDS.length;
  const background = BACKGROUNDS[bgIndex];

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width: "100%",
          height: "100%",
          background,
          padding: "72px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Scrim for legible text over any background */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.15,
              color: TEXT_LIGHT,
              letterSpacing: "-0.02em",
              maxWidth: "960px",
            }}
          >
            {hook}
          </div>
          <div
            style={{
              marginTop: "32px",
              fontSize: 28,
              fontWeight: 600,
              color: TEXT_MUTED_LIGHT,
              letterSpacing: "0.02em",
            }}
          >
            Momentum
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
