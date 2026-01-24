#!/bin/bash

# Load environment variables from .env.local
set -a
source .env.local
set +a

# Run the bulk import script
node_modules/.bin/tsx scripts/bulk-import-invoices.ts "$@"
