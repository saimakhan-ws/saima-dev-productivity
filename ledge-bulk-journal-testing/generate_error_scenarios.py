#!/usr/bin/env python3
"""
Generate bulk journal CSV test data with various error scenarios.

These entries will be published by the bulk tool but should be rejected by
oracle-gl-publisher or fail GL import.

Usage:
    # Generate all error types (mixed)
    python generate_error_scenarios.py --entries 100 --output errors.csv

    # Generate specific error type only
    python generate_error_scenarios.py --entries 100 --error-type unbalanced --output unbalanced.csv
    python generate_error_scenarios.py --entries 100 --error-type invalid-asset --output bad_assets.csv
    python generate_error_scenarios.py --entries 100 --error-type invalid-account --output bad_accounts.csv
    python generate_error_scenarios.py --entries 100 --error-type invalid-natural-acct --output bad_natural.csv
    python generate_error_scenarios.py --entries 100 --error-type future-date --output future_dates.csv
"""

import csv
import random
import argparse
from decimal import Decimal
from datetime import date, timedelta
from typing import List, Tuple, Dict, Optional
from collections import defaultdict

# =============================================================================
# VALID STAGING DATA (subset for generating mostly-valid entries with one error)
# =============================================================================

VALID_ASSETS = [
    "00000000000000026236",  # BTC
    "00000000000000026237",  # ETH
    "00000000000000026264",  # SOL
    "00000000000000026261",  # ADA
    "00000000000000026255",  # DOGE
    "00000000000000026277",  # USDC
]

VALID_ACCOUNTS = [
    ("HQ0243B17CAD", "000000"),
    ("HQ011XM14CAD", "000000"),
    ("BR00135L1USD", "000000"),
    ("BR00136L0USD", "000000"),
    ("HQ05VJC14CAD", "000000"),
    ("HQ07FQK13CAD", "000000"),
    ("HQ0QV8R16CAD", "000000"),
    ("BR00142X6USD", "000000"),
    ("BR00144R7USD", "000000"),
    ("BR00145R6USD", "000000"),
]

WRITEOFF_ACCOUNTS = [
    ("HQ0C7XCK3CAD", "201030"),
    ("HM93593K8CAD", "201030"),
    ("WB7218549CAD", "201030"),
    ("H19930702CAD", "201010"),
    ("WB7658603CAD", "201060"),
]

# =============================================================================
# INVALID DATA FOR ERROR SCENARIOS
# =============================================================================

# Asset IDs that don't exist in staging
INVALID_ASSET_IDS = [
    "00000000000000099999",  # Non-existent
    "00000000000000000001",  # Too low
    "99999999999999999999",  # Obviously fake
    "INVALID_ASSET_ID_XXX",  # Wrong format
    "",                       # Empty
]

# Account IDs that don't exist
INVALID_ACCOUNT_IDS = [
    ("XXXXXX99999", "000000"),   # Non-existent account
    ("", "000000"),              # Empty account
    ("TOOLONG12345678", "000000"),  # Too long (>12 chars)
    ("SHORT", "000000"),         # Too short
]

# Natural accounts that won't match the sub-account type
MISMATCHED_NATURAL_ACCOUNTS = [
    "999999",  # Non-existent natural account
    "123456",  # Random invalid
    "",        # Empty
]

# =============================================================================
# CONSTANTS
# =============================================================================

JIRA_ID = "DCOE-ERROR-TEST"
POSITION = "CP"
CURRENCY = "STAT"
LINE_DESCRIPTION = "ERROR SCENARIO TEST - EXPECTED TO FAIL"
TRANS_SUBCODE = ""
FX_RATE = "1"
BUSINESS_UNIT = "DISC"
BV_DELTA = "0"
RELATED_ASSET_ID = ""
COMMISSION = "0"
REFERENCE_VALUE = ""
REFERENCE_TYPE = "NONE"
EXTERNAL_SOURCE = ""

CSV_HEADERS = [
    "ENTRY_NUM", "JIRA_ID", "ASSET_ID", "POSITION", "ACCOUNTING_DATE",
    "NATURAL_ACCT", "SUB_ACCT", "TRANS_CODE", "CURRENCY", "ENTERED_DR",
    "ENTERED_CR", "LINE_DESCRIPTION", "TRANS_SUBCODE", "FX_RATE",
    "BUSINESS_UNIT", "BV_DELTA_DR", "BV_DELTA_CR", "RELATED_ASSET_ID",
    "COMMISSION", "REFERENCE_VALUE", "REFERENCE_TYPE", "EXTERNAL_SOURCE"
]

ERROR_TYPES = [
    "unbalanced",           # DR != CR
    "invalid-asset",        # Asset ID doesn't exist
    "invalid-account",      # Sub account doesn't exist
    "invalid-natural-acct", # Natural account doesn't match
    "future-date",          # Accounting date in future
    "past-date",            # Accounting date too far in past (closed period)
    "missing-amount",       # Both DR and CR empty
    "negative-amount",      # Negative amounts
    "zero-amount",          # Zero amounts
]


def generate_random_amount() -> Decimal:
    """Generate a random tiny amount."""
    mantissa = random.randint(1, 9999)
    exponent = random.randint(8, 10)
    return Decimal(mantissa) / Decimal(10 ** exponent)


def format_amount(amount: Decimal) -> str:
    """Format amount with 10 decimal places."""
    return f"{amount:.10f}"


