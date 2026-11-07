# MerchOps AI — Design System & UI Specification

> **Aesthetic**: Premium financial terminal engineered for clarity, density, and institutional trust.  
> **Standards**: WCAG 2.2 AA compliant, responsive to 390px mobile viewports, prefers-reduced-motion safe.

---

## 1. Design Tokens

### Color Palette
- **Brand Navy**: `#1e293b` (Slate 800) / `#0f172a` (Slate 900)
- **Primary Financial Action**: `#2563eb` (Blue 600) / Hover: `#1d4ed8` (Blue 700)
- **Positive Inflow / Settled**: `#059669` (Emerald 600) / Background: `#ecfdf5` (Emerald 50)
- **Overdue / Reserve Breach Warning**: `#dc2626` (Rose 600) / Background: `#fff1f2` (Rose 50)
- **AI Intelligence / Copilot**: `#4f46e5` (Indigo 600) / Background: `#eef2ff` (Indigo 50)

### Typography
- **Primary Interface**: Inter / System Sans-serif (`font-sans`)
- **Monetary & Cryptographic Data**: Monospace font stack (`font-mono`) for all dollar amounts, PayPal IDs, batch hashes, and dates.

---

## 2. AG Grid Institutional Density Specification

- **Theme**: Custom `merchOpsTheme` integrating Tailwind slate neutrals with AG Grid Community 36.
- **Header Height**: `44px` with clear sort and filter indicators.
- **Row Height**: `64px` allowing multi-line metadata (Customer Name + Billing Email, Invoice Number + Line Item Description).
- **Overlays**: Custom branded empty-state overlays.
- **Action Buttons**: Compact inline controls (`Remind`, `Pay on PayPal`, `Simulate`) preventing horizontal overflow.

---

## 3. Responsive Breakpoints

- **Mobile (390px - 640px)**: Single column stack, compact card layouts, floating bottom tour guide (`DemoTour`).
- **Tablet (641px - 1024px)**: Dual column layouts with horizontal scroll tables.
- **Desktop (1025px+)**: 7-column runway timeline grid, dense AG Grid views, side-by-side plan comparisons.

---

## 4. Interaction States & Transitions

- **Active State**: Micro-interactions with `active:scale-95` on interactive buttons.
- **Focus Rings**: Dual-layer focus ring (`focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`).
- **Loading Indicators**: Accessible spinners with `sr-only` aria labels.
- **Reduced Motion**: Full support for users with vestibular sensitivities via CSS `prefers-reduced-motion: reduce`.

