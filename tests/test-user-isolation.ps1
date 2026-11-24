# =============================================================
# test-user-isolation.ps1 — Automated User Isolation Test Suite
# Tests:
# 1. New user registration starts with clean slate (0 records)
# 2. Calculations start at LKR 0.00 on empty state
# 3. Adding expenses records only to the active user's store
# 4. Dashboard totals & category breakdown match ONLY that user's entries
# 5. Other users' records remain strictly isolated
# =============================================================

$ErrorActionPreference = "Stop"
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Personal Expense Tracker — User Isolation Test Suite" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$passCount = 0
$failCount = 0

function Assert-Condition($testName, $condition, $detail) {
    if ($condition) {
        $script:passCount++
        Write-Host " [PASS] $testName" -ForegroundColor Green
        if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
    } else {
        $script:failCount++
        Write-Host " [FAIL] $testName" -ForegroundColor Red
        if ($detail) { Write-Host "        $detail" -ForegroundColor Yellow }
    }
}

# In-memory storage mock
$MockStorage = @{}

function Get-UserTransactions($userId) {
    if (-not $userId) { return @() }
    $key = "expense_tracker_tx_$userId"
    if ($MockStorage.ContainsKey($key)) {
        return ($MockStorage[$key] | ConvertFrom-Json)
    }
    $empty = @()
    $MockStorage[$key] = ($empty | ConvertTo-Json -Compress)
    return $empty
}

function Save-UserTransactions($userId, $transactions) {
    $key = "expense_tracker_tx_$userId"
    $MockStorage[$key] = ($transactions | ConvertTo-Json -Compress)
}

function Calculate-UserTotals($transactions) {
    $income = 0.0
    $expense = 0.0
    $catSpending = @{
        "food" = 0.0; "transport" = 0.0; "shopping" = 0.0; "bills" = 0.0;
        "entertainment" = 0.0; "healthcare" = 0.0; "education" = 0.0;
        "other" = 0.0; "work" = 0.0
    }

    foreach ($tx in $transactions) {
        $amt = [double]$tx.amount
        if ($tx.type -eq "income") {
            $income += $amt
            $catSpending["work"] += $amt
        } else {
            $expense += $amt
            $k = ($tx.category).ToLower()
            if ($catSpending.ContainsKey($k)) {
                $catSpending[$k] += $amt
            } else {
                $catSpending["other"] += $amt
            }
        }
    }

    $activeCategories = 0
    foreach ($catKey in @("food","transport","shopping","bills","entertainment","healthcare","education","other")) {
        if ($catSpending[$catKey] -gt 0) { $activeCategories++ }
    }

    return @{
        Income = $income
        Expense = $expense
        NetBalance = $income - $expense
        ActiveCategories = $activeCategories
        CategorySpending = $catSpending
    }
}

# -------------------------------------------------------------
# STEP 1: Pre-populate an existing user
# -------------------------------------------------------------
Write-Host "--- TEST 1: Setup Existing User With Data ---" -ForegroundColor Yellow
$existingUserId = "user_existing"
$existingUserTx = @(
    @{ id = 1; userId = $existingUserId; description = "Salary"; category = "Work"; type = "income"; amount = 4500.00 },
    @{ id = 2; userId = $existingUserId; description = "Groceries"; category = "Food"; type = "expense"; amount = 127.50 }
)
Save-UserTransactions $existingUserId $existingUserTx
$user1Tx = Get-UserTransactions $existingUserId
Assert-Condition "Existing user is initialized with records" ($user1Tx.Count -gt 0) "User record count: $($user1Tx.Count)"

# -------------------------------------------------------------
# STEP 2: Register a brand new user
# -------------------------------------------------------------
Write-Host "`n--- TEST 2: Register New User & Verify Clean Slate ---" -ForegroundColor Yellow
$newUserId = "user_kasun_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$newUserData = @{
    id = $newUserId
    fullName = "Kasun Silva"
    email = "kasun@example.lk"
    password = "password123"
}

# Registration initializes empty user store
Save-UserTransactions $newUserId @()
$newUserTx = Get-UserTransactions $newUserId

Assert-Condition "Newly registered user starts with exactly 0 transactions" ($newUserTx.Count -eq 0) "Kasun initial transactions: $($newUserTx.Count)"
Assert-Condition "No existing user records leaked to Kasun" (-not ($newUserTx | Where-Object { $_.userId -eq $existingUserId })) "Zero leaked records"