def generate_error_entry(
    entry_num: int,
    error_type: str,
    accounting_date: str
) -> List[List[str]]:
    """Generate an entry pair with a specific error type."""

    # Start with valid data
    asset_id = random.choice(VALID_ASSETS)
    source_acct, source_natural = random.choice(VALID_ACCOUNTS)
    dest_acct, dest_natural = random.choice(WRITEOFF_ACCOUNTS)
    amount = generate_random_amount()
    dr_amount = format_amount(amount)
    cr_amount = format_amount(amount)
    entry_date = accounting_date

    # Description indicates the error type
    description = f"ERROR TEST: {error_type.upper()}"

    # Apply the error
    if error_type == "unbalanced":
        # CR is different from DR
        cr_amount = format_amount(amount + Decimal("0.0000000001"))

    elif error_type == "invalid-asset":
        # Use non-existent asset ID
        asset_id = random.choice(INVALID_ASSET_IDS)

    elif error_type == "invalid-account":
        # Use non-existent account
        invalid = random.choice(INVALID_ACCOUNT_IDS)
        if random.choice([True, False]):
            source_acct, source_natural = invalid
        else:
            dest_acct, dest_natural = invalid

    elif error_type == "invalid-natural-acct":
        # Use mismatched natural account
        if random.choice([True, False]):
            source_natural = random.choice(MISMATCHED_NATURAL_ACCOUNTS)
        else:
            dest_natural = random.choice(MISMATCHED_NATURAL_ACCOUNTS)

    elif error_type == "future-date":
        # Date 30+ days in future
        future = date.today() + timedelta(days=random.randint(30, 365))
        entry_date = future.isoformat()

    elif error_type == "past-date":
        # Date in closed period (>2 years ago)
        past = date.today() - timedelta(days=random.randint(730, 1000))
        entry_date = past.isoformat()

    elif error_type == "missing-amount":
        # Both DR and CR empty
        dr_amount = ""
        cr_amount = ""

    elif error_type == "negative-amount":
        # Negative amounts
        dr_amount = format_amount(-amount)
        cr_amount = format_amount(-amount)

    elif error_type == "zero-amount":
        # Zero amounts
        dr_amount = "0.0000000000"
        cr_amount = "0.0000000000"

    # Build the lines
    del_line = [
        str(entry_num),
        JIRA_ID,
        asset_id,
        POSITION,
        entry_date,
        source_natural,
        source_acct,
        "DEL",
        CURRENCY,
        dr_amount,
        "",
        description,
        TRANS_SUBCODE,
        FX_RATE,
        BUSINESS_UNIT,
        BV_DELTA,
        BV_DELTA,
        RELATED_ASSET_ID,
        COMMISSION,
        REFERENCE_VALUE,
        REFERENCE_TYPE,
        EXTERNAL_SOURCE
    ]

    rec_line = [
        str(entry_num),
        JIRA_ID,
        asset_id,
        POSITION,
        entry_date,
        dest_natural,
        dest_acct,
        "REC",
        CURRENCY,
        "",
        cr_amount,
        description,
        TRANS_SUBCODE,
        FX_RATE,
        BUSINESS_UNIT,
        BV_DELTA,
        BV_DELTA,
        RELATED_ASSET_ID,
        COMMISSION,
        REFERENCE_VALUE,
        REFERENCE_TYPE,
        EXTERNAL_SOURCE
    ]

    return [del_line, rec_line]


def generate_csv(
    num_entries: int,
    output_path: str,
    error_type: Optional[str] = None,
    accounting_date: str = None
) -> None:
    """Generate the error scenarios CSV file."""

    if accounting_date is None:
        accounting_date = date.today().isoformat()

    # Determine which error types to use
    if error_type and error_type != "mixed":
        if error_type not in ERROR_TYPES:
            raise ValueError(f"Unknown error type: {error_type}. Valid types: {ERROR_TYPES}")
        error_types_to_use = [error_type]
    else:
        error_types_to_use = ERROR_TYPES

    print(f"Generating {num_entries} error entries ({num_entries * 2} rows)...")
    print(f"Error types: {error_types_to_use}")
    print(f"Base accounting date: {accounting_date}")

    # Track counts per error type
    error_counts = defaultdict(int)

    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)

        for entry_num in range(1, num_entries + 1):
            # Pick error type
            err_type = random.choice(error_types_to_use)
            error_counts[err_type] += 1

            rows = generate_error_entry(entry_num, err_type, accounting_date)
            writer.writerows(rows)

    print(f"\nDone! Output: {output_path}")
    print("\nError type distribution:")
    for err_type, count in sorted(error_counts.items()):
        print(f"  {err_type}: {count}")

    import os
    size_kb = os.path.getsize(output_path) / 1024
    print(f"\nFile size: {size_kb:.2f} KB")


def main():
    parser = argparse.ArgumentParser(
        description="Generate bulk journal CSV with error scenarios",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Error types:
  unbalanced           DR != CR (will fail balancing validation)
  invalid-asset        Non-existent asset ID
  invalid-account      Non-existent sub-account ID
  invalid-natural-acct Natural account doesn't match sub-account type
  future-date          Accounting date 30+ days in future
  past-date            Accounting date in closed period (>2 years ago)
  missing-amount       Both DR and CR are empty
  negative-amount      Negative amounts
  zero-amount          Zero amounts
  mixed                Random mix of all error types (default)
"""
    )
    parser.add_argument("--entries", type=int, default=100,
                        help="Number of error entries (default: 100)")
    parser.add_argument("--output", type=str, default="error_scenarios.csv",
                        help="Output file path")
    parser.add_argument("--error-type", type=str, default="mixed",
                        choices=ERROR_TYPES + ["mixed"],
                        help="Specific error type or 'mixed' for all")
    parser.add_argument("--date", type=str, default=None,
                        help="Base accounting date (YYYY-MM-DD)")

    args = parser.parse_args()
    generate_csv(args.entries, args.output, args.error_type, args.date)


if __name__ == "__main__":
    main()
