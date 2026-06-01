import { eq } from "drizzle-orm";
import { domains } from "../db/schema";

/** Domains servers can be created under (SQLite-backed). */
export const useDomains = () => {
  const list = async (): Promise<string[]> => {
    const rows = await db.select().from(domains);
    return rows.map((row) => row.domain);
  };

  const has = async (domain: string): Promise<boolean> => {
    const row = await db
      .select()
      .from(domains)
      .where(eq(domains.domain, domain))
      .get();
    return Boolean(row);
  };

  const add = async (domain: string) => {
    await db.insert(domains).values({ domain }).onConflictDoNothing();
  };

  const remove = async (domain: string) => {
    await db.delete(domains).where(eq(domains.domain, domain));
  };

  return { list, has, add, remove };
};
