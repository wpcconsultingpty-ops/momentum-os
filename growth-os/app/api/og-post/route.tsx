import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Momentum OS branded carousel slide renderer (1080x1350 portrait).
// Pure code: logo, icons, counter, and CTA pill are drawn inline. No external assets.
type SlideTheme = "light" | "dark";

const THEMES: Record<SlideTheme, { background: string; text: string; muted: string; accent: string; badgeBg: string; badgeFg: string; pillBg: string; pillText: string; }> = {
  light: {
    background: "linear-gradient(160deg, #F3F0E8 0%, #E6E2D7 60%, #D8D2C6 100%)",
    text: "#1C2A22",
    muted: "rgba(28,42,34,0.72)",
    accent: "#2F6B3A",
    badgeBg: "rgba(47,107,58,0.12)",
    badgeFg: "#2F6B3A",
    pillBg: "#143024",
    pillText: "#F3F1E8",
  },
  dark: {
    background: "linear-gradient(180deg, #0B1914 0%, #123126 55%, #0D211A 100%)",
    text: "#F3F1E8",
    muted: "rgba(243,241,232,0.82)",
    accent: "#8FBF5A",
    badgeBg: "rgba(143,191,90,0.16)",
    badgeFg: "#8FBF5A",
    pillBg: "rgba(20,48,36,0.92)",
    pillText: "#F3F1E8",
  },
};

function resolveTheme(value: string | null): SlideTheme {
  return value === "light" ? "light" : "dark";
}

// Split a headline so the final phrase can be rendered in the accent colour.
function splitAccent(headline: string, accent: string | null): { main: string; tail: string } {
  if (accent && headline.includes(accent)) {
    const idx = headline.lastIndexOf(accent);
    return { main: headline.slice(0, idx).trim(), tail: headline.slice(idx).trim() };
  }
  return { main: headline, tail: "" };
}

// The Momentum "M" mark, drawn as an inline SVG so no asset file is required.
function MarkSvg(size: number, fg: string, accent: string) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 86 L30 14 L50 56 L70 14 L92 86 L74 86 L60 46 L50 70 L40 46 L26 86 Z" fill={fg} />
      <path d="M50 56 L70 14 L92 86 L74 86 L60 46 Z" fill={accent} />
    </svg>
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hook = (searchParams.get("hook") || "Build Momentum").slice(0, 160);
  const accentWord = searchParams.get("accent");
  const sub = (searchParams.get("sub") || "").slice(0, 160);
  const kicker = (searchParams.get("kicker") || "").slice(0, 12);
  const footer = (searchParams.get("footer") || "").slice(0, 120);
  const kind = searchParams.get("kind") || "feature";
  const features = (searchParams.get("features") || "")
    .split("|")
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 5);
  const theme = resolveTheme(searchParams.get("theme"));
  const t = THEMES[theme];
  const counter = kicker.replace(/\s*\/\s*/, "/");
  const { main, tail } = splitAccent(hook, accentWord);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: t.background,
          padding: "72px",
          position: "relative",
          fontFamily: "sans-serif",
          color: t.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {MarkSvg(64, t.text, t.accent)}
            <div style={{ display: "flex", marginLeft: 18, fontSize: 38, fontWeight: 800, letterSpacing: 1 }}>
              <span style={{ color: t.text }}>MOMENTUM</span>
              <span style={{ color: t.accent }}>OS</span>
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: t.muted }}>{counter}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 64, flexGrow: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: kind === "cover" ? 104 : 76, fontWeight: 900, lineHeight: 1.02, textTransform: "uppercase", letterSpacing: -1 }}>
            <span style={{ color: t.text }}>{main}</span>
            {tail ? <span style={{ color: t.accent }}>{tail}</span> : null}
          </div>
          <div style={{ display: "flex", width: 120, height: 6, background: t.accent, marginTop: 36, marginBottom: 8, borderRadius: 4 }} />
          {sub ? <div style={{ display: "flex", fontSize: 40, color: t.muted, marginTop: 28, maxWidth: 760, lineHeight: 1.25 }}>{sub}</div> : null}

          <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 32, background: t.badgeBg, color: t.badgeFg, fontSize: 32, fontWeight: 800 }}>
                  {String.fromCharCode(10003)}
                </div>
                <div style={{ display: "flex", marginLeft: 24, fontSize: 40, fontWeight: 600, color: t.text }}>{f}</div>
              </div>
            ))}
          </div>
        </div>

        {footer ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.pillBg, color: t.pillText, borderRadius: 28, padding: "36px 44px", marginTop: 24 }}>
            <div style={{ display: "flex", fontSize: kind === "cta" ? 44 : 38, fontWeight: 700, maxWidth: 800, lineHeight: 1.2 }}>{footer}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 80, height: 80, borderRadius: 40, background: t.accent, color: "#0B1914", fontSize: 44, fontWeight: 900, marginLeft: 24 }}>
              {String.fromCharCode(8594)}
            </div>
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1080,
      height: 1350,
    }
  );
}
