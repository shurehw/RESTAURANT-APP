'use client';

import { useState } from 'react';

export function SOPPreview({ orgId, orgName }: any) {
  const [showPreview, setShowPreview] = useState(false);

  const handleDownload = async (format: string) => {
    window.open(`/api/comp/sop?org_id=${orgId}&format=${format}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg">Generate SOP Document</h3>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          {showPreview ? 'Hide Preview' : 'Show Preview'}
        </button>
      </div>

      <p className="text-gray-600">
        Download your organization's comp policy as a formatted document.
      </p>

      {/* Download Buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => handleDownload('html')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          📄 Download HTML
        </button>
        <button
          onClick={() => handleDownload('markdown')}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          📝 Download Markdown
        </button>
        <button
          onClick={() => handleDownload('json')}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          📊 Download JSON
        </button>
      </div>

      {/* Live Preview */}
      {showPreview && (
        <div className="mt-6">
          <h4 className="font-medium mb-2">Live Preview</h4>
          <div className="border-2 rounded-lg overflow-hidden">
            <iframe
              src={`/api/comp/sop?org_id=${orgId}&format=html`}
              className="w-full h-[600px]"
              title="SOP Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
