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
  // 0 — sunrise calm
  "linear-gradient(160deg, #f9a26c 0%, #d96b54 45%, #2b2140 100%)",
  // 1 — ocean horizon
  "linear-gradient(160deg, #7fd4d1 0%, #2f8f9d 50%, #10303a 100%)",
  // 2 — forest light
  "linear-gradient(160deg, #8fcf8b 0%, #3f8f5f 50%, #11331f 100%)",
  // 3 — mountain dawn
  "linear-gradient(160deg, #c9b6e4 0%, #6d6aa6 50%, #1c2233 100%)",
  // 4 — desert warmth
  "linear-gradient(160deg, #f4c98a 0%, #c98a52 50%, #3a2418 100%)",
  // 5 — still water dusk
  "linear-gradient(160deg, #8aa6c9 0%, #4a5e84 50%, #14182b 100%)",
  // 6 — meadow morning
  "linear-gradient(160deg, #d9e08a 0%, #8fae4f 50%, #2a331a 100%)",
  // 7 — coastal slate
  "linear-gradient(160deg, #a9c2c4 0%, #5a7d80 50%, #16242b 100%)",
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
