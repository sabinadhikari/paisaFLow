import crypto from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import { getCookie } from "@tanstack/react-start/server";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  clearSessionTokenCookie,
  createRandomSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
  writeSessionTokenCookie,
} from "@/lib/auth";
import {
  createSessionForUser,
  deleteSessionByTokenHash,
  deleteSessionsForUser,
  getUserByEmail,
  getUserById,
  listTransactionsForUser,
} from "@/server/data-access";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
};

function serializeUser(user: Awaited<ReturnType<typeof getUserById>>): PublicUser | null {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE_NAME) ?? null;
  if (!token) return null;

  const sessionHash = hashSessionToken(token);
  const session = await db.query.sessions.findFirst({
    where: (table, { eq }) => eq(table.tokenHash, sessionHash),
  });

  if (!session) return null;

  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await deleteSessionByTokenHash(sessionHash);
    return null;
  }

  const user = await getUserById(session.userId);
  return serializeUser(user);
});

export const registerUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      name: z.string().trim().min(1, "Name is required"),
      email: z.string().trim().email("Please enter a valid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      confirmPassword: z.string().min(8, "Please confirm your password"),
    }),
  )
  .handler(async ({ data }) => {
    const normalizedEmail = data.email.trim().toLowerCase();

    if (data.password !== data.confirmPassword) {
      throw new Error("Passwords do not match");
    }

    const existingUser = await getUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new Error("An account with this email already exists");
    }

    const passwordHash = await hashPassword(data.password);
    const userId = crypto.randomUUID();

    await db.insert(users).values({
      id: userId,
      name: data.name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    return serializeUser(await getUserById(userId));
  });

export const loginUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().email("Please enter a valid email address"),
      password: z.string().min(1, "Password is required"),
    }),
  )
  .handler(async ({ data }) => {
    const normalizedEmail = data.email.trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw new Error("Invalid email or password");
    }

    await deleteSessionsForUser(user.id);

    const token = createRandomSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

    await createSessionForUser(user.id, tokenHash, expiresAt);
    writeSessionTokenCookie(token);

    return serializeUser(user);
  });

export const logoutUser = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE_NAME) ?? null;
  if (token) {
    await deleteSessionByTokenHash(hashSessionToken(token));
  }

  clearSessionTokenCookie();
  return { success: true };
});

export const getCurrentUserTransactions = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE_NAME) ?? null;
  if (!token) {
    throw redirect({ to: "/login" });
  }

  const session = await db.query.sessions.findFirst({
    where: (table, { eq }) => eq(table.tokenHash, hashSessionToken(token)),
  });

  if (!session) {
    throw redirect({ to: "/login" });
  }

  const user = await getUserById(session.userId);
  if (!user) {
    throw redirect({ to: "/login" });
  }

  return listTransactionsForUser(user.id);
});
