# System Architecture & Technical Design

## MerchOps AI — Financial Operations Copilot

> [!IMPORTANT]
> **Implementation Status (Milestone 5 Working Prototype)**:
> - **Runway Engine**: Implemented & verified via automated tests (100% deterministic integer cents).
> - **Collections Workflow**: Implemented (OpenRouter reminder drafting with honest fallback, staging drawer, payment simulation).
> - **Payouts Engine**: Implemented & verified (two-step approval, reserve floor guardrails, idempotency keys, strict Sandbox URL lockdown, simulation rail tested, live Sandbox dispatch unverified).
> - **Audit Trail**: Implemented in-memory demo repository with comprehensive action tagging.
> - **Persistence & Webhooks**: Currently runs on an in-memory repository for prototype evaluation; PostgreSQL persistence and live webhook verification are planned for production rollout.

---

## 1. High-Level Architecture

MerchOps AI uses a modular Next.js App Router architecture with strict security boundaries separating the AI reasoning engine, the deterministic financial core, the PostgreSQL ledger, and PayPal external services.

```mermaid
flowchart TD
    subgraph Client["Merchant Client (Browser)"]
        UI["Next.js App / React / Tailwind"]
        Grid["AG Grid (Invoices & Bills)"]
        Studio["AG Studio Financial Cockpit"]
    end

    subgraph App["Next.js App Router Backend"]
        Auth["Auth & Tenant Guard"]
        RunwayEng["Runway Engine (Deterministic Math)"]
        CollEng["Collections Engine (Staging Area)"]
        PayoutEng["Payouts Engine (Reserve Checker)"]
        WebhookHandler["PayPal Webhook Receiver (HMAC/Cert Verify)"]
        AuditService["Immutable Audit Trail Service"]
    end

    subgraph AI["AI Layer (Strict Isolation)"]
        OpenRouter["OpenRouter Gateway\n(Claude 3.5 Sonnet)"]
        Sanitizer["Prompt Sanitizer\n(Zero Secrets, Redacted PII)"]
    end

    subgraph Data["PostgreSQL Database (Render)"]
        Ledger["Accounts & Ledger (Integer Cents)"]
        Receivables["Invoices & Bills"]
        AuditDB["Audit Log (Append-Only)"]
        WebhookDedupe["Webhook Event Log (Idempotency)"]
    end

    subgraph PayPal["PayPal Sandbox Services"]
        PPInvoicing["PayPal Orders / Invoicing API"]
        PPPayouts["PayPal Payouts API"]
        PPWebhooks["PayPal Webhook Delivery"]
    end

    %% Client Interactions
    UI --> Auth
    Grid --> Auth
    Studio --> Auth

    %% Application Core
    Auth --> RunwayEng
    Auth --> CollEng
    Auth --> PayoutEng
    Auth --> WebhookHandler

    %% Deterministic Engine Data Access
    RunwayEng --> Ledger
    CollEng --> Receivables
    PayoutEng --> Ledger
    PayoutEng --> Receivables
    WebhookHandler --> WebhookDedupe
    WebhookHandler --> Ledger

    %% AI Integration (Sanitized Only)
    CollEng --> Sanitizer
    Sanitizer --> OpenRouter
    OpenRouter -.->|Draft text only| CollEng

    %% Outbound Actions (Strict Human-in-the-Loop)
    CollEng -->|Merchant Approved| PPInvoicing
    PayoutEng -->|Merchant Approved + Reserve Check| PPPayouts

    %% Inbound Webhooks
    PPWebhooks --> WebhookHandler

    %% Audit Log
    CollEng -.-> AuditService
    PayoutEng -.-> AuditService
    WebhookHandler -.-> AuditService
    AuditService --> AuditDB
```

---

## 2. Core Modules

### 2.1 Runway Engine (Deterministic Cash Flow)
- **Principle**: Zero LLM involvement in arithmetic or forecasting.
- **Inputs**:
  - Current cleared cash balance (integer cents).
  - Confirmed receivables (invoices due within 30 days, weighted by payment probability).
  - Confirmed payables (bills due within 30 days).
  - Configured merchant safety reserve (`min_reserve_cents`).
- **Algorithm**:
  $$\text{Balance}(d) = \text{Balance}(d-1) + \text{Inflows}(d) - \text{Outflows}(d)$$
  Where $d \in [1, 30]$ days.
- **Breach Detection**: If $\min_{d \in [1, 30]} \text{Balance}(d) < \text{min\_reserve\_cents}$, trigger a **Reserve Breach Alert** indicating the exact date and projected deficit.

