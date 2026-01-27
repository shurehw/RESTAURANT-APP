# Invoice Upload API - External Access

This document provides the API key and instructions for external parties to upload invoices to the system.

## API Endpoint

**Production URL:** `https://opsos.vercel.app/api/invoices/bulk-upload`

## Authentication

**API Key:** `/xBMnwoWA3hXZMgTun+z+FUlMxWxD1I8Tm4Z67wEi2w=`

Include this key in the request header:
```
x-api-key: /xBMnwoWA3hXZMgTun+z+FUlMxWxD1I8Tm4Z67wEi2w=
```

## Organization ID

**The h.wood Group:** `13dacb8a-d2b5-42b8-bcc3-50bc372c0a41`

## API Usage

### Request Format

**Method:** `POST`  
**Content-Type:** `multipart/form-data`

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `files` | File(s) | One or more invoice files (PDF, JPEG, PNG, WebP) |
| `organization_id` | String | `13dacb8a-d2b5-42b8-bcc3-50bc372c0a41` |

### File Requirements

- **Supported formats:** PDF, JPEG, PNG, WebP
- **Max file size:** 50MB per file (larger files will timeout during processing)
- **Multiple files:** Yes, send as many as needed in one request
- **Tip:** Split large PDFs into smaller chunks for best results

---

## Examples

### cURL

```bash
curl -X POST https://opsos.vercel.app/api/invoices/bulk-upload \
  -H "x-api-key: /xBMnwoWA3hXZMgTun+z+FUlMxWxD1I8Tm4Z67wEi2w=" \
  -F "files=@/path/to/invoice1.pdf" \
  -F "files=@/path/to/invoice2.pdf" \
  -F "organization_id=13dacb8a-d2b5-42b8-bcc3-50bc372c0a41"
```

### Python

```python
import requests

url = "https://opsos.vercel.app/api/invoices/bulk-upload"
headers = {
    "x-api-key": "/xBMnwoWA3hXZMgTun+z+FUlMxWxD1I8Tm4Z67wEi2w="
}

files = [
    ('files', open('invoice1.pdf', 'rb')),
    ('files', open('invoice2.pdf', 'rb')),
]

data = {
    'organization_id': '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'
}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())
```

### JavaScript/Node.js

```javascript
const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function uploadInvoices() {
  const form = new FormData();
  
  // Add files
  form.append('files', fs.createReadStream('invoice1.pdf'));
  form.append('files', fs.createReadStream('invoice2.pdf'));
  
  // Add organization ID
  form.append('organization_id', '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41');
  
  const response = await fetch('https://opsos.vercel.app/api/invoices/bulk-upload', {
    method: 'POST',
    headers: {
      'x-api-key': '/xBMnwoWA3hXZMgTun+z+FUlMxWxD1I8Tm4Z67wEi2w=',
    },
    body: form
  });
  
  const result = await response.json();
  console.log(result);
}

uploadInvoices();
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "processed": 2,
  "successCount": 2,
  "failureCount": 0,
  "results": [
    {
      "fileName": "invoice1.pdf",
      "index": 0,
      "success": true,
      "invoiceId": "uuid-here",
      "invoiceNumber": "INV-12345",
      "vendorName": "Sysco",
      "venueName": "Delilah West Hollywood",
      "totalAmount": 1234.56,
      "warnings": [],
      "storagePath": "raw/1234567890-invoice1.pdf"
    }
  ],
  "message": "Processed 2 files: 2 succeeded, 0 failed"
}
```

### Partial Success Response

```json
{
  "success": true,
  "processed": 2,
  "successCount": 1,
  "failureCount": 1,
  "results": [
    {
      "fileName": "invoice1.pdf",
      "success": true,
      "invoiceId": "uuid-here",
      "invoiceNumber": "INV-12345"
    },
    {
      "fileName": "invoice2.pdf",
      "success": false,
      "error": "OCR failed to extract invoice data"
    }
  ],
  "message": "Processed 2 files: 1 succeeded, 1 failed"
}
```

---

## Features

| Feature | Description |
|---------|-------------|
| **OCR Processing** | Claude AI extracts invoice data from images and PDFs |
| **Venue Detection** | Automatically determines venue from delivery location |
| **Vendor Management** | Creates new vendors if they don't exist |
| **Item Matching** | Matches line items to existing inventory catalog |
| **Multi-file Upload** | Process multiple invoices in a single request |
| **Large File Support** | Files up to 150MB supported |

---

## Important Notes

1. **Rate Limiting**: The endpoint is rate-limited to prevent abuse
2. **Processing Time**: Large files may take up to 5 minutes to process
3. **Venue Assignment**: If venue cannot be determined and multiple venues exist, the invoice will fail
4. **Vendor Creation**: Unknown vendors are automatically created
5. **Review Required**: Invoices with unmatched items are flagged for review

---

## Security

- Keep the API key secure - do not commit to version control
- Use HTTPS only
- Share only with trusted external parties
- Consider rotating the API key periodically
