import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { db } from "../db";
import { deleteSessionByTokenHash, findSessionByTokenHash, getUserById } from "../server/data-access";

export const SESSION_COOKIE_NAME = "__Host-paisaflow_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function createRandomSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function readSessionTokenFromCurrentRequest() {
  return getCookie(SESSION_COOKIE_NAME) ?? null;
}

export function writeSessionTokenCookie(token: string) {
  setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionTokenCookie() {
  deleteCookie(SESSION_COOKIE_NAME, {
    path: "/",
    secure: true,
    sameSite: "lax",
  });
}

export async function getCurrentAuthenticatedUserFromRequest() {
  const token = readSessionTokenFromCurrentRequest();
  if (!token) return null;

  const sessionHash = hashSessionToken(token);
  const session = await findSessionByTokenHash(sessionHash);
  if (!session) return null;

  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await deleteSessionByTokenHash(sessionHash);
    return null;
  }

  return getUserById(session.userId);
}

export function getPublicUser(user: Awaited<ReturnType<typeof getUserById>>) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function destroySessionForCurrentRequest() {
  const token = readSessionTokenFromCurrentRequest();
  if (!token) return;

  await deleteSessionByTokenHash(hashSessionToken(token));
  clearSessionTokenCookie();
}

export async function requireAuthentication() {
  const user = await getCurrentAuthenticatedUserFromRequest();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function getCurrentAuthenticatedUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });
}