### 2.2 Collections Engine (Human-in-the-Loop AR)
- **Invoice Aging**: Categorizes unpaid invoices (Current, 1–15d, 16–30d, 30d+).
- **Drafting Workflow**:
  1. Overdue invoice is selected.
  2. Prompt Sanitizer packages only: customer name, invoice amount (formatted string), invoice date, due date, item description.
  3. OpenRouter generates a structured tone-appropriate reminder email.
  4. The draft is placed into an interactive **Staging Area**.
  5. The merchant can edit, discard, or approve the draft.
  6. Upon approval, the reminder is dispatched with a direct PayPal Sandbox payment link.

### 2.3 Payouts Engine (Reserve-Safe AP)
- **Liquidity Simulation**: Before scheduling any vendor payout:
  $$\text{Projected Min Balance} = \min_{d} \left(\text{Balance}(d) - \text{Payout Amount}\right)$$
  If $\text{Projected Min Balance} < \text{min\_reserve\_cents}$, the action is blocked or flagged with an explicit liquidity warning.
- **Two-Step Authorization**:
  - Merchant must review the payout details on a dedicated modal.
  - Merchant clicks "Authorize & Disburse".
  - Backend attaches a unique `Idempotency-Key` (UUIDv4) and calls PayPal Sandbox Payouts API.

---

## 3. Financial Integrity & Security Architecture

### 3.1 Integer Cents Representation
- All currency values across the system are stored and calculated as 64-bit integers (`BIGINT` in PostgreSQL).
- Example:
  - `$1.00` = `100` cents
  - `$10,500.50` = `1050050` cents
- Conversion to display strings happens strictly at the UI boundary using localized formatting functions.

### 3.2 Secret Isolation & Prompt Sanitization
- API keys, PayPal client secrets, and database connection strings exist exclusively in server-side environment variables.
- The AI context builder (`sanitizer.ts`) strips any sensitive credentials or irrelevant merchant data before calling OpenRouter.
- The AI has no tool or API capability to initiate network calls to PayPal or modify database records.

### 3.3 Webhook Verification & Replay Protection
- Inbound PayPal webhooks are posted to `/api/webhooks/paypal`.
- Verification flow:
  1. Extract headers: `paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`.
  2. Verify webhook signature against PayPal Sandbox API verification endpoint.
  3. Query `webhook_events` table for `transmission_id`. If exists, return `200 OK` immediately (idempotent skip).
  4. If new, wrap ledger update and event record creation in a single PostgreSQL transaction.

### 3.4 Immutable Audit Logging
- Every critical event produces an append-only entry in `audit_logs`:
  - `actor_id` (User ID or 'SYSTEM')
  - `action` (`DRAFT_GENERATED`, `DRAFT_APPROVED`, `PAYMENT_RECEIVED`, `PAYOUT_REQUESTED`, `PAYOUT_EXECUTED`)
  - `entity_type` and `entity_id`
  - `payload_snapshot` (JSONB)
  - `created_at` (Timestamp)

---

## 4. Entity Relationship Model (Conceptual)

```mermaid
erDiagram
    MERCHANT ||--o{ ACCOUNT : owns
    MERCHANT ||--o{ INVOICE : issues
    MERCHANT ||--o{ BILL : owes
    MERCHANT ||--o{ AUDIT_LOG : records
    ACCOUNT ||--o{ LEDGER_ENTRY : contains
    INVOICE ||--o{ PAYMENT : settles
    BILL ||--o{ PAYOUT : dispatches

    MERCHANT {
        uuid id PK
        string business_name
        string email
        bigint min_reserve_cents
        timestamp created_at
    }

    ACCOUNT {
        uuid id PK
        uuid merchant_id FK
        string name
        string account_type
        bigint balance_cents
        timestamp updated_at
    }

    LEDGER_ENTRY {
        uuid id PK
        uuid account_id FK
        string entry_type
        bigint amount_cents
        string description
        string idempotency_key UK
        timestamp posted_at
    }

    INVOICE {
        uuid id PK
        uuid merchant_id FK
        string customer_name
        string customer_email
        bigint amount_cents
        date due_date
        string status
        string paypal_invoice_id
    }

    BILL {
        uuid id PK
        uuid merchant_id FK
        string vendor_name
        bigint amount_cents
        date due_date
        string status
    }

    AUDIT_LOG {
        uuid id PK
        uuid merchant_id FK
        string actor
        string action
        jsonb metadata
        timestamp created_at
    }
```

