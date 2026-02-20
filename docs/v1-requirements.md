# Portfolio Monthly Summary - V1

## 🎯 Objective

Provide individual Australian property investors (2–10 properties) with a clear, transparent monthly portfolio summary generated from uploaded PM PDF statements, with optional fixed monthly mortgage inputs.

Optimised for:

- Speed to launch
- Minimal user effort
- Transparency & predictability

---

# 🔒 Key Principles

### 1️⃣ Transparency

- No hidden assumptions
- No silent adjustments
- Missing data clearly disclosed

### 2️⃣ Predictability

- Fixed report structure
- Fixed terminology
- Stable property ordering
- Consistent calculation logic

### 3️⃣ Conservative Bias

- Mortgage included even if PM missing
- No optimistic projections
- No inferred values

### 4️⃣ Simplicity Over Completeness

- No loan parsing
- No bank integration
- No tax optimisation
- No forecasting
- No cross-period comparisons

---

# 📦 Scope (V1)

## 🚀 In Scope

- Web portal (mobile-first UI)
- Multi-property support
- Single or bulk PDF upload (Property Manager statements)
  - Automatic parsing:
    - Property address
    - Statement period
    - Rent collected
    - Expenses

- Automatic grouping of statements by month
- Fixed monthly mortgage per property (manual, optional)
- Monthly portfolio report generation
- On-demand report generation (user-triggered)
- Accountant-style summary + AI commentary (single month only)
- Explicit data flags and transparency indicators

## Out of Scope (Fast Follow)

- Loan/mortgage PDF parsing
- Email ingestion
- Bank integrations
- Automated reminders
- Interest vs principal tracking
- Tax reporting
- Multi-user or accountant access
- Cross-month pro-rata allocation
- Combined multi-month reports
- Report version history

---

# 📍 UX Flow

1. Landing Page

2. Account Creation (Supabase Auth)

3. Onboarding:
   - Add Properties, with full address + fixed monthly mortgage amount (optional)

4. Ongoing:
   - Upload Page
   - Select month
   - Generate report

---

# 🧮 Calculation Rules

- Month determined by **statement end date**
- Multiple statements in same month → summed
- Expected properties = total registered properties
- If property has no statement:
  - Mortgage still included
  - Rent assumed zero
  - Explicitly flagged as missing

- No estimation or auto-fill of missing data
- No projections or smoothing
- No cross-month comparison in V1

---

# 🏗 Extraction Fields (PM Statements)

Minimum required:

- Property address
- Statement start date
- Statement end date
- Rent collected
- Total operating expenses
- Arrears indicator (if present)

If required fields missing → extraction fails.

No tenant names.
No ledger-level granularity.
No historical reconciliation.

---

# ⚠️ Partial Data Policy

- Always display statements received vs expected
- Always list missing properties
- Always show warning if incomplete
- Never assume missing equals zero rent without flagging

If <50% properties uploaded:

- Still generate report
- Strong incomplete warning

Transparency over perfection.

---

# Report Structure (Portfolio-First)

## Section 1 — Accountant Summary (Fixed Format)

Bullet-point numeric clarity:

- Properties Registered
- Statements Received (X / Y)
- Total Rent Collected
- Total Operating Expenses
- Total Mortgage (Fixed Monthly)
- Net Before Mortgage
- Net After Mortgage
- Per-property breakdown
- Flag section

Then nested per-property breakdown:

Per property:

- Rent
- Expenses
- Mortgage
- Net Cash Flow

Consistent format every month.

---

## Section 2 — AI Commentary

Single-month only.

- Expense anomalies within month
- Missing data warnings
- Cashflow observations

AI Rules:

- Never invent numbers
- Only reference parsed or user-entered data
- Clearly flag missing mortgage inputs
- No forecasting
- No quarter or cross-month comparisons

---

# Regeneration Rule

- One report per (user, month)
- Regenerating overwrites existing report
- No versioning in V1

---

# Data Model Principles

- All monetary values stored as integer cents
- Supabase Auth user ID used directly
- No separate users table
- Mortgage stored as fixed monthly value on property

Lean. Deterministic. End-to-end functional.

---

# Example Flow & Output

User uploads 7 PDFs.

System detects:

- February 2026 (1 properties)
- March 2026 (2 properties)

User selects:

> Generate March 2026 Report

Mortgage entered for 1/2 properties.

System generates:

## 🧾 March 2026 Portfolio Summary

### Accountant View

• Total Rent Collected: $12,400  
• Property Expenses: $3,250  
• Mortgage Payments: $6,800  
• Net Cash Flow: $3,350

⚠ Mortgage expense not included for 1 property.

---

**123 Smith St (Sydney)**

- Rent: $4,000
- Expenses: $900
- Mortgage: $2,100
- Net: $1,000

**8 George Ave (Brisbane)**

- Rent: $3,600
- Expenses: $1,050
- Mortgage: $0 _(Not Provided)_
- Net: $2,550

---

### AI Commentary

Expenses at 8 George Ave were 22% higher than February due to a once-off plumbing repair. Mortgage data is missing for one property, which may overstate actual cash flow.

Overall, your portfolio remains positively geared this month.

---