$initialTotals = Calculate-UserTotals $newUserTx
Assert-Condition "New user initial Income is 0.00" ($initialTotals.Income -eq 0.0) "Income: $($initialTotals.Income)"
Assert-Condition "New user initial Expenses is 0.00" ($initialTotals.Expense -eq 0.0) "Expense: $($initialTotals.Expense)"
Assert-Condition "New user initial Net Balance is 0.00" ($initialTotals.NetBalance -eq 0.0) "Balance: $($initialTotals.NetBalance)"
Assert-Condition "New user active categories count is 0" ($initialTotals.ActiveCategories -eq 0) "Active categories: $($initialTotals.ActiveCategories)"

# -------------------------------------------------------------
# STEP 3: Add transactions for the new user
# -------------------------------------------------------------
Write-Host "`n--- TEST 3: Add Transactions for New User ---" -ForegroundColor Yellow
$entries = @(
    @{ id = 101; userId = $newUserId; description = "Supermarket Groceries"; category = "food"; type = "expense"; amount = 3500.00 },
    @{ id = 102; userId = $newUserId; description = "Electricity Bill"; category = "bills"; type = "expense"; amount = 7200.00 },
    @{ id = 103; userId = $newUserId; description = "Monthly Salary"; category = "work"; type = "income"; amount = 65000.00 },
    @{ id = 104; userId = $newUserId; description = "Highway Bus Pass"; category = "transport"; type = "expense"; amount = 1800.00 }
)
Save-UserTransactions $newUserId $entries
$loadedTx = Get-UserTransactions $newUserId

Assert-Condition "Kasun now has exactly 4 transactions" ($loadedTx.Count -eq 4) "Saved count: $($loadedTx.Count)"
Assert-Condition "All transactions are tagged with Kasun's user ID" (-not ($loadedTx | Where-Object { $_.userId -ne $newUserId })) "All IDs match $newUserId"

# -------------------------------------------------------------
# STEP 4: Confirm calculations match ONLY Kasun's entries
# -------------------------------------------------------------
Write-Host "`n--- TEST 4: Validate Calculations Match Only New User Entries ---" -ForegroundColor Yellow
# Expected:
# Income = 65,000.00
# Expense = 3,500 + 7,200 + 1,800 = 12,500.00
# Net Balance = 65,000 - 12,500 = 52,500.00
$calc = Calculate-UserTotals $loadedTx

Assert-Condition "Calculated Total Income is exactly LKR 65,000.00" ($calc.Income -eq 65000.0) "Expected: 65000.0 | Got: $($calc.Income)"
Assert-Condition "Calculated Total Expense is exactly LKR 12,500.00" ($calc.Expense -eq 12500.0) "Expected: 12500.0 | Got: $($calc.Expense)"
Assert-Condition "Calculated Net Balance is exactly LKR 52,500.00" ($calc.NetBalance -eq 52500.0) "Expected: 52500.0 | Got: $($calc.NetBalance)"
Assert-Condition "Food spending is exactly LKR 3,500.00" ($calc.CategorySpending["food"] -eq 3500.0) "Food: $($calc.CategorySpending['food'])"
Assert-Condition "Bills spending is exactly LKR 7,200.00" ($calc.CategorySpending["bills"] -eq 7200.0) "Bills: $($calc.CategorySpending['bills'])"
Assert-Condition "Transport spending is exactly LKR 1,800.00" ($calc.CategorySpending["transport"] -eq 1800.0) "Transport: $($calc.CategorySpending['transport'])"
Assert-Condition "Shopping spending remains LKR 0.00 (unspent)" ($calc.CategorySpending["shopping"] -eq 0.0) "Shopping: $($calc.CategorySpending['shopping'])"
Assert-Condition "Active category count is exactly 3 (Food, Bills, Transport)" ($calc.ActiveCategories -eq 3) "Active: $($calc.ActiveCategories)"

# -------------------------------------------------------------
# STEP 5: Confirm cross-user isolation
# -------------------------------------------------------------
Write-Host "`n--- TEST 5: Verify Cross-User Isolation (No Data Bleed) ---" -ForegroundColor Yellow
$user1After = Get-UserTransactions $existingUserId
Assert-Condition "Existing user records were not modified or contaminated by Kasun" ($user1After.Count -eq $user1Tx.Count) "Existing user count: $($user1After.Count)"

$user2Id = "user_amara_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Save-UserTransactions $user2Id @()
$user2Tx = Get-UserTransactions $user2Id
Assert-Condition "Second new user (Amara) also starts with clean slate (0 records)" ($user2Tx.Count -eq 0) "Amara initial count: $($user2Tx.Count)"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   TEST RESULTS: $passCount Passed, $failCount Failed" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "========================================================`n" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
}
exit 0
