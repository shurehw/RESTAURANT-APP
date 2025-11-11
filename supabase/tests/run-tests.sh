#!/bin/bash

# OpsOS Intelligence Layer Test Runner
# Runs all SQL test files against local Supabase instance

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
TEST_DIR="$(dirname "$0")"
UNIT_DIR="$TEST_DIR/unit"
INTEGRATION_DIR="$TEST_DIR/integration"

# Parse arguments
FILTER=""
VERBOSE=false
UNIT_ONLY=false
INTEGRATION_ONLY=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --filter=*)
      FILTER="${1#*=}"
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --unit)
      UNIT_ONLY=true
      shift
      ;;
    --integration)
      INTEGRATION_ONLY=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Header
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}OpsOS Intelligence Layer Test Suite${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check Supabase is running
echo "Checking Supabase connection..."
if ! psql "$DB_URL" -c "SELECT 1" &> /dev/null; then
  echo -e "${RED}Error: Cannot connect to Supabase database${NC}"
  echo "Make sure Supabase is running: npx supabase start"
  exit 1
fi
echo -e "${GREEN}✓ Connected to database${NC}"
echo ""

# Function to run a test file
run_test() {
  local test_file=$1
  local test_name=$(basename "$test_file" .test.sql)

  echo -n "Running $test_name... "

  if [ "$VERBOSE" = true ]; then
    echo ""
    if psql "$DB_URL" -f "$test_file" 2>&1; then
      echo -e "${GREEN}✓ PASSED${NC}"
      return 0
    else
      echo -e "${RED}✗ FAILED${NC}"
      return 1
    fi
  else
    if psql "$DB_URL" -f "$test_file" > /dev/null 2>&1; then
      echo -e "${GREEN}✓ PASSED${NC}"
      return 0
    else
      echo -e "${RED}✗ FAILED${NC}"
      echo "Run with --verbose to see details"
      return 1
    fi
  fi
}

# Run unit tests
PASSED=0
FAILED=0

if [ "$INTEGRATION_ONLY" = false ]; then
  echo -e "${YELLOW}Unit Tests:${NC}"
  for test_file in "$UNIT_DIR"/*.test.sql; do
    if [ -f "$test_file" ]; then
      test_name=$(basename "$test_file")

      # Apply filter if specified
      if [ -n "$FILTER" ] && [[ ! "$test_name" =~ $FILTER ]]; then
        continue
      fi

      if run_test "$test_file"; then
        ((PASSED++))
      else
        ((FAILED++))
      fi
    fi
  done
  echo ""
fi

# Run integration tests
if [ "$UNIT_ONLY" = false ] && [ -d "$INTEGRATION_DIR" ]; then
  echo -e "${YELLOW}Integration Tests:${NC}"
  for test_file in "$INTEGRATION_DIR"/*.test.sql; do
    if [ -f "$test_file" ]; then
      test_name=$(basename "$test_file")

      # Apply filter if specified
      if [ -n "$FILTER" ] && [[ ! "$test_name" =~ $FILTER ]]; then
        continue
      fi

      if run_test "$test_file"; then
        ((PASSED++))
      else
        ((FAILED++))
      fi
    fi
  done
  echo ""
fi

# Summary
TOTAL=$((PASSED + FAILED))
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}========================================${NC}"
echo "Total:  $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
else
  echo -e "${GREEN}Failed: $FAILED${NC}"
fi
echo ""

# Exit with appropriate code
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Some tests failed ✗${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed ✓${NC}"
  exit 0
fi
