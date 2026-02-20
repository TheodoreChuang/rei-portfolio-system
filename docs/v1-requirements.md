# Portfolio Monthly Summary - V1

## 🎯 Objective

Provide individual Australian property investors (2–10 properties) with a clear, transparent monthly portfolio summary generated from uploaded PM PDF statements, with optional manual mortgage inputs.

Optimised for:

- Speed to launch
- Minimal user effort
- Transparency & predictability

## Positioning

- Modern, mobile-first productivity tool for property investors
- Monthly portfolio clarity artifact
- Portfolio-first. Properties nested inside.
- Transparency and predictability as core principles

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
- Manual mortgage entry (optional)
- Monthly portfolio report generation
- Support for generating multiple months (but report generated individually)
- On-demand report generation (user-triggered)
- Accountant-style summary + AI commentary
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

---

# 📍 UX Flow

1. Landing Page: Clear positioning.
2. Account Creation
3. Onboarding:

- Add Properties
- Address + mortgage amount.

4. Ongoing:

- Upload Page. Drag-and-drop zone.

## Onboarding (One-Time)

- Property address (required)
- Monthly mortgage payment per property (optional, manual amount)
  - Note properties can have 0–many loans (but V1 = single total monthly payment field)
- If left blank:
  - Treated as $0
  - Explicitly flagged in report

## Monthly Usage

- User selects month (e.g. March 2026)
- User uploads PM PDF statements (single or batch upload)

---

# 🧮 Calculation Rules

- Month determined by **statement end date**
- Multiple statements in same month → summed
- If property has no statement:
  - Mortgage still included (conservative rule)
  - Rent assumed zero
  - Explicitly flagged as missing
- No estimation or auto-fill of missing data
- No projections or smoothing

---

# Upload & Generation Flow

## Step 1 — Upload

- User uploads multiple PM PDFs (any month)
- System parses and extracts:
  - Property
  - Statement end date
  - Financial values
- System groups statements by calendar month

## Step 2 — Month Detection

System displays:

> We detected statements for:
>
> - February 2026 (3 properties)
> - March 2026 (5 properties)

User selects month to generate.

## Step 3 — Mortgage Input (Optional)

Per property:

- Manual monthly mortgage payment field
- If blank → treated as $0
  - Clearly flagged in report

## Step 4 — Generate Report

User explicitly clicks:

> Generate March 2026 Portfolio Summary

Reports are:

- Versioned
- Immutable once generated (new version if regenerated)

---

# 🏗 Extraction Fields (PM Statements)

Minimum required:

- Property address
- Statement start date
- Statement end date
- Rent collected
- Total operating expenses
- PM fees
- Maintenance expenses
- Arrears indicator (if present)

No tenant names.
No ledger-level granularity.
No historical reconciliation.

---

# ⚠️ Partial Data Policy

- Always display statements received vs expected
- Always list missing properties
- Always show warning if incomplete
- Never assume missing equals zero rent without flagging
- Never hide incomplete status

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
- Total Mortgage (Manual)
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

## Section 2 — AI Commentary

Optional narrative layer:

- Month-on-month comparison (if prior data exists)
- Expense anomalies
- Cashflow signals
- Missing data warnings
- Observations based only on extracted data

AI Rules:

- Never invent numbers
- Only reference parsed or user-entered data
- Clearly flag missing mortgage inputs
- No speculative forecasting in V1

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

March was your strongest month this quarter, primarily driven by full rent collection across all properties.

Expenses at 8 George Ave were 22% higher than February due to a once-off plumbing repair. Mortgage data is missing for one property, which may overstate actual cash flow.

Overall, your portfolio remains positively geared this month.

---
