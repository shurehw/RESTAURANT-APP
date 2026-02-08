# Organization Logo Upload

## Overview

Organizations can now upload logos that will be automatically included in all branded documents, including:
- Comp Policy SOPs
- Nightly Reports
- Custom Reports
- Exported Documents

## API Endpoints

### Upload Logo File

**POST** `/api/organization/logo`

Upload a logo file to Supabase Storage.

**Request:**
```javascript
const formData = new FormData();
formData.append('file', logoFile); // File object
formData.append('org_id', 'your-org-id');

fetch('/api/organization/logo', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
  body: formData
});
```

**Response:**
```json
{
  "success": true,
  "logo_url": "https://your-supabase.storage.co/.../logo.png",
  "message": "Logo uploaded successfully"
}
```

**Requirements:**
- File types: PNG, JPEG, JPG, SVG, WebP
- Max size: 5MB
- User must be org admin

---

### Update Logo URL

**PUT** `/api/organization/logo`

Set logo URL to an externally hosted image.

**Request:**
```json
{
  "org_id": "your-org-id",
  "logo_url": "https://your-cdn.com/logo.png"
}
```

**Response:**
```json
{
  "success": true,
  "logo_url": "https://your-cdn.com/logo.png",
  "message": "Logo URL updated successfully"
}
```

---

### Remove Logo

**DELETE** `/api/organization/logo?org_id=xxx`

Remove the organization's logo.

**Response:**
```json
{
  "success": true,
  "message": "Logo removed successfully"
}
```

---

## Frontend Integration Example

```typescript
// Upload logo component
export function LogoUploader({ orgId }: { orgId: string }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('org_id', orgId);

    const response = await fetch('/api/organization/logo', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      toast.success('Logo uploaded!');
      // Refresh org data
    }

    setUploading(false);
  };

  return (
    <input
      type="file"
      accept="image/png,image/jpeg,image/svg+xml,image/webp"
      onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      disabled={uploading}
    />
  );
}
```

---

## Logo in Generated SOPs

When generating SOPs, the logo is automatically included:

```bash
# Generate SOP with logo
curl /api/comp/sop?org_id=xxx&format=html
```

**Output (HTML):**
```html
<img src="https://your-logo-url.com/logo.png" class="org-logo" alt="Org Logo">
<h1>Your Organization Name</h1>
<h2>Comp Policy - Standard Operating Procedure</h2>
...
```

**Output (Markdown):**
```markdown
![Your Organization Logo](https://your-logo-url.com/logo.png)

# Your Organization Name
## Comp Policy - Standard Operating Procedure
...
```

---

## Storage Structure

Logos are stored in Supabase Storage:

```
organization-assets/
  └── {org-id}/
      └── logo-{timestamp}.png
```

**Security:**
- Public read access (for display in documents)
- Upload/update/delete restricted to org admins
- Automatic cleanup of old logos on new upload

---

## Database Schema

```sql
-- organizations table
ALTER TABLE organizations
ADD COLUMN logo_url TEXT;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-assets', 'organization-assets', true);
```

---

## Logo Best Practices

### Recommended Specs
- **Format:** PNG with transparent background (best) or SVG
- **Dimensions:** 400x100px (4:1 ratio) or 200x200px (square)
- **File Size:** < 500KB (keep it small for fast loading)
- **Color:** Use your brand colors; ensure good contrast on white background

### Good Logo Examples
✅ Horizontal lockup (logo + text)
✅ Simple, clean design
✅ Transparent background
✅ High resolution

### Avoid
❌ Complex gradients (may not print well)
❌ Very thin lines (may not scale well)
❌ Large file sizes (slows down document generation)

---

## Testing

### Upload Test Logo

```bash
curl -X POST https://your-domain.com/api/organization/logo \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/logo.png" \
  -F "org_id=your-org-id"
```

### Generate SOP with Logo

```bash
curl https://your-domain.com/api/comp/sop?org_id=xxx&format=html > sop.html
open sop.html
```

---

## Troubleshooting

### Logo Not Appearing in SOP

**Check organization has logo:**
```sql
SELECT id, name, logo_url FROM organizations WHERE id = 'your-org-id';
```

**Verify URL is accessible:**
```bash
curl -I https://your-logo-url.com/logo.png
# Should return 200 OK
```

### Upload Fails

**Common issues:**
- File too large (> 5MB)
- Invalid file type (must be PNG, JPEG, SVG, WebP)
- User not an org admin
- Storage bucket not created

**Check storage bucket:**
```sql
SELECT * FROM storage.buckets WHERE id = 'organization-assets';
```

---

## Future Enhancements

- [ ] Image cropping/resizing in UI
- [ ] Multiple logo variants (light/dark theme)
- [ ] Favicon generation from logo
- [ ] Brand color palette extraction
- [ ] Logo preview before upload
- [ ] Bulk logo upload for multi-org customers

---

## Related Documentation

- [Comp Settings System](./COMP_SETTINGS_SYSTEM.md)
- [SOP Generation](./COMP_SETTINGS_SYSTEM.md#sop-generation)
- [Organization Management](./ORGANIZATION_MANAGEMENT.md)
