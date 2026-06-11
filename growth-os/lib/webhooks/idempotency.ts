import type { SupabaseClient } from "@supabase/supabase-js";

export type WebhookSource = "instagram" | "survey" | "trial";
export type DeliveryStatus =
  | "received"
  | "processed"
  | "failed"
  | "duplicate";

type RecordDeliveryArgs = {
  source: WebhookSource;
  deliveryId: string;
  signature?: string | null;
  payload?: unknown;
};

/**
 * Inserts a `received` row into webhook_deliveries. The (source, delivery_id)
 * unique constraint makes this the idempotency gate: on conflict we return
 * `{ duplicate: true }` and the caller should short-circuit.
 */
export async function recordDelivery(
  admin: SupabaseClient,
  { source, deliveryId, signature, payload }: RecordDeliveryArgs,
): Promise<{ duplicate: boolean; id?: string }> {
  const { data, error } = await admin
    .from("webhook_deliveries")
    .insert({
      source,
      delivery_id: deliveryId,
      signature: signature ?? null,
      status: "received",
      payload: payload ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation -> already processed this delivery.
    if (error.code === "23505") {
      return { duplicate: true };
    }
    throw error;
  }

  return { duplicate: false, id: data.id };
}

export async function markDelivery(
  admin: SupabaseClient,
  source: WebhookSource,
  deliveryId: string,
  status: DeliveryStatus,
  errorMessage?: string,
): Promise<void> {
  const { error } = await admin
    .from("webhook_deliveries")
    .update({ status, error: errorMessage ?? null })
    .eq("source", source)
    .eq("delivery_id", deliveryId);

  if (error) {
    console.error("[webhooks:markDelivery]", error.message);
  }
}
