'use client';
import { useState } from 'react';
import Icon from './primitives/Icon';
import CreateSheet from './CreateSheet';
export default function CreateButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <span className="create">
          <Icon name="create" />
        </span>
      </button>
      <CreateSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
