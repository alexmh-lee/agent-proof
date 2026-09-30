"use client";

import { useActionState } from "react";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type CreateApiKeyState,
} from "./actions";

type ApiKeySummary = {
  id: string;
  label: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const initialState: CreateApiKeyState = {};

export function ApiKeyPanel({ keys }: { keys: ApiKeySummary[] }) {
  const [state, createAction, pending] = useActionState(
    createApiKeyAction,
    initialState,
  );

  return (
    <section className="mt-10 rounded-2xl border border-ink bg-paper-bright p-6">
      <h2 className="text-xl font-semibold">API keys</h2>
      <p className="mt-2 text-muted">
        Use an API key as a bearer token to register agents. The full key is
        shown once.
      </p>

      {state.rawKey && (
        <div className="mt-4 rounded-xl border border-orange bg-paper p-4">
          <p className="font-semibold">Copy this key now</p>
          <p className="mt-1 text-sm text-muted">
            It cannot be displayed again after you leave this page.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-ink p-3 text-sm text-paper">
            {state.rawKey}
          </code>
        </div>
      )}
      {state.error && (
        <p className="mt-4 rounded-xl border border-orange p-3">{state.error}</p>
      )}

      <form action={createAction} className="mt-5 flex gap-2">
        <input
          name="label"
          required
          maxLength={60}
          placeholder="Local development"
          aria-label="API key label"
          className="h-10 flex-1 rounded-xl border border-ink bg-paper px-3"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl border border-ink bg-lime px-4 font-semibold disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>

      <ul className="mt-6 space-y-3">
        {keys.length === 0 && (
          <li className="text-muted">No API keys created yet.</li>
        )}
        {keys.map((key) => (
          <li
            key={key.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/20 p-3"
          >
            <div>
              <p className="font-semibold">
                {key.label} ·••••{key.lastFour}
              </p>
              <p className="text-sm text-muted">
                Created {key.createdAt.slice(0, 10)}
                {key.lastUsedAt
                  ? ` · Last used ${key.lastUsedAt.slice(0, 10)}`
                  : " · Never used"}
                {key.revokedAt ? " · Revoked" : ""}
              </p>
            </div>
            {!key.revokedAt && (
              <form action={revokeApiKeyAction}>
                <input type="hidden" name="keyId" value={key.id} />
                <button type="submit" className="text-sm underline">
                  Revoke
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
