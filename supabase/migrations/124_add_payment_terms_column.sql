-- Add payment_terms column to invoices table
ALTER TABLE invoices
ADD COLUMN payment_terms TEXT;
