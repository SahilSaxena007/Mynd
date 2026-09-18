"use client";

import { useSyncExternalStore } from "react";

// The capture draft survives reloads: React state dies on refresh, tab discard,
// and dev-server restarts, and a half-dictated thought must not die with it.
// Modelled on ./token.ts so both client stores behave the same way.
const key = "vault-capture-draft";
const event = "vault-draft-change";

// Fallback when site storage is blocked (private windows): the draft still works
// for the life of the page, it just does not survive a reload.
let memory = "";

export function getDraft(): string {
  try {
    return window.localStorage.getItem(key) ?? memory;
  } catch {
    return memory;
  }
}

export function setDraft(text: string): void {
  memory = text;
  try {
    window.localStorage.setItem(key, text);
  } catch {
    // Storage is unavailable; the in-memory copy above still drives the textarea.
  }
  window.dispatchEvent(new Event(event));
}

export function clearDraft(): void {
  memory = "";
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
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

export function useDraft() {
  return useSyncExternalStore(subscribe, getDraft, () => "");
}
