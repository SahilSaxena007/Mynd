"use client";

import { useSyncExternalStore } from "react";

const key = "SECRET_TOKEN";
const event = "vault-token-change";
let invalidated = false;

export function getToken(): string | null {
  try {
    return invalidated ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setToken(token: string): boolean {
  try {
    window.localStorage.setItem(key, token);
    invalidated = false;
    window.dispatchEvent(new Event(event));
    return true;
  } catch {
    return false;
  }
}

export function clearToken(): void {
  invalidated = true;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The gate still locks if storage becomes unavailable.
  }
  window.dispatchEvent(new Event(event));
}

function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(event, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useToken() {
  return useSyncExternalStore(subscribe, getToken, () => null);
}
