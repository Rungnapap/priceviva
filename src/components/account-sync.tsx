"use client";

/**
 * Keeps a signed-in visitor's favourites and price alerts in their account (Supabase, row-level security).
 * Guests are unaffected: their lists stay in this browser as before.
 *  - first sign-in: a guest's lists are added to the account (never another account's lists — see firstSync);
 *  - afterwards: every change is sent as a small diff; the account's answer becomes the browser copy;
 *  - logging out, or the session ending, removes the account's lists from this browser (shared computers).
 */
import { useEffect } from "react";
import { diff, firstSync, fromAccountAlert, isEmpty, toAccountAlert, type AccountAlert, type Snapshot } from "@/lib/account-sync";
import { authActions, postJson, useAuth } from "@/lib/auth-client";
import { actions, getClientState, subscribeClientState } from "@/lib/client-store";
import { toast } from "./toast";
import { useT } from "./i18n-provider";

interface AccountData {
  ok?: boolean;
  error?: string;
  saved?: string[];
  alerts?: (AccountAlert & { createdAt?: string })[];
}

const current = (): Snapshot => {
  const s = getClientState();
  return { saved: s.saved, alerts: s.alerts.map(toAccountAlert) };
};

export function AccountSync() {
  const auth = useAuth();
  const t = useT();
  const userId = auth.status === "signed_in" ? (auth.user?.id ?? null) : null;

  useEffect(() => {
    if (auth.status === "guest" || auth.status === "unconfigured") {
      // Signed out (here or elsewhere) or session ended: don't leave an account's lists in this browser.
      if (getClientState().owner) actions.clearAccountData();
    }
  }, [auth.status]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let snapshot: Snapshot | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inflight = false;
    let changedDuringRequest = false;

    const apply = (data: AccountData) => {
      const alerts = (data.alerts ?? []).map((a) => ({ ...a, emailEnabled: a.emailEnabled ?? true }));
      snapshot = { saved: data.saved ?? [], alerts: alerts.map((a) => toAccountAlert(fromAccountAlert(a))) };
      actions.setAccountData(userId, data.saved ?? [], alerts.map(fromAccountAlert));
    };

    const handleError = (status: number, code: unknown) => {
      if (status === 401) return void authActions.refresh();
      if (code === "limit") {
        toast(t("acct.sync.limit"), "error");
        if (snapshot) apply({ saved: snapshot.saved, alerts: snapshot.alerts });
        return;
      }
      authActions.setSyncError(code === "database_not_ready" ? "acct.sync.dbNotReady" : "acct.sync.offline");
      // Try again shortly; nothing in the browser is thrown away.
      timer = setTimeout(push, 15_000);
    };

    async function push() {
      if (cancelled || !snapshot) return;
      const payload = diff(snapshot, current());
      if (isEmpty(payload)) return;
      if (inflight) {
        changedDuringRequest = true;
        return;
      }
      inflight = true;
      changedDuringRequest = false;
      const r = await postJson("/api/account/sync", payload);
      inflight = false;
      if (cancelled) return;
      if (r.status === 200 && r.json.ok) {
        authActions.setSyncError(null);
        const data = r.json as AccountData;
        if (changedDuringRequest) {
          // More changes arrived meanwhile: keep them, and send them next.
          const alerts = (data.alerts ?? []).map((a) => toAccountAlert(fromAccountAlert({ ...a, emailEnabled: a.emailEnabled ?? true })));
          snapshot = { saved: data.saved ?? [], alerts };
          void push();
        } else apply(data);
      } else handleError(r.status, r.json.error);
    }

    async function start() {
      let res: Response;
      try {
        res = await fetch("/api/account/data", { credentials: "same-origin", cache: "no-store" });
      } catch {
        authActions.setSyncError("acct.sync.offline");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as AccountData;
      if (cancelled) return;
      if (!res.ok || !data.ok) return handleError(res.status, data.error);
      authActions.setSyncError(null);
      const s = getClientState();
      const server: Snapshot = { saved: data.saved ?? [], alerts: (data.alerts ?? []).map((a) => toAccountAlert(fromAccountAlert({ ...a, emailEnabled: a.emailEnabled ?? true }))) };
      const payload = firstSync(current(), s.owner, userId!, server);
      if (s.owner !== null && s.owner !== userId) actions.clearAccountData();
      if (isEmpty(payload)) return apply(data);
      const r = await postJson("/api/account/sync", payload);
      if (cancelled) return;
      if (r.status === 200 && r.json.ok) {
        apply(r.json as AccountData);
        toast(t("acct.sync.merged", { f: payload.saved_add.length, a: payload.alerts_upsert.length }), "success");
      } else {
        apply(data);
        handleError(r.status, r.json.error);
      }
    }

    const unsubscribe = subscribeClientState(() => {
      if (!snapshot) return;
      clearTimeout(timer);
      timer = setTimeout(push, 400);
    });
    void start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, t]);

  return null;
}
