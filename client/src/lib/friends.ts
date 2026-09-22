import { create } from 'zustand';
import { api } from './api';
import type { FriendsList } from './types';

// Freundesliste mit offenen Anfragen. Wird beim Verbinden geladen und neu geholt, sobald der
// Server "friends:changed" meldet (Anfrage, Annahme, jemand kommt online oder geht).

interface FriendsState extends FriendsList {
  loaded: boolean;
}

const empty: FriendsState = { loaded: false, friends: [], incoming: [], outgoing: [] };

export const useFriends = create<FriendsState>(() => ({ ...empty }));

let inflight: Promise<void> | null = null;
let again = false;

export function loadFriends(): Promise<void> {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = api
    .friends()
    .then((list) => useFriends.setState({ ...list, loaded: true }))
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
      if (again) {
        again = false;
        void loadFriends();
      }
    });
  return inflight;
}

let soon: number | undefined;
/** Mehrere Meldungen kurz hintereinander ergeben nur eine Anfrage */
export function refreshFriendsSoon() {
  window.clearTimeout(soon);
  soon = window.setTimeout(() => void loadFriends(), 300);
}

export function resetFriends() {
  useFriends.setState({ ...empty });
}
