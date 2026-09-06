import { eq, and, gt } from "drizzle-orm";

import { db } from "../db";
import { budgets, goals, sessions, transactions, userSettings, users } from "../db/schema";

export type UserInsert = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function getUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function createUser(input: UserInsert) {
  return db.insert(users).values({
    id: input.id,
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
  });
}

export async function listTransactionsForUser(userId: string) {
  return db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    orderBy: (rows, { desc }) => [desc(rows.date), desc(rows.createdAt)],
  });
}

export async function createTransactionForUser(userId: string, input: typeof transactions.$inferInsert) {
  return db.insert(transactions).values({
    ...input,
    userId,
  });
}

export async function updateTransactionForUser(userId: string, transactionId: string, input: Partial<typeof transactions.$inferInsert>) {
  return db
    .update(transactions)
    .set({
      ...input,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
}

export async function deleteTransactionForUser(userId: string, transactionId: string) {
  return db
    .delete(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));
}

export async function listBudgetsForUser(userId: string) {
  return db.query.budgets.findMany({
    where: eq(budgets.userId, userId),
  });
}

export async function listGoalsForUser(userId: string) {
  return db.query.goals.findMany({
    where: eq(goals.userId, userId),
  });
}

export async function getUserSettings(userId: string) {
  return db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
}

export async function saveUserSettings(userId: string, input: Partial<typeof userSettings.$inferInsert>) {
  return db
    .insert(userSettings)
    .values({
      ...input,
      id: input.id ?? crypto.randomUUID(),
      userId,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        ...input,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function ensureUserExists(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function createSessionForUser(userId: string, tokenHash: string, expiresAt: string) {
  return db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
  });
}

export async function findSessionByTokenHash(tokenHash: string) {
  const now = new Date().toISOString();

  return db.query.sessions.findFirst({
    where: and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
  });
}

export async function deleteSessionByTokenHash(tokenHash: string) {
  return db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSessionsForUser(userId: string) {
  return db.delete(sessions).where(eq(sessions.userId, userId));
}
