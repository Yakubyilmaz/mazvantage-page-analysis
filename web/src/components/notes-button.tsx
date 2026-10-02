'use client';

/* ==========================================================================
   Notes on a company — the button in the report head and the dialog behind it

   Dated entries, newest first, each editable and deletable. Stored in this
   browser only (`lib/notes.ts`); the dialog says so, because a reader who
   assumes a note followed them to another device would lose it.
   ========================================================================== */

import * as React from 'react';
import { NotebookPen, Pencil, Trash2 } from 'lucide-react';
import { addNote, deleteNote, editNote, useNotes, type Note } from '@/lib/notes';
import { useMounted } from '@/lib/local-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      + ` · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : '';
};

const area = 'min-h-24 w-full resize-y rounded-md border border-border bg-muted px-3 py-2 text-13 leading-relaxed text-foreground '
  + 'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring';

function NoteItem({ symbol, note }: { symbol: string; note: Note }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(note.text);
  React.useEffect(() => setText(note.text), [note.text]);
  return (
    <li className="grid gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-micro text-muted-foreground">
        <span>{stamp(note.created)}</span>
        {note.updated !== note.created ? <span>· edited {stamp(note.updated)}</span> : null}
        <span className="ml-auto flex gap-1">
          <button type="button" aria-label="Edit this note" onClick={() => setEditing((v) => !v)} className="rounded p-1 hover:bg-accent hover:text-foreground">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" aria-label="Delete this note" onClick={() => deleteNote(symbol, note.id)} className="rounded p-1 hover:bg-accent hover:text-down">
            <Trash2 className="size-3.5" />
          </button>
        </span>
      </div>
      {editing ? (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); editNote(symbol, note.id, text); setEditing(false); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit note" className={area} maxLength={5000} />
          <div className="flex gap-2">
            <Button type="submit" size="xs" variant="default">Save</Button>
            <Button size="xs" variant="ghost" onClick={() => { setText(note.text); setEditing(false); }}>Cancel</Button>
          </div>
        </form>
      ) : <p className="whitespace-pre-wrap text-13 leading-relaxed">{note.text}</p>}
    </li>
  );
}

export function NotesButton({ symbol, name, className }: { symbol: string; name?: string | null; className?: string }) {
  const mounted = useMounted();
  const notes = useNotes(symbol);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const count = mounted ? notes.length : 0;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={count ? `${count} private ${count === 1 ? 'note' : 'notes'} on ${symbol}` : `Write a private note on ${symbol}`}
        className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-tiny font-semibold text-muted-foreground hover:bg-accent hover:text-foreground no-print', className)}>
        <NotebookPen className="size-[15px]" strokeWidth={1.8} />
        Notes
        {count ? <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary tnum">{count}</span> : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Notes on {name ? `${name} (${symbol})` : symbol}</DialogTitle>
            <DialogDescription>Private to this browser — nothing is sent anywhere, and a note does not follow you to another device.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); addNote(symbol, draft); setDraft(''); }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Why you are watching ${symbol}, what would change your mind…`}
              aria-label="New note" className={area} maxLength={5000}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(symbol, draft); setDraft(''); } }} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro text-muted-foreground">Ctrl + Enter to add</span>
              <Button type="submit" size="sm" variant="default" disabled={!draft.trim()}>Add note</Button>
            </div>
          </form>
          {notes.length ? (
            <ul className="grid border-t border-border">{notes.map((n) => <NoteItem key={n.id} symbol={symbol} note={n} />)}</ul>
          ) : <p className="border-t border-border pt-3 text-13 text-muted-foreground">No notes on {symbol} yet.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
