'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface PreshiftEditableSectionProps {
  title: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readonly?: boolean;
}

export function PreshiftEditableSection({
  title,
  icon,
  value,
  onChange,
  placeholder,
  readonly,
}: PreshiftEditableSectionProps) {
  return (
    <Card className="print:border-0 print:shadow-none print:p-0">
      <CardHeader className="pb-3 print:pb-1 print:px-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="print:px-0">
        {readonly ? (
          <div className="text-sm whitespace-pre-wrap min-h-[40px]">
            {value || <span className="text-muted-foreground italic">{placeholder || 'No notes'}</span>}
          </div>
        ) : (
          <>
            {/* Screen: editable textarea */}
            <Textarea
              className="min-h-[100px] print:hidden"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
            />
            {/* Print: plain text */}
            <div className="hidden print:block text-sm whitespace-pre-wrap">
              {value || <span className="text-muted-foreground italic">{placeholder || 'No notes'}</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
