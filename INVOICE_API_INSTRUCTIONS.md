# Invoice Upload API - External Access

This document provides the API key and instructions for external parties to upload invoices to the system.

## API Endpoint

**Production URL:** `https://opsos.vercel.app/api/invoices/bulk-upload`

**Local Development:** `http://localhost:3000/api/invoices/bulk-upload`

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

1. **files** (one or more file uploads)
   - Supported formats: JPEG, PNG, WebP, PDF
   - Max file size: 10MB per file
   - Field name: `files` (can send multiple files)

2. **organization_id** (form field)
   - Value: `13dacb8a-d2b5-42b8-bcc3-50bc372c0a41`

### Example with cURL

```bash
curl -X POST https://opsos.vercel.app/api/invoices/bulk-upload \
  -H "x-api-key: /xBMnwoWA3hXZMgTun+z+FUlMxWxD1I8Tm4Z67wEi2w=" \
  -F "files=@/path/to/invoice1.pdf" \
  -F "files=@/path/to/invoice2.pdf" \
  -F "organization_id=13dacb8a-d2b5-42b8-bcc3-50bc372c0a41"
```

### Example with Python

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

### Example with JavaScript/Node.js

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
    },
    {
      "fileName": "invoice2.pdf",
      "index": 1,
      "success": true,
      "invoiceId": "uuid-here-2",
      "invoiceNumber": "INV-12346",
      "vendorName": "US Foods",
      "venueName": "Nice Guy",
      "totalAmount": 2345.67,
      "warnings": ["Could not determine venue from invoice. Using default venue."],
      "storagePath": "raw/1234567890-invoice2.pdf"
    }
  ],
  "message": "Processed 2 files: 2 succeeded, 0 failed"
}
```

### Error Response

```json
{
  "success": false,
  "processed": 2,
  "successCount": 1,
  "failureCount": 1,
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
    },
    {
      "fileName": "invoice2.pdf",
      "index": 1,
      "success": false,
      "error": "File size exceeds 10MB limit (12.3MB)"
    }
  ],
  "message": "Processed 2 files: 1 succeeded, 1 failed"
}
```

## Features

1. **Automatic OCR Processing**: The system uses Claude AI to extract invoice data from images and PDFs
2. **Venue Resolution**: The system automatically determines which venue the invoice belongs to based on delivery location
3. **Vendor Management**: Vendors are automatically created if they don't exist
4. **Item Matching**: The system attempts to match invoice line items to existing inventory items
5. **Multi-file Upload**: You can upload multiple invoices in a single request

## Important Notes

1. **Rate Limiting**: The endpoint is rate-limited to prevent abuse
2. **File Validation**: Files are validated for type and size before processing
3. **Venue Assignment**: If the venue cannot be determined from the invoice and multiple venues exist, the invoice will fail and require manual venue assignment
4. **Vendor Creation**: Unknown vendors will be automatically created with a placeholder name that can be updated later
5. **Review Required**: Invoices with unmatched items will be flagged for review

## Support

For questions or issues, contact the development team.

## Security

- **Keep the API key secure** - do not commit it to version control
- **Use HTTPS** in production
- The API key should only be shared with trusted external parties
- Consider rotating the API key periodically for security
