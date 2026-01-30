-- =============================================================================
-- Staging Oracle Queries for Bulk Journal Test Data Generation
-- =============================================================================
-- These queries extract valid account/asset combinations from staging Oracle
-- for use with generate_bulk_writeoff.py
--
-- Run these in SQL Developer connected to staging (SWS2E)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Query 1: Get active crypto assets with listings
-- -----------------------------------------------------------------------------
-- Use this to see all available crypto assets in staging
SELECT
    a.ASSET_ID,
    a.ASSET_NAME,
    l.LISTING_ID,
    l.CURRENCY AS LISTING_CURRENCY
FROM APPS.XXBRK_ASSETS a
JOIN APPS.XXBRK_LISTINGS l ON a.ASSET_ID = l.ASSET_ID
WHERE a.ASSET_TYPE = 'CRYPTO'
  AND a.END_DATE_ACTIVE IS NULL
ORDER BY a.ASSET_NAME;


-- -----------------------------------------------------------------------------
-- Query 2: Get client accounts with crypto holdings (SOURCE ACCOUNTS)
-- -----------------------------------------------------------------------------
-- These are accounts that have existing crypto positions in GL
-- Output format: SUB_ACCT, NATURAL_ACCT, LISTING_ID, ACCT_CURRENCY, ASSET_ID, ASSET_NAME
-- Use these as SOURCE_ACCOUNTS in the Python script
SELECT DISTINCT
    cc.SEGMENT4 AS SUB_ACCT,
    cc.SEGMENT3 AS NATURAL_ACCT,
    cc.SEGMENT5 AS LISTING_ID,
    acct.CURRENCY AS ACCT_CURRENCY,
    a.ASSET_ID,
    a.ASSET_NAME
FROM APPS.GL_CODE_COMBINATIONS cc
JOIN APPS.XXBRK_LISTINGS l ON cc.SEGMENT5 = l.LISTING_ID
JOIN APPS.XXBRK_ASSETS a ON l.ASSET_ID = a.ASSET_ID
JOIN APPS.XXBRKACCT acct ON cc.SEGMENT4 = acct.ACCT_ID
WHERE a.ASSET_TYPE = 'CRYPTO'
  AND a.END_DATE_ACTIVE IS NULL
  AND cc.ENABLED_FLAG = 'Y'
  AND cc.SEGMENT6 = 'CP'  -- Client Position
ORDER BY a.ASSET_NAME, cc.SEGMENT4;


-- -----------------------------------------------------------------------------
-- Query 3: Find write-off/suspense accounts (DESTINATION ACCOUNTS)
-- -----------------------------------------------------------------------------
-- These are accounts used as the destination for write-offs
-- Look for accounts with "DISC", "WRITE", or "SUSPENSE" in the name
SELECT
    acct.ACCT_ID,
    acct.ACCT_NAME,
    acct.NATURAL_ACCOUNT,
    acct.CURRENCY,
    acct.ACCT_TYPE
FROM APPS.XXBRKACCT acct
WHERE (UPPER(acct.ACCT_NAME) LIKE '%WRITE%'
       OR UPPER(acct.ACCT_NAME) LIKE '%SUSPENSE%'
       OR UPPER(acct.ACCT_NAME) LIKE '%DISC%')
  AND acct.CURRENCY IN ('USD', 'CAD')
ORDER BY acct.ACCT_NAME;


-- -----------------------------------------------------------------------------
-- Query 4: Verify GL code combination exists for account/asset pair
-- -----------------------------------------------------------------------------
-- Use this to verify a specific account/asset combination is valid
-- Replace :sub_acct and :asset_id with actual values
SELECT
    cc.CODE_COMBINATION_ID,
    cc.SEGMENT3 AS NATURAL_ACCT,
    cc.SEGMENT4 AS SUB_ACCT,
    cc.SEGMENT5 AS LISTING_ID,
    cc.SEGMENT6 AS POSITION_TYPE,
    a.ASSET_NAME
FROM APPS.GL_CODE_COMBINATIONS cc
JOIN APPS.XXBRK_LISTINGS l ON cc.SEGMENT5 = l.LISTING_ID
JOIN APPS.XXBRK_ASSETS a ON l.ASSET_ID = a.ASSET_ID
WHERE cc.SEGMENT4 = :sub_acct
  AND a.ASSET_ID = :asset_id
  AND cc.ENABLED_FLAG = 'Y';


-- -----------------------------------------------------------------------------
-- Query 5: Count accounts per crypto asset (useful for understanding data)
-- -----------------------------------------------------------------------------
SELECT
    a.ASSET_ID,
    a.ASSET_NAME,
    COUNT(DISTINCT cc.SEGMENT4) AS NUM_ACCOUNTS
FROM APPS.GL_CODE_COMBINATIONS cc
JOIN APPS.XXBRK_LISTINGS l ON cc.SEGMENT5 = l.LISTING_ID
JOIN APPS.XXBRK_ASSETS a ON l.ASSET_ID = a.ASSET_ID
WHERE a.ASSET_TYPE = 'CRYPTO'
  AND a.END_DATE_ACTIVE IS NULL
  AND cc.ENABLED_FLAG = 'Y'
  AND cc.SEGMENT6 = 'CP'
GROUP BY a.ASSET_ID, a.ASSET_NAME
ORDER BY NUM_ACCOUNTS DESC;
