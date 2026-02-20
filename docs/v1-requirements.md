# Portfolio Monthly Summary - V1

## 🎯 Objective

Provide individual Australian property investors (2–10 properties) with a clear, transparent monthly portfolio summary generated from uploaded PM PDF statements, with optional manual mortgage inputs.

Optimised for:

- Speed to launch
- Minimal user effort
- Transparency & predictability

## Positioning

- Modern, mobile-first productivity tool for property investors
- Monthly clarity artifact (not full accounting software)
- Transparency and predictability > automation magic
- Portfolio-first. Properties nested inside.

---

# 📦 Scope (V1)

## 🚀 In Scope

- Web portal (mobile-first UI)
- Multi-property support
- Single or bulk PDF upload (Property Manager statements)
- Manual mortgage entry (optional)
- Monthly portfolio summaries
- Support multiple months
- On-demand report generation (user-triggered)
- Accountant-style summary + AI commentary

## Out of Scope (Fast Follow)

- Loan/mortgage PDF parsing
- Email ingestion
- Bank integrations
- Automated reminders
- Interest vs principal tracking
- Tax reporting
- Multi-user or accountant access

## Inputs

### Onboarding (One-Time)

- Property address (required)
- Monthly mortgage payment per property (optional, manual amount)
  - Note properties can have 0–many loans (but V1 = single total monthly payment field)
- If left blank:
  - Treated as $0
  - Explicitly flagged in report

### Monthly Usage

- User selects month (e.g. March 2026)
- User uploads PM PDF statements (single or batch upload)

---

## Output

For each selected month:

### 1️⃣ Accountant Section (Deterministic Format)

- Properties Registered
- Statements Received (X / Y)explicit list)
- Total Rent Collected
- Total Operating Expenses
- Total Mortgage (Manual)
- Net Before Mortgage
- Net After Mortgage
- Average Per Property (based on received statements)
- Per-property breakdown
- Flag section

Structure is fixed and consistent every month.

### 2️⃣ AI Commentary Section (Optional Narrative)

- Portfolio health commentary
- Month-on-month comparison
- Performance concentration insights
- Expense anomalies
- Limited commentary if data incomplete
- Missing data warnings
- Cashflow risk observations

AI does NOT calculate numbers.
AI only interprets backend-calculated metrics.

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

# 🔄 Upload & Generation Flow

1. User uploads one or multiple PDFs
2. System extracts:
   - Property address
   - Statement period
   - Key financial fields
3. System groups by month
4. User explicitly triggers report generation
5. Summary generated

No automatic report generation on upload.

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

# 🏁 Definition of Done (V1)

Selects month →
User uploads PM PDFs →
Receives structured portfolio summary →

Understands:

- True monthly cashflow
- Missing statements
- Negative properties
- Major risk flags

Delivered clearly, consistently, and conservatively.

---

# Example Output

## 🧾 March 2026 Portfolio Summary

### Accountant View

• Total Rent Collected: $12,400  
• Property Expenses: $3,250  
• Mortgage Payments: $6,800  
• Net Cash Flow: $2,350

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

⚠ Mortgage expense not included for 1 property.

---

### AI Commentary

March was your strongest month this quarter, primarily driven by full rent collection across all properties.

Expenses at 8 George Ave were 22% higher than February due to a once-off plumbing repair. Mortgage data is missing for one property, which may overstate actual cash flow.

Overall, your portfolio remains positively geared this month.

---
