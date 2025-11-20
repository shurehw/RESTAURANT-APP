"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, User, MapPin, CreditCard, Upload, Check } from "lucide-react";
import { useRouter } from "next/navigation";

interface VendorProfileFormProps {
  vendor: any;
  profile?: any;
}

export function VendorProfileForm({ vendor, profile }: VendorProfileFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [entityType, setEntityType] = useState(profile?.entity_type || 'company');
  const [legalName, setLegalName] = useState(profile?.legal_name || '');
  const [companyName, setCompanyName] = useState(profile?.company_name || vendor.name);

  // Address
  const [addressLine1, setAddressLine1] = useState(profile?.address_line1 || '');
  const [addressLine2, setAddressLine2] = useState(profile?.address_line2 || '');
  const [city, setCity] = useState(profile?.city || '');
  const [state, setState] = useState(profile?.state || '');
  const [zipCode, setZipCode] = useState(profile?.zip_code || '');

  // Contact
  const [contactFirstName, setContactFirstName] = useState(profile?.contact_person_first_name || '');
  const [contactLastName, setContactLastName] = useState(profile?.contact_person_last_name || '');
  const [remittanceEmail, setRemittanceEmail] = useState(profile?.remittance_email || vendor.email || '');

  // Banking
  const [bankName, setBankName] = useState(profile?.bank_name || '');
  const [bankAddressLine1, setBankAddressLine1] = useState(profile?.bank_address_line1 || '');
  const [bankAddressLine2, setBankAddressLine2] = useState(profile?.bank_address_line2 || '');
  const [bankCity, setBankCity] = useState(profile?.bank_city || '');
  const [bankState, setBankState] = useState(profile?.bank_state || '');
  const [bankZipCode, setBankZipCode] = useState(profile?.bank_zip_code || '');
  const [nameOnAccount, setNameOnAccount] = useState(profile?.name_on_account || '');
  const [routingNumber, setRoutingNumber] = useState(profile?.bank_routing_number || '');
  const [accountType, setAccountType] = useState(profile?.account_type || 'checking');
  const [accountNumberLast4, setAccountNumberLast4] = useState(profile?.account_number_last4 || '');

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/vendors/${vendor.id}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          legalName,
          companyName,
          addressLine1,
          addressLine2,
          city,
          state,
          zipCode,
          contactFirstName,
          contactLastName,
          remittanceEmail,
          bankName,
          bankAddressLine1,
          bankAddressLine2,
          bankCity,
          bankState,
          bankZipCode,
          nameOnAccount,
          routingNumber,
          accountType,
          accountNumberLast4,
        }),
      });

      if (response.ok) {
        router.refresh();
        alert('Profile saved successfully');
      } else {
        alert('Failed to save profile');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Error saving profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Vendor/Payee Type */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold">Vendor/Payee Type</h3>
            <p className="text-sm text-muted-foreground">Select entity type</p>
          </div>
        </div>

        <RadioGroup value={entityType} onValueChange={setEntityType}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="individual" id="individual" />
            <Label htmlFor="individual">Individual</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="company" id="company" />
            <Label htmlFor="company">Company</Label>
          </div>
        </RadioGroup>
      </Card>

      {/* Vendor/Payee Information */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
            <User className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold">Vendor/Payee Information</h3>
            <p className="text-sm text-muted-foreground">Business and contact details</p>
          </div>
        </div>

        <div className="space-y-4">
          {entityType === 'individual' && (
            <div>
              <Label htmlFor="legalName">Legal Name *</Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name"
              />
            </div>
          )}

          {entityType === 'company' && (
            <div>
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Registered company name"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="addressLine1">Address Line 1 *</Label>
              <Input
                id="addressLine1"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Street address"
              />
            </div>
            <div>
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input
                id="addressLine2"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Suite, unit, etc."
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="state">State *</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CA"
                maxLength={2}
              />
            </div>
            <div>
              <Label htmlFor="zipCode">ZIP Code *</Label>
              <Input
                id="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contactFirstName">Contact Person First Name *</Label>
              <Input
                id="contactFirstName"
                value={contactFirstName}
                onChange={(e) => setContactFirstName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contactLastName">Contact Person Last Name *</Label>
              <Input
                id="contactLastName"
                value={contactLastName}
                onChange={(e) => setContactLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="remittanceEmail">Remittance Email *</Label>
            <Input
              id="remittanceEmail"
              type="email"
              value={remittanceEmail}
              onChange={(e) => setRemittanceEmail(e.target.value)}
              placeholder="payments@vendor.com"
            />
          </div>
        </div>
      </Card>

      {/* Financial Institution Information */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold">Financial Institution Information</h3>
            <p className="text-sm text-muted-foreground">Banking details for ACH payments</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="bankName">Bank Name *</Label>
            <Input
              id="bankName"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. Chase Bank"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bankAddressLine1">Bank Address Line 1</Label>
              <Input
                id="bankAddressLine1"
                value={bankAddressLine1}
                onChange={(e) => setBankAddressLine1(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bankAddressLine2">Bank Address Line 2</Label>
              <Input
                id="bankAddressLine2"
                value={bankAddressLine2}
                onChange={(e) => setBankAddressLine2(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="bankCity">City</Label>
              <Input
                id="bankCity"
                value={bankCity}
                onChange={(e) => setBankCity(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bankState">State</Label>
              <Input
                id="bankState"
                value={bankState}
                onChange={(e) => setBankState(e.target.value)}
                maxLength={2}
              />
            </div>
            <div>
              <Label htmlFor="bankZipCode">ZIP Code</Label>
              <Input
                id="bankZipCode"
                value={bankZipCode}
                onChange={(e) => setBankZipCode(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="nameOnAccount">Name on Bank Account *</Label>
            <Input
              id="nameOnAccount"
              value={nameOnAccount}
              onChange={(e) => setNameOnAccount(e.target.value)}
              placeholder="As it appears on the account"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="routingNumber">Bank Routing/Transit Number *</Label>
              <Input
                id="routingNumber"
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value)}
                placeholder="9 digits"
                maxLength={9}
              />
            </div>
            <div>
              <Label htmlFor="accountType">Account Type *</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="accountNumberLast4">Account Number (Last 4 Digits) *</Label>
            <Input
              id="accountNumberLast4"
              value={accountNumberLast4}
              onChange={(e) => setAccountNumberLast4(e.target.value)}
              placeholder="XXXX"
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              For security, we only store the last 4 digits
            </p>
          </div>
        </div>
      </Card>

      {/* Document Uploads */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold">Required Documents</h3>
            <p className="text-sm text-muted-foreground">Upload voided check and W9 form</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Voided Check or Bank Letter *</Label>
            <div className="mt-2 border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-brass/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, PNG, or JPG (max 10MB)</p>
            </div>
          </div>

          <div>
            <Label>W9 Form *</Label>
            <div className="mt-2 border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-brass/50 transition-colors cursor-pointer">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">PDF (max 10MB)</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          variant="brass"
          onClick={handleSave}
          disabled={isSaving}
        >
          <Check className="w-4 h-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}
