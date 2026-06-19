import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Theme-aware OG previews aligned to the Momentum OS slide system.
// `light` slides: warm off-white base, deep forest type.
// `dark` slides: forest gradient, warm white type.
type SlideTheme = "light" | "dark";

const THEMES: Record<SlideTheme, { background: string; text: string; muted: string; scrim: string }> = {
light: {
background: "linear-gradient(160deg, #F3F0E8 0%, #E6E2D7 60%, #D8D2C6 100%)",
text: "#1C2A22",
muted: "rgba(28,42,34,0.72)",
scrim: "linear-gradient(180deg, rgba(243,240,232,0) 30%, rgba(216,210,198,0.45) 100%)",
},
dark: {
background: "linear-gradient(180deg, #0B1914 0%, #123126 55%, #0D211A 100%)",
text: "#F3F1E8",
muted: "rgba(243,241,232,0.82)",
scrim: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)",
},
};

function resolveTheme(value: string | null): SlideTheme {
return value === "light" ? "light" : "dark";
}

export async function GET(req: NextRequest) {
const { searchParams } = new URL(req.url);
const hook = (searchParams.get("hook") || "Momentum").slice(0, 180);
const theme = resolveTheme(searchParams.get("theme"));
const t = THEMES[theme];
return new ImageResponse(
(
<div
style={{
display: "flex",
flexDirection: "column",
justifyContent: "flex-end",
width: "100%",
height: "100%",
background: t.background,
padding: "72px",
position: "relative",
fontFamily: "sans-serif",
}}
>
<div
style={{
position: "absolute",
top: 0,
left: 0,
right: 0,
bottom: 0,
background: t.scrim,
}}
/>
<div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
<div
style={{
fontSize: 64,
fontWeight: 700,
lineHeight: 1.15,
color: t.text,
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
color: t.muted,
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
