#!/usr/bin/env python3
"""
Generate bulk journal CSV test data with a mix of valid entries and error scenarios.

These files contain mostly valid entries with a configurable percentage of errors
that should be rejected by oracle-gl-publisher or fail GL import.

Usage:
    # 1000 entries with 10% errors (100 errors at the end)
    python generate_error_scenarios.py --entries 1000 --error-percent 10 --output mixed.csv

    # 1000 entries with 5% errors scattered throughout
    python generate_error_scenarios.py --entries 1000 --error-percent 5 --shuffle --output scattered.csv

    # 100% errors (all entries are errors) - legacy behavior
    python generate_error_scenarios.py --entries 100 --error-percent 100 --output all_errors.csv

    # Specific error type only (10% of entries)
    python generate_error_scenarios.py --entries 1000 --error-percent 10 --error-type unbalanced --output unbalanced.csv
"""

import csv
import random
import argparse
from decimal import Decimal
from datetime import date, timedelta
from typing import List, Tuple, Optional
from collections import defaultdict

# =============================================================================
# VALID STAGING DATA
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

INVALID_ASSET_IDS = [
    "00000000000000099999",  # Non-existent
    "00000000000000000001",  # Too low
    "99999999999999999999",  # Obviously fake
    "INVALID_ASSET_ID_XXX",  # Wrong format
    "",                       # Empty
]

INVALID_ACCOUNT_IDS = [
    ("XXXXXX99999", "000000"),   # Non-existent account
    ("", "000000"),              # Empty account
    ("TOOLONG12345678", "000000"),  # Too long (>12 chars)
    ("SHORT", "000000"),         # Too short
]

MISMATCHED_NATURAL_ACCOUNTS = [
    "999999",  # Non-existent natural account
    "123456",  # Random invalid
    "",        # Empty
]

# =============================================================================
# CONSTANTS
# =============================================================================

JIRA_ID = "DCOE-9999"
POSITION = "CP"
CURRENCY = "STAT"
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


def generate_valid_entry(
    entry_num: int,
    accounting_date: str
) -> List[List[str]]:
    """Generate a valid (balanced) entry pair."""
    asset_id = random.choice(VALID_ASSETS)
    source_acct, source_natural = random.choice(VALID_ACCOUNTS)
    dest_acct, dest_natural = random.choice(WRITEOFF_ACCOUNTS)
    amount = generate_random_amount()
    amount_str = format_amount(amount)

    description = "VALID ENTRY - SHOULD PASS"

    del_line = [
        str(entry_num), JIRA_ID, asset_id, POSITION, accounting_date,
        source_natural, source_acct, "DEL", CURRENCY,
        amount_str, "",  # DR, CR
        description, TRANS_SUBCODE, FX_RATE, BUSINESS_UNIT,
        BV_DELTA, BV_DELTA, RELATED_ASSET_ID, COMMISSION,
        REFERENCE_VALUE, REFERENCE_TYPE, EXTERNAL_SOURCE
    ]

    rec_line = [
        str(entry_num), JIRA_ID, asset_id, POSITION, accounting_date,
        dest_natural, dest_acct, "REC", CURRENCY,
        "", amount_str,  # DR, CR
        description, TRANS_SUBCODE, FX_RATE, BUSINESS_UNIT,
        BV_DELTA, BV_DELTA, RELATED_ASSET_ID, COMMISSION,
        REFERENCE_VALUE, REFERENCE_TYPE, EXTERNAL_SOURCE
    ]

    return [del_line, rec_line]


def generate_error_entry(
    entry_num: int,
    error_type: str,
    accounting_date: str
) -> List[List[str]]:
    """Generate an entry pair with a specific error type."""
    asset_id = random.choice(VALID_ASSETS)
    source_acct, source_natural = random.choice(VALID_ACCOUNTS)
    dest_acct, dest_natural = random.choice(WRITEOFF_ACCOUNTS)
    amount = generate_random_amount()
    dr_amount = format_amount(amount)
    cr_amount = format_amount(amount)
    entry_date = accounting_date

    description = f"ERROR: {error_type.upper()}"

    # Apply the error
    if error_type == "unbalanced":
        cr_amount = format_amount(amount + Decimal("0.0000000001"))

    elif error_type == "invalid-asset":
        asset_id = random.choice(INVALID_ASSET_IDS)

    elif error_type == "invalid-account":
        invalid = random.choice(INVALID_ACCOUNT_IDS)
        if random.choice([True, False]):
            source_acct, source_natural = invalid
        else:
            dest_acct, dest_natural = invalid

    elif error_type == "invalid-natural-acct":
        if random.choice([True, False]):
            source_natural = random.choice(MISMATCHED_NATURAL_ACCOUNTS)
        else:
            dest_natural = random.choice(MISMATCHED_NATURAL_ACCOUNTS)

    elif error_type == "future-date":
        future = date.today() + timedelta(days=random.randint(30, 365))
        entry_date = future.isoformat()

    elif error_type == "past-date":
        past = date.today() - timedelta(days=random.randint(730, 1000))
        entry_date = past.isoformat()

    elif error_type == "missing-amount":
        dr_amount = ""
        cr_amount = ""

    elif error_type == "negative-amount":
        dr_amount = format_amount(-amount)
        cr_amount = format_amount(-amount)

    elif error_type == "zero-amount":
        dr_amount = "0.0000000000"
        cr_amount = "0.0000000000"

    del_line = [
        str(entry_num), JIRA_ID, asset_id, POSITION, entry_date,
        source_natural, source_acct, "DEL", CURRENCY,
        dr_amount, "",
        description, TRANS_SUBCODE, FX_RATE, BUSINESS_UNIT,
        BV_DELTA, BV_DELTA, RELATED_ASSET_ID, COMMISSION,
        REFERENCE_VALUE, REFERENCE_TYPE, EXTERNAL_SOURCE
    ]

    rec_line = [
        str(entry_num), JIRA_ID, asset_id, POSITION, entry_date,
        dest_natural, dest_acct, "REC", CURRENCY,
        "", cr_amount,
        description, TRANS_SUBCODE, FX_RATE, BUSINESS_UNIT,
        BV_DELTA, BV_DELTA, RELATED_ASSET_ID, COMMISSION,
        REFERENCE_VALUE, REFERENCE_TYPE, EXTERNAL_SOURCE
    ]

    return [del_line, rec_line]


