import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 10 }).default('user').notNull(),
  isBanned: boolean('is_banned').default(false).notNull(),
  mfaSecret: text('mfa_secret'),
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  saveLimit: integer('save_limit').default(10).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastLogin: timestamp('last_login', { withTimezone: true }),
});

export const passkeyCredentials = pgTable('passkey_credentials', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).default(0).notNull(),
  deviceType: varchar('device_type', { length: 32 }),
  backedUp: boolean('backed_up').default(false).notNull(),
  transports: text('transports'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
}, (table) => [
  index('idx_passkey_user').on(table.userId),
]);

export const simulations = pgTable('simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  visibility: varchar('visibility', { length: 10 }).default('private').notNull(),
  shareToken: varchar('share_token', { length: 32 }).unique(),
  state: jsonb('state').notNull(),
  generation: integer('generation').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_simulations_owner').on(table.ownerId),
  index('idx_simulations_public').on(table.visibility),
]);

export const leaderboardEntries = pgTable('leaderboard_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  simulationId: uuid('simulation_id').references(() => simulations.id, { onDelete: 'cascade' }).notNull(),
  scoreType: varchar('score_type', { length: 30 }).notNull(),
  score: bigint('score', { mode: 'number' }).notNull(),
  generation: integer('generation').notNull(),
  achievedAt: timestamp('achieved_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_leaderboard_unique').on(table.userId, table.simulationId, table.scoreType),
  index('idx_leaderboard_score').on(table.scoreType, table.score),
]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_refresh_tokens_user').on(table.userId),
]);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userActivity = pgTable('user_activity', {
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  activeDate: date('active_date').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.activeDate] }),
  index('idx_user_activity_date').on(table.activeDate),
]);
