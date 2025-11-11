'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InvoiceUploadModal } from './InvoiceUploadModal';

interface Venue {
  id: string;
  name: string;
}

interface InvoiceUploadButtonProps {
  venues: Venue[];
}

export function InvoiceUploadButton({ venues }: InvoiceUploadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Upload Invoice
      </Button>
      <InvoiceUploadModal venues={venues} open={open} onOpenChange={setOpen} />
    </>
  );
}
