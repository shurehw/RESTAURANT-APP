"use client";

import { useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value?: string;
  onChange: (signature: string) => void;
  className?: string;
}

export function SignaturePad({ value, onChange, className }: SignaturePadProps) {
  const sigPadRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (value && sigPadRef.current) {
      sigPadRef.current.fromDataURL(value);
    }
  }, [value]);

  const handleEnd = () => {
    if (sigPadRef.current) {
      const dataURL = sigPadRef.current.toDataURL();
      onChange(dataURL);
    }
  };

  const handleClear = () => {
    if (sigPadRef.current) {
      sigPadRef.current.clear();
      onChange("");
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-md bg-white">
        <SignatureCanvas
          ref={sigPadRef}
          onEnd={handleEnd}
          canvasProps={{
            className: "w-full h-40 cursor-crosshair",
          }}
          backgroundColor="rgb(255, 255, 255)"
          penColor="rgb(0, 0, 0)"
        />
      </div>
      <div className="flex justify-between items-center mt-2">
        <p className="text-xs text-muted-foreground">Sign above using your mouse or touchscreen</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
        >
          <X className="w-3 h-3 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