def generate_csv(
    num_entries: int,
    output_path: str,
    error_percent: float = 10.0,
    error_type: Optional[str] = None,
    accounting_date: str = None,
    shuffle: bool = False
) -> None:
    """Generate CSV with mix of valid and error entries.

    Args:
        num_entries: Total number of journal entries
        output_path: Path to output CSV file
        error_percent: Percentage of entries that should have errors (0-100)
        error_type: Specific error type or 'mixed' for random mix
        accounting_date: Accounting date (YYYY-MM-DD), defaults to today
        shuffle: If True, shuffle errors throughout; if False, errors at end
    """
    if accounting_date is None:
        accounting_date = date.today().isoformat()

    # Calculate counts
    num_errors = int(num_entries * error_percent / 100)
    num_valid = num_entries - num_errors

    # Determine error types to use
    if error_type and error_type != "mixed":
        if error_type not in ERROR_TYPES:
            raise ValueError(f"Unknown error type: {error_type}. Valid: {ERROR_TYPES}")
        error_types_to_use = [error_type]
    else:
        error_types_to_use = ERROR_TYPES

    print(f"Generating {num_entries} total entries ({num_entries * 2} rows)...")
    print(f"  Valid entries: {num_valid} ({100 - error_percent:.1f}%)")
    print(f"  Error entries: {num_errors} ({error_percent:.1f}%)")
    print(f"  Error types: {error_types_to_use}")
    print(f"  Accounting date: {accounting_date}")
    print(f"  Shuffle mode: {shuffle}")

    # Build list of (is_error, error_type) for each entry
    entries_plan = []
    entries_plan.extend([(False, None)] * num_valid)
    for _ in range(num_errors):
        err_type = random.choice(error_types_to_use)
        entries_plan.append((True, err_type))

    if shuffle:
        random.shuffle(entries_plan)
    # else: valid entries first, errors at end (default)

    # Track stats
    error_counts = defaultdict(int)
    valid_count = 0

    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(CSV_HEADERS)

        for entry_num, (is_error, err_type) in enumerate(entries_plan, start=1):
            if is_error:
                rows = generate_error_entry(entry_num, err_type, accounting_date)
                error_counts[err_type] += 1
            else:
                rows = generate_valid_entry(entry_num, accounting_date)
                valid_count += 1

            writer.writerows(rows)

            if entry_num % 50000 == 0:
                print(f"  Generated {entry_num} entries...")

    print(f"\nDone! Output: {output_path}")
    print(f"\nSummary:")
    print(f"  Valid entries: {valid_count}")
    if error_counts:
        print(f"  Error entries by type:")
        for err_type, count in sorted(error_counts.items()):
            print(f"    {err_type}: {count}")

    import os
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\nFile size: {size_mb:.2f} MB")


def main():
    parser = argparse.ArgumentParser(
        description="Generate bulk journal CSV with configurable error percentage",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # 1000 entries with 10% errors at the end
  python generate_error_scenarios.py --entries 1000 --error-percent 10

  # 1000 entries with 5% errors shuffled throughout
  python generate_error_scenarios.py --entries 1000 --error-percent 5 --shuffle

  # Only unbalanced errors (10% of 1000 = 100 unbalanced entries)
  python generate_error_scenarios.py --entries 1000 --error-percent 10 --error-type unbalanced

  # 100% errors (legacy behavior)
  python generate_error_scenarios.py --entries 100 --error-percent 100

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
    parser.add_argument("--entries", type=int, default=1000,
                        help="Total number of entries (default: 1000)")
    parser.add_argument("--output", type=str, default="error_scenarios.csv",
                        help="Output file path")
    parser.add_argument("--error-percent", type=float, default=10.0,
                        help="Percentage of entries with errors (default: 10)")
    parser.add_argument("--error-type", type=str, default="mixed",
                        choices=ERROR_TYPES + ["mixed"],
                        help="Specific error type or 'mixed' for all")
    parser.add_argument("--date", type=str, default=None,
                        help="Accounting date (YYYY-MM-DD)")
    parser.add_argument("--shuffle", action="store_true",
                        help="Shuffle errors throughout (default: errors at end)")

    args = parser.parse_args()
    generate_csv(
        args.entries,
        args.output,
        args.error_percent,
        args.error_type,
        args.date,
        args.shuffle
    )


if __name__ == "__main__":
    main()
