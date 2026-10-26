"use client";

/**
 * Who is signed in, for the browser UI. The session itself lives in httpOnly cookies that page scripts can't read;
 * this store only asks the server (/api/auth/session) and remembers the answer for the page.
 */
import { useSyncExternalStore } from "react";

export interface SessionUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

export type AuthStatus = "loading" | "unconfigured" | "guest" | "signed_in";

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  /** Problem keeping favourites/alerts in the account (message key), e.g. the database update is missing. */
  syncError: string | null;
}

const LOADING: AuthState = { status: "loading", user: null, syncError: null };
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

export async function postJson(url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      /* empty body */
    }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: { ok: false, error: "network" } };
  }
}

async function load() {
  try {
    const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json()) as { configured?: boolean; user?: SessionUser | null };
    if (!j.configured) return set({ status: "unconfigured", user: null, syncError: null });
    set({ status: j.user ? "signed_in" : "guest", user: j.user ?? null, syncError: state.user?.id === j.user?.id ? state.syncError : null });
  } catch {
    // Offline or server problem: behave as a guest for now; nothing is deleted.
    set({ status: "guest", user: null, syncError: null });
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!started) {
    started = true;
    void load();
  }
  return () => listeners.delete(l);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

export const authActions = {
  refresh: load,
  signedIn(user: SessionUser) {
    set({ status: "signed_in", user, syncError: null });
  },
  setSyncError(code: string | null) {
    if (state.syncError !== code) set({ ...state, syncError: code });
  },
  async logout(): Promise<boolean> {
    const r = await postJson("/api/auth/logout", {});
    if (r.status !== 200) return false;
    set({ status: "guest", user: null, syncError: null });
    return true;
  },
};
