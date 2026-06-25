'use client';
import Sheet from './primitives/Sheet';
export default function CreateSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: { type?: string; title?: string; recurring?: boolean } }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <h3>Make something</h3>
      <p className="muted">Create flow coming in M5.</p>
    </Sheet>
  );
}
