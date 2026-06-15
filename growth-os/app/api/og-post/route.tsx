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
  // On-brand Momentum palette: app green accent -> deep forest/charcoal.
  // 0 - core brand green
  "linear-gradient(160deg, #22c55e 0%, #15803d 50%, #052e16 100%)",
  // 1 - emerald deep
  "linear-gradient(160deg, #34d399 0%, #047857 50%, #022c22 100%)",
  // 2 - forest charcoal
  "linear-gradient(160deg, #16a34a 0%, #14532d 55%, #0a0a0a 100%)",
  // 3 - teal-green
  "linear-gradient(160deg, #2dd4bf 0%, #0f766e 50%, #042f2e 100%)",
  // 4 - lime fresh
  "linear-gradient(160deg, #4ade80 0%, #16a34a 50%, #14532d 100%)",
  // 5 - green to ink
  "linear-gradient(160deg, #15803d 0%, #064e3b 55%, #0a0a0a 100%)",
  // 6 - mint to deep
  "linear-gradient(160deg, #6ee7b7 0%, #059669 50%, #064e3b 100%)",
  // 7 - dark brand
  "linear-gradient(160deg, #166534 0%, #14532d 50%, #052e16 100%)",
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
