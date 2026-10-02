/* ==========================================================================
   Maz Vantage — a reader's private notes on a company

   Dated, per symbol, kept in this browser and nowhere else: there are no
   accounts, so a note is exactly as private as the machine it was written on,
   and the dialog says so. Several notes per company rather than one text box,
   because a thesis is revisited — "bought on the Q2 miss", then "trimmed after
   the guidance cut" — and each entry keeps the day it was written.
   ========================================================================== */

import * as React from 'react';
import { newId, readJson, useStoredJson, writeJson } from './local-store';
import { cleanSymbol } from './watchlists';

export const NOTES_KEY = 'mazvantage.notes';

export interface Note { id: string; text: string; created: string; updated: string }
type NoteStore = Record<string, Note[]>;

const MAX_LENGTH = 5000;

function parse(raw: unknown): NoteStore {
  if (!raw || typeof raw !== 'object') return {};
  const out: NoteStore = {};
  for (const [sym, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const notes = list
      .filter((n: any) => n && typeof n.text === 'string' && n.text.trim())
      .map((n: any) => ({
        id: typeof n.id === 'string' ? n.id : newId('note'),
        text: String(n.text).slice(0, MAX_LENGTH),
        created: typeof n.created === 'string' ? n.created : new Date(0).toISOString(),
        updated: typeof n.updated === 'string' ? n.updated : n.created || new Date(0).toISOString(),
      }));
    if (notes.length) out[cleanSymbol(sym)] = notes;
  }
  return out;
}

const read = () => parse(readJson<unknown>(NOTES_KEY, null));

export function addNote(symbol: string, text: string) {
  const t = text.trim().slice(0, MAX_LENGTH);
  if (!t) return;
  const sym = cleanSymbol(symbol);
  const now = new Date().toISOString();
  const all = read();
  all[sym] = [...(all[sym] || []), { id: newId('note'), text: t, created: now, updated: now }];
  writeJson(NOTES_KEY, all);
}

export function editNote(symbol: string, id: string, text: string) {
  const t = text.trim().slice(0, MAX_LENGTH);
  const sym = cleanSymbol(symbol);
  const all = read();
  if (!t) { deleteNote(sym, id); return; }
  all[sym] = (all[sym] || []).map((n) => (n.id === id ? { ...n, text: t, updated: new Date().toISOString() } : n));
  writeJson(NOTES_KEY, all);
}

export function deleteNote(symbol: string, id: string) {
  const sym = cleanSymbol(symbol);
  const all = read();
  const left = (all[sym] || []).filter((n) => n.id !== id);
  if (left.length) all[sym] = left; else delete all[sym];
  writeJson(NOTES_KEY, all);
}

/** Every note, by symbol, following every write. */
export function useAllNotes(): NoteStore {
  const raw = useStoredJson<unknown>(NOTES_KEY, null);
  return React.useMemo(() => parse(raw), [raw]);
}

/** One company's notes, newest first. */
export function useNotes(symbol: string): Note[] {
  const all = useAllNotes();
  const sym = cleanSymbol(symbol);
  return React.useMemo(() => [...(all[sym] || [])].sort((a, b) => b.created.localeCompare(a.created)), [all, sym]);
}
