import { db } from '../db/index.js';
import { userActivity } from '../db/schema.js';
import { sql, eq, gte } from 'drizzle-orm';

export async function trackActivity(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await db
    .insert(userActivity)
    .values({ userId, activeDate: today })
    .onConflictDoNothing();
}

export async function getDailyActiveUsers(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(userActivity)
    .where(eq(userActivity.activeDate, today));
  return result[0]?.count ?? 0;
}

export async function getMonthlyActiveUsers(): Promise<number> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
  const result = await db
    .select({ count: sql<number>`count(distinct ${userActivity.userId})` })
    .from(userActivity)
    .where(gte(userActivity.activeDate, dateStr));
  return result[0]?.count ?? 0;
}

export async function getDauHistory(days: number = 90): Promise<Array<{ date: string; count: number }>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split('T')[0];

  const rows = await db
    .select({
      date: userActivity.activeDate,
      count: sql<number>`count(*)`,
    })
    .from(userActivity)
    .where(gte(userActivity.activeDate, dateStr))
    .groupBy(userActivity.activeDate)
    .orderBy(userActivity.activeDate);

  return rows.map(r => ({ date: String(r.date), count: r.count }));
}

const recentApiUsers = new Map<string, number>();

export function trackLiveUser(userId: string): void {
  recentApiUsers.set(userId, Date.now());
}

export function getLiveUserCount(): number {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  let count = 0;
  for (const [userId, ts] of recentApiUsers) {
    if (ts < fiveMinAgo) {
      recentApiUsers.delete(userId);
    } else {
      count++;
    }
  }
  return count;
}
