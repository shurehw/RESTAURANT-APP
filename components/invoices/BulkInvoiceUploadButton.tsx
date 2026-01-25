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
  variant?: 'default' | 'outline';
  label?: string;
}

export function BulkInvoiceUploadButton({ venues, variant = 'outline', label }: BulkInvoiceUploadButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setOpen(true)}
        className="flex-1 md:flex-none text-sm touch-manipulation"
      >
        <Upload className="w-4 h-4 mr-2" />
        {label || 'Upload Invoices'}
      </Button>
      <BulkInvoiceUploadModal venues={venues} open={open} onOpenChange={setOpen} />
    </>
  );
}
