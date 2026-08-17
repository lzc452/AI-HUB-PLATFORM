import { describe, expect, it, vi } from "vitest";

import { createDatabaseRuntimeFrom, type DatabaseRuntime } from "./runtime.js";

describe("DatabaseRuntime", () => {
  it("shares one database instance for transactions and closes it once", async () => {
    const transaction = { marker: "transaction" };
    const fakeDatabase = {
      destroy: vi.fn(async () => undefined),
      transaction: () => ({
        execute: async (operation: (value: unknown) => Promise<string>) =>
          operation(transaction),
      }),
    };
    const database = fakeDatabase as never;

    const runtime: DatabaseRuntime = createDatabaseRuntimeFrom(database);

    await expect(
      runtime.withTransaction(async (current) => {
        expect(current).toBe(transaction);
        return "committed";
      }),
    ).resolves.toBe("committed");
    await runtime.close();

    expect(fakeDatabase.destroy).toHaveBeenCalledOnce();
  });
});
