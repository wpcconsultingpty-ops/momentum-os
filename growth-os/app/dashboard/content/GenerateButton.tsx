"use client";

import { useFormStatus } from "react-dom";
import { generateContentForm } from "./generate-actions";
import { generateCarouselDraftForm } from "./carousel-actions";

function SubmitButton({ idleLabel, pendingLabel }: { idleLabel: string; pendingLabel: string }) {
const { pending } = useFormStatus();
return (
<button
type="submit"
disabled={pending}
className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
>
{pending ? pendingLabel : idleLabel}
</button>
);
}

// Generates brand-aligned Instagram drafts on demand. Drafts land in this
// ledger and the Approvals queue; nothing publishes without owner approval.
// Two flows are offered: single-image posts and multi-slide carousels.
export default function GenerateButton() {
return (
<div className="flex flex-wrap items-center gap-6">
<form action={generateContentForm} className="flex items-center gap-3">
<label htmlFor="count" className="text-sm text-gray-600">
How many
</label>
<select
id="count"
name="count"
defaultValue="3"
className="rounded-md border border-gray-300 px-2 py-2 text-sm"
>
<option value="1">1</option>
<option value="3">3</option>
<option value="5">5</option>
<option value="10">10</option>
</select>
<SubmitButton idleLabel="Generate drafts" pendingLabel="Generating..." />
</form>
<form action={generateCarouselDraftForm} className="flex items-center gap-3">
<label htmlFor="carousel-count" className="text-sm text-gray-600">
Carousels
</label>
<select
id="carousel-count"
name="count"
defaultValue="3"
className="rounded-md border border-gray-300 px-2 py-2 text-sm"
>
<option value="1">1</option>
<option value="3">3</option>
<option value="5">5</option>
<option value="10">10</option>
</select>
<SubmitButton idleLabel="Generate carousels" pendingLabel="Generating..." />
</form>
</div>
);
}
