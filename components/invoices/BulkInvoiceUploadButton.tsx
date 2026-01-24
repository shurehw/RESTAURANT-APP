'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BulkInvoiceUploadModal } from './BulkInvoiceUploadModal';
import { Upload } from 'lucide-react';

interface Venue {
  id: string;
  name: string;
}

interface BulkInvoiceUploadButtonProps {
  venues: Venue[];
}

export function BulkInvoiceUploadButton({ venues }: BulkInvoiceUploadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="flex-1 md:flex-none text-sm touch-manipulation"
      >
        <Upload className="w-4 h-4 mr-2" />
        Bulk Upload
      </Button>
      <BulkInvoiceUploadModal venues={venues} open={open} onOpenChange={setOpen} />
    </>
  );
}
