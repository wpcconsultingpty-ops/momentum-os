// Renders a brief as inlined-HTML email + plain-text fallback.
// Every style is on the element (no <style> block) — survives Outlook, Gmail, etc.

const APP_URL = process.env.SITE_URL || "https://momentum-os-two.vercel.app";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function movedArrow(line) {
  // If the summariser gave us "↓" or "↑" at start, keep it, else neutral
  const first = line.trim().charAt(0);
  if (first === "↓") return { arrow: "↓", color: "#a04040", rest: line.trim().slice(1).trim() };
  if (first === "↑") {
    // Green if the movement is good (mood/energy/sleep up), red if bad (stress up)
    const badKeywords = /(stress)/i;
    return { arrow: "↑", color: badKeywords.test(line) ? "#a04040" : "#2f7a4a", rest: line.trim().slice(1).trim() };
  }
  return { arrow: "•", color: "#6e776f", rest: line.trim() };
}

export function renderBriefEmail(brief, opts = {}) {
  const { unsubscribeUrl = null, weekLabel = null, dateLabel = null, isSample = false } = opts;

  const streak = brief.streak || { current: 0, longest: 0, freezeUsedThisWeek: false };
  const daysLogged = (brief.meta && brief.meta.daysLogged) || 0;

  const weekOfDate = brief.date || new Date().toISOString().slice(0, 10);
  const dateObj = new Date(weekOfDate + "T00:00:00Z");
  const humanDate = dateLabel || dateObj.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const title = weekLabel || brief.title || "Weekly debrief";

  const movedHtml = (brief.moved || []).map(m => {
    const parts = movedArrow(m);
    return `<li style="font-size:14px;line-height:1.55;color:#2f3a31;margin-bottom:6px;"><span style="color:${parts.color};">${parts.arrow}</span> ${esc(parts.rest)}</li>`;
  }).join("");

  const heldHtml = (brief.held || []).map(h => (
    `<li style="font-size:14px;line-height:1.55;color:#2f3a31;margin-bottom:6px;">${esc(h)}</li>`
  )).join("");

  const wentDarkHtml = (brief.wentDark || []).map(w => (
    `<li style="font-size:14px;line-height:1.55;color:#2f3a31;margin-bottom:6px;">${esc(w)}</li>`
  )).join("");

  const tryHtml = (brief.tryThese || []).map((t, i) => (
    `<div style="padding:12px 14px;background:#f7f8f4;border-radius:8px;margin-bottom:8px;border:1px solid #eaece5;">
      <div style="font-weight:600;font-size:14px;color:#2f3a31;">${i + 1}. ${esc(t.action)}</div>
      <div style="font-size:13px;color:#6e776f;margin-top:3px;line-height:1.5;">${esc(t.why)}</div>
    </div>`
  )).join("");

  const askHtml = (brief.askCoach || []).map(a => (
    `<div style="padding:12px 14px;background:#f3fafb;border-radius:8px;margin-bottom:8px;border:1px solid #d9e9ea;">
      <div style="font-size:12px;color:#6e776f;margin-bottom:4px;font-style:italic;">${esc(a.context)}</div>
      <div style="font-size:14px;color:#0c6a6f;font-weight:500;">→ ${esc(a.prompt)}</div>
    </div>`
  )).join("");

  const sampleFooter = isSample
    ? `<br>Numbers shown here are illustrative — not from your real data.`
    : "";

  const unsubHtml = unsubscribeUrl
    ? `<br><a href="${esc(unsubscribeUrl)}" style="color:#94988f;text-decoration:underline;">Unsubscribe from The Brief</a>`
    : "";

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2f3a31;background:#f7f8f4;padding:24px;margin:0;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px 36px;border:1px solid #e6ebe0;">
<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:#0c6a6f;font-weight:700;">The Brief</div>
<h1 style="font-size:22px;margin:6px 0 4px;color:#2f3a31;font-weight:700;">${esc(title)}</h1>
<div style="font-size:13px;color:#6e776f;margin-bottom:20px;">${esc(humanDate)}</div>

<div style="padding:16px 20px;border-radius:12px;background:#fff5e6;border:1px solid #f2d9b0;margin-bottom:20px;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr>
<td style="padding-right:20px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6e776f;">🔥 Streak</div><div style="font-size:20px;font-weight:700;color:#2f3a31;margin-top:2px;">${streak.current} day${streak.current === 1 ? "" : "s"}</div></td>
<td style="padding-right:20px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6e776f;">Best</div><div style="font-size:20px;font-weight:700;color:#2f3a31;margin-top:2px;">${streak.longest}</div></td>
<td style="padding-right:20px;"><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6e776f;">Logged</div><div style="font-size:20px;font-weight:700;color:#2f3a31;margin-top:2px;">${daysLogged} / 7</div></td>
<td><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#6e776f;">Freeze</div><div style="font-size:20px;font-weight:700;color:#2f3a31;margin-top:2px;">${streak.freezeUsedThisWeek ? "used" : "available"}</div></td>
</tr></table>
</div>

${brief.headline ? `<div style="font-size:15px;line-height:1.55;color:#2f3a31;margin:20px 0 24px;padding:14px 16px;border-left:3px solid #0c6a6f;background:#f3fafb;border-radius:4px;">${esc(brief.headline)}</div>` : ""}

${movedHtml ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6e776f;margin:24px 0 10px;font-weight:700;">What moved</div>
<ul style="margin:0;padding-left:20px;">${movedHtml}</ul>` : ""}

${heldHtml ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6e776f;margin:24px 0 10px;font-weight:700;">What held</div>
<ul style="margin:0;padding-left:20px;">${heldHtml}</ul>` : ""}

${wentDarkHtml ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6e776f;margin:24px 0 10px;font-weight:700;">What went dark</div>
<ul style="margin:0;padding-left:20px;">${wentDarkHtml}</ul>` : ""}

${tryHtml ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6e776f;margin:24px 0 10px;font-weight:700;">Three things for next week</div>
${tryHtml}` : ""}

${askHtml ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#6e776f;margin:24px 0 10px;font-weight:700;">Ask Coach this week</div>
${askHtml}` : ""}

<div style="margin-top:24px;"><a href="${esc(APP_URL)}" style="display:inline-block;padding:10px 20px;background:#0c6a6f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Open Momentum →</a></div>

<div style="margin-top:32px;padding-top:20px;border-top:1px solid #eaece5;font-size:12px;color:#94988f;text-align:center;">
This is your weekly Momentum OS debrief.${sampleFooter}${unsubHtml}
</div>
</div></div>`;

  // Plain-text fallback
  const lines = [];
  lines.push(`THE BRIEF — ${title}`);
  lines.push(humanDate);
  lines.push("");
  lines.push(`🔥 STREAK: ${streak.current} days  |  Best: ${streak.longest}  |  Logged: ${daysLogged}/7  |  Freeze: ${streak.freezeUsedThisWeek ? "used" : "available"}`);
  lines.push("");
  if (brief.headline) { lines.push(brief.headline); lines.push(""); }
  if (brief.moved && brief.moved.length) { lines.push("WHAT MOVED"); brief.moved.forEach(m => lines.push(m)); lines.push(""); }
  if (brief.held && brief.held.length) { lines.push("WHAT HELD"); brief.held.forEach(h => lines.push(`• ${h}`)); lines.push(""); }
  if (brief.wentDark && brief.wentDark.length) { lines.push("WHAT WENT DARK"); brief.wentDark.forEach(w => lines.push(`• ${w}`)); lines.push(""); }
  if (brief.tryThese && brief.tryThese.length) {
    lines.push("THREE THINGS FOR NEXT WEEK");
    brief.tryThese.forEach((t, i) => { lines.push(`${i + 1}. ${t.action}`); lines.push(`   ${t.why}`); });
    lines.push("");
  }
  if (brief.askCoach && brief.askCoach.length) {
    lines.push("ASK COACH THIS WEEK");
    brief.askCoach.forEach(a => lines.push(`→ ${a.prompt}`));
    lines.push("");
  }
  lines.push(`Open Momentum: ${APP_URL}`);
  if (unsubscribeUrl) { lines.push(""); lines.push(`Unsubscribe: ${unsubscribeUrl}`); }
  const text = lines.join("\n");

  return { html, text };
}
