import type { CookieOptions } from "@supabase/ssr";
import type { CookieAdapter } from "@/lib/supabase/server";

export type SetCall = { name: string; value: string; options?: CookieOptions };

/**
 * In-memory cookie store implementing the CookieAdapter contract used by
 * lib/supabase/server.ts. Records every `set` so tests can assert that the
 * SSR client persisted refreshed tokens.
 */
export class FakeCookieStore implements CookieAdapter {
  private store = new Map<string, string>();
  readonly setCalls: SetCall[] = [];

  constructor(initial: { name: string; value: string }[] = []) {
    for (const { name, value } of initial) this.store.set(name, value);
  }

  getAll(): { name: string; value: string }[] {
    return Array.from(this.store.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }

  set(name: string, value: string, options?: CookieOptions): void {
    this.setCalls.push({ name, value, options });
    if (value === "") {
      this.store.delete(name);
    } else {
      this.store.set(name, value);
    }
  }
}
