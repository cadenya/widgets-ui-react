"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CadenyaWidgets } from "@cadenya/widgets";
import { createAuthFetch } from "./auth-fetch";

const WidgetClientContext = createContext<CadenyaWidgets | null>(null);

export interface CadenyaWidgetProviderProps {
  /**
   * Widget hostname from the session-create response (info.host) — the
   * authoritative value; never construct it.
   */
  host: string;
  /** Session bearer token minted by your backend (spec.token). */
  token: string;
  /**
   * Re-mint callback: called once when a request 401s (token expired,
   * ~15 min TTL) and retried automatically. Should POST to your backend's
   * session endpoint and return the fresh token — re-minting for the same
   * widget/subject returns the existing active session, so conversations
   * survive. Without it, expiry surfaces as errors until remount.
   */
  getToken?: () => Promise<string>;
  children: ReactNode;
}

/**
 * Provides a widget client to the component tree. The auth layer owns the
 * Authorization header, so token rotation (prop updates or getToken
 * re-mints) never recreates the client — open streams and mounted hooks
 * survive a refresh.
 */
export function CadenyaWidgetProvider({ host, token, getToken, children }: CadenyaWidgetProviderProps) {
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });
  // The first token, captured once — later rotations flow through setToken.
  const [initialToken] = useState(token);
  const hasGetToken = getToken != null;

  const auth = useMemo(
    () =>
      createAuthFetch({
        token: initialToken,
        getToken: hasGetToken ? () => getTokenRef.current!() : undefined,
      }),
    [initialToken, hasGetToken],
  );

  // Keep the wrapper's token in sync when the embedder re-mints externally.
  useEffect(() => {
    auth.setToken(token);
  }, [auth, token]);

  const client = useMemo(
    () =>
      new CadenyaWidgets({
        apiKey: initialToken,
        baseURL: `https://${host}`,
        // The auth wrapper overwrites the Authorization header on every
        // request (and is a bound fetch, which the generated SDK needs).
        fetch: auth.fetch,
      }),
    [host, auth, initialToken],
  );

  return <WidgetClientContext.Provider value={client}>{children}</WidgetClientContext.Provider>;
}

export function useWidgetClient(): CadenyaWidgets {
  const client = useContext(WidgetClientContext);
  if (!client) {
    throw new Error("Cadenya widgets: wrap this component in <CadenyaWidgetProvider>.");
  }
  return client;
}
