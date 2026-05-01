# PortfolioOS

**Command centre for residential property investors**

> This document defines the product, user, and design principles for PortfolioOS.  
> It should be read before making product, UX, or design decisions.

---

# 1. Product Vision

PortfolioOS is a **centralised decision layer** for residential property investors.

It consolidates fragmented financial data, surfaces what matters, and provides
clarity on portfolio performance—without requiring perfect inputs or complex setup.

The goal is not to replace every tool (email, property managers, accountants),
but to become the **system of clarity and control** investors rely on.

> A place where an investor can answer:
>
> - “Am I okay?”
> - “What needs attention?”
> - “What should I do next?”

---

# 2. Target User

**Primary user:**
Residential property investors with **2–6 properties** who already:

- Use spreadsheets to track performance
- Rely on email + property managers for operations
- Care about cashflow, leverage, and long-term growth

**Characteristics:**

- Analytical, but not necessarily technical
- Skeptical of black-box financial tools
- Comfortable with numbers, but frustrated by fragmentation
- Time-constrained and mentally overloaded

**Not the target (for now):**

- First-time investors (too early)
- Large-scale / commercial investors (too complex)
- Fully passive investors (low engagement)

---

# 3. Core Problems

### 1. Fragmented Information

- Financials in spreadsheets
- Documents in folders
- Communication in email
- No single source of truth

---

### 2. Unclear Portfolio Health

- Hard to quickly answer:
  - Am I positively or negatively geared?
  - Is performance improving or declining?
- Requires manual aggregation

---

### 3. Poor Property Comparability

- No consistent way to evaluate:
  - Yield
  - Cashflow
  - Expense ratios
- Difficult to identify underperformers

---

### 4. Hidden Financial Drift

- Expenses creep up unnoticed
- Rent inconsistencies go unchecked
- Small issues compound over time

---

### 5. Cognitive Overhead

- Investors mentally track:
  - Tasks
  - Follow-ups
  - Lease events
- No structured system for visibility

---

# 4. Product Principles

### 1. Clarity over Completeness

Start useful with partial data.  
Avoid requiring perfect inputs.

---

### 2. Decision-Oriented, Not Data-Oriented

Every screen answers a question.  
No raw data dumps without purpose.

---

### 3. Surface What Matters

Highlight:

- Changes
- Outliers
- Risks

Not just totals.

---

### 4. Progressive Depth

- High-level overview first
- Drill-down when needed

---

### 5. Investor-Controlled

- No forced integrations
- No opaque calculations
- Transparent assumptions

---

### 6. Calm and Trustworthy

- No hype
- No noise
- No unnecessary complexity

---

# 5. Brand Direction

## Core Theme

> **Calm control over complex assets**

---

## Tone

- Rational
- Measured
- Analytical
- Quietly confident

**Avoid:**

- Hype-driven fintech language
- Trading/gambling energy
- Over-promising automation

---

## Voice Examples

**Do:**

- “Net cashflow is down 8% this month”
- “Property 3 has the highest expense ratio”

**Don’t:**

- “Your portfolio is crushing it 🚀”
- “Maximise your wealth now!”

---

## Visual Principles

### 1. Structured Density

- Information-rich, but organised
- No clutter or visual chaos

---

### 2. Hierarchy First

- Typography and spacing drive attention
- Colour is secondary

---

### 3. Neutral Foundation

- UI recedes into background
- Data is the focus

---

### 4. Subtle Emphasis

- Use colour sparingly:
  - Green = positive
  - Red = negative
  - Neutral = default

---

## Colour Direction (Initial)

- Background: off-white or dark slate
- Text: near-black / high contrast
- Accent: muted blue or green

---

## Typography

- Clean, modern sans-serif (e.g. Inter)
- Strong weight hierarchy:
  - Bold for key metrics
  - Regular for supporting data

---

## Layout Feel

- Card-based structure
- Generous spacing
- Clear grouping of information

---

# 6. UX Foundations

## Core Mental Model

PortfolioOS is not:

- a spreadsheet replacement
- a reporting tool

It is:

> **a decision surface for investors**

---

## Primary Questions the Product Must Answer

1. **Am I okay?**
   - Portfolio health
   - Cashflow
   - Risk

2. **What needs attention?**
   - Alerts
   - anomalies
   - underperformance

3. **Which property matters most right now?**
   - Comparison
   - ranking
   - outliers

---

## Key UX Principles

### 1. One Screen = One Question

Each view must have a clear purpose.

---

### 2. Start Useful, Then Improve

- Allow incomplete data
- Show value immediately
- Encourage refinement over time

---

### 3. Highlight Change

- Trends > snapshots
- Movement > static numbers

---

### 4. Guide Attention

- Don’t show everything equally
- Direct focus to what matters

---

### 5. Support Imperfect Data

- Use:
  - “Estimated”
  - “Partial”
  - “Complete”

---

# 7. What Sets PortfolioOS Apart

- Built for **real investor workflows**, not idealised ones
- Accepts **messy, incomplete data**
- Focuses on **decisions, not bookkeeping**
- Bridges **financial insight + operational awareness**

---

# 8. Scope Discipline (Important)

PortfolioOS is **not trying to be:**

- Accounting software
- Property management software
- A fully automated aggregator

It is:

> The layer that makes sense of everything else
