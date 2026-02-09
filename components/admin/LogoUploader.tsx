'use client';

import { useState } from 'react';

export function LogoUploader({ orgId, currentLogoUrl, onUploadComplete }: any) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('org_id', orgId);

    try {
      const res = await fetch('/api/organization/logo', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        alert('Logo uploaded!');
        onUploadComplete();
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {currentLogoUrl && (
        <img src={currentLogoUrl} alt="Logo" className="max-w-xs" />
      )}
      <input
        type="file"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
        className="block"
      />
    </div>
  );
}
