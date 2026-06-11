import { describe, expect, it } from "vitest";
import { markDelivery, recordDelivery } from "@/lib/webhooks/idempotency";
import { createSupabaseMock } from "./helpers/supabaseMock";

describe("recordDelivery", () => {
  it("inserts a new delivery and returns { duplicate: false, id }", async () => {
    const { client, from } = createSupabaseMock({
      webhook_deliveries: { insert: { data: { id: "row-1" }, error: null } },
    });

    const result = await recordDelivery(client, {
      source: "survey",
      deliveryId: "d1",
      signature: "sig",
      payload: { a: 1 },
    });

    expect(result).toEqual({ duplicate: false, id: "row-1" });
    expect(from).toHaveBeenCalledWith("webhook_deliveries");
  });

  it("returns { duplicate: true } on a unique-violation (23505)", async () => {
    const { client } = createSupabaseMock({
      webhook_deliveries: {
        insert: { data: null, error: { code: "23505", message: "dup" } },
      },
    });

    const result = await recordDelivery(client, {
      source: "survey",
      deliveryId: "d1",
    });

    expect(result).toEqual({ duplicate: true });
  });

  it("rethrows a non-unique-violation DB error", async () => {
    const { client } = createSupabaseMock({
      webhook_deliveries: {
        insert: { data: null, error: { code: "08006", message: "conn lost" } },
      },
    });

    await expect(
      recordDelivery(client, { source: "trial", deliveryId: "d2" }),
    ).rejects.toMatchObject({ code: "08006" });
  });
});

describe("markDelivery", () => {
  it("records a failed status after a processing error without throwing", async () => {
    const { client, from } = createSupabaseMock({
      webhook_deliveries: { update: { data: null, error: null } },
    });

    await expect(
      markDelivery(client, "survey", "d1", "failed", "boom"),
    ).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith("webhook_deliveries");
  });

  it("swallows DB errors (logs, does not throw)", async () => {
    const { client } = createSupabaseMock({
      webhook_deliveries: {
        update: { data: null, error: { message: "update failed" } },
      },
    });

    await expect(
      markDelivery(client, "trial", "d3", "processed"),
    ).resolves.toBeUndefined();
  });
});
