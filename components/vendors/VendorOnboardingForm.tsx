"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, User, MapPin, CreditCard, Upload, Check, FileText } from "lucide-react";
import { useRouter } from "next/navigation";

interface VendorOnboardingFormProps {
  vendor: any;
  token: string;
}

export function VendorOnboardingForm({ vendor, token }: VendorOnboardingFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Type
  const [formType, setFormType] = useState<'new' | 'change' | 'cancel'>('new');

  // Form state
  const [entityType, setEntityType] = useState<'individual' | 'company'>('company');
  const [legalName, setLegalName] = useState('');
  const [companyName, setCompanyName] = useState(vendor.name);

  // Address
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');

  // Contact
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [remittanceEmail, setRemittanceEmail] = useState(vendor.email || '');

  // Banking
  const [bankName, setBankName] = useState('');
  const [bankAddressLine1, setBankAddressLine1] = useState('');
  const [bankAddressLine2, setBankAddressLine2] = useState('');
  const [bankCity, setBankCity] = useState('');
  const [bankState, setBankState] = useState('');
  const [bankZipCode, setBankZipCode] = useState('');
  const [nameOnAccount, setNameOnAccount] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [accountNumberLast4, setAccountNumberLast4] = useState('');

  // Documents
  const [voidedCheckFile, setVoidedCheckFile] = useState<File | null>(null);
  const [w9File, setW9File] = useState<File | null>(null);

  // Authorization
  const [signatureName, setSignatureName] = useState('');
  const [signatureDate, setSignatureDate] = useState(new Date().toISOString().split('T')[0]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreedToTerms) {
      alert('Please agree to the terms and authorization');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create FormData for file uploads
      const formData = new FormData();
      formData.append('token', token);
      formData.append('formType', formType);
      formData.append('entityType', entityType);
      formData.append('legalName', legalName);
      formData.append('companyName', companyName);
      formData.append('addressLine1', addressLine1);
      formData.append('addressLine2', addressLine2);
      formData.append('city', city);
      formData.append('state', state);
      formData.append('zipCode', zipCode);
      formData.append('contactFirstName', contactFirstName);
      formData.append('contactLastName', contactLastName);
      formData.append('remittanceEmail', remittanceEmail);
      formData.append('bankName', bankName);
      formData.append('bankAddressLine1', bankAddressLine1);
      formData.append('bankAddressLine2', bankAddressLine2);
      formData.append('bankCity', bankCity);
      formData.append('bankState', bankState);
      formData.append('bankZipCode', bankZipCode);
      formData.append('nameOnAccount', nameOnAccount);
      formData.append('routingNumber', routingNumber);
      formData.append('accountType', accountType);
      formData.append('accountNumberLast4', accountNumberLast4);
      formData.append('signatureName', signatureName);
      formData.append('signatureDate', signatureDate);

      if (voidedCheckFile) {
        formData.append('voidedCheck', voidedCheckFile);
      }
      if (w9File) {
        formData.append('w9', w9File);
      }

      const response = await fetch('/api/vendor-onboarding/submit', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        router.push('/vendor-onboarding/success');
      } else {
        const error = await response.json();
        alert(`Failed to submit: ${error.message}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Error submitting form');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Form Type Selection */}
      <Card className="p-6">
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Form Type *</h3>
          <p className="text-sm text-muted-foreground mb-4">Please select one</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="new"
              checked={formType === 'new'}
              onCheckedChange={(checked) => checked && setFormType('new')}
            />
            <Label htmlFor="new">New ACH Authorization Form</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="change"
              checked={formType === 'change'}
              onCheckedChange={(checked) => checked && setFormType('change')}
            />
            <Label htmlFor="change">Change ACH Authorization Form</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="cancel"
              checked={formType === 'cancel'}
              onCheckedChange={(checked) => checked && setFormType('cancel')}
            />
            <Label htmlFor="cancel">Cancel ACH Authorization Form</Label>
          </div>
        </div>
      </Card>

      {/* Vendor/Payee Type */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold">Vendor/Payee Type *</h3>
            <p className="text-sm text-muted-foreground">Select entity type</p>
          </div>
        </div>

        <RadioGroup value={entityType} onValueChange={(v) => setEntityType(v as 'individual' | 'company')}>
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
            <h3 className="font-semibold">Vendor/Payee Information *</h3>
            <p className="text-sm text-muted-foreground">Business and contact details</p>
          </div>
        </div>

        <div className="space-y-4">
          {entityType === 'individual' ? (
            <div>
              <Label htmlFor="legalName">Legal Name *</Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Full legal name"
                required
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Registered company name"
                required
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
                required
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
                required
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
                required
              />
            </div>
            <div>
              <Label htmlFor="zipCode">ZIP Code *</Label>
              <Input
                id="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                required
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
                required
              />
            </div>
            <div>
              <Label htmlFor="contactLastName">Contact Person Last Name *</Label>
              <Input
                id="contactLastName"
                value={contactLastName}
                onChange={(e) => setContactLastName(e.target.value)}
                required
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
              required
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
            <h3 className="font-semibold">Financial Institution Information *</h3>
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
              required
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
              required
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
                required
              />
            </div>
            <div>
              <Label htmlFor="accountType">Account Type *</Label>
              <Select value={accountType} onValueChange={(v) => setAccountType(v as 'checking' | 'savings')}>
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
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              For security, we only collect the last 4 digits
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
            <h3 className="font-semibold">Required Documents *</h3>
            <p className="text-sm text-muted-foreground">Upload voided check and W9 form</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Voided Check or Bank Letter *</Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setVoidedCheckFile(e.target.files?.[0] || null)}
              required
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">PDF, PNG, or JPG (max 10MB)</p>
          </div>

          <div>
            <Label>W9 Form *</Label>
            <Input
              type="file"
              accept=".pdf"
              onChange={(e) => setW9File(e.target.files?.[0] || null)}
              required
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">PDF (max 10MB)</p>
          </div>
        </div>
      </Card>

      {/* Authorization & Signature */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-brass/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-brass" />
          </div>
          <div>
            <h3 className="font-semibold">Authorization & Signature *</h3>
            <p className="text-sm text-muted-foreground">Review and sign</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-md text-sm">
            <p className="font-medium mb-2">Authorization Agreement</p>
            <p className="text-muted-foreground mb-2">
              I authorize the organization to initiate ACH credit entries to the account indicated above.
              I acknowledge that the origination of ACH transactions to my account must comply with the
              provisions of U.S. law. This authorization will remain in effect until I notify the organization
              in writing to cancel it.
            </p>
            <p className="text-muted-foreground">
              I certify that the information provided is accurate and complete.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="signatureName">Full Name (Signature) *</Label>
              <Input
                id="signatureName"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
                placeholder="Type your full name"
                required
              />
            </div>
            <div>
              <Label htmlFor="signatureDate">Date *</Label>
              <Input
                id="signatureDate"
                type="date"
                value={signatureDate}
                onChange={(e) => setSignatureDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="terms"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
              required
            />
            <Label htmlFor="terms" className="text-sm leading-relaxed">
              I have read and agree to the authorization agreement above. I certify that I am authorized
              to complete this form on behalf of the company/individual listed. *
            </Label>
          </div>
        </div>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="brass"
          size="lg"
          disabled={isSubmitting || !agreedToTerms}
          className="min-w-[200px]"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
              Submitting...
            </>
          ) : (
            <>
              <Check className="w-5 h-5 mr-2" />
              Submit Profile
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
