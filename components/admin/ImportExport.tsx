'use client';

export function ImportExport({ settings, onImport }: any) {
  const handleExport = () => {
    const data = JSON.stringify(settings, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comp-settings-v${settings.version}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (confirm('Import these settings? This will create a new version.')) {
          onImport(imported);
        }
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">Import / Export Settings</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border rounded">
          <h4 className="font-medium mb-2">Export Settings</h4>
          <p className="text-sm text-gray-600 mb-3">
            Download current settings as JSON
          </p>
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Export JSON
          </button>
        </div>

        <div className="p-4 border rounded">
          <h4 className="font-medium mb-2">Import Settings</h4>
          <p className="text-sm text-gray-600 mb-3">
            Upload a settings JSON file
          </p>
          <input
            type="file"
            accept=".json"
            onChange={handleImport}
            className="text-sm"
          />
        </div>
      </div>
    </div>
  );
}
