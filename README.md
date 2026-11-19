# Cafe Management & Smart Billing System

A modern, fast, professional, and easy-to-use Cafe Management & Smart Billing Web Application built specifically for cafe owners.

Designed for speed, simplicity, and complete reliability, this application allows cafe owners and cashier staff to generate customer bills in seconds, automatically calculate daily sales, track expenses and profit, and maintain permanent, auditable historical records.

---

## 🚀 Key Features

### 1. Secure Authentication & Session Management
- **Owner Login**: Secure login with username/email and password.
- **Crypto-grade Security**: Passwords hashed using PBKDF2 with unique salts.
- **Session Persistence**: Persistent session tokens with "Remember session" support.
- **Access Control**: Only authenticated cafe owners can access records and POS.
- **Quick Demo Sign-in**: One-click demo credentials (`admin` / `admin123` or `owner` / `cafe123`).

### 2. Date Selection & Dynamic Dashboard
- **Instant Date Selector**: Defaults to the current date, with quick buttons for "Today", "Yesterday", or any previous date.
- **Real-Time Date Metrics**:
  - **Total Sales (₹)**: Real-time revenue for the selected date.
  - **Total Number of Bills**: Completed order count.
  - **Total Items Sold**: Total quantity of food/drink units sold.
  - **Average Bill Amount (₹)**: Revenue divided by completed bills.
- **Prominent POS CTA**: Instant "Create New Bill" button.
- **Date-Specific Logs**: Recent bills table, top selling items, and payment mode breakdown for that exact date.

### 3. Dual-Method Fast Billing Interface (Side-by-Side on One Screen)
- **Method 1: Fast Food Code Entry**:
  - Direct input field for food code (e.g. `11` = Pav Bhaji, `12` = Masala Pav, `13` = Vada Pav, `14` = Cold Coffee, `15` = Sandwich).
  - Instant live preview right below the code input showing item name, price, and category.
  - Pressing `Enter` adds the item immediately, resets quantity to 1, and refocuses for the next entry.
- **Method 2: Visual Menu Selection (Side-by-Side)**:
  - Interactive grid of food cards with code badges, item name, category tag, and price.
  - Instant live search filter by name, code, or category.
  - Category tabs with item count pills.
  - Click any card to instantly add 1 or increment quantity.
- **Interactive Billing Table**:
  - Columns: `Code`, `Food Item`, `Quantity`, `Price`, `Total`, `Delete`.
  - Stepper buttons `[-]` / `[+]`, direct quantity input editing, row deletion.
  - Adding an item again automatically increments its quantity instead of creating duplicate rows.
  - Real-time total calculation.

### 4. Customer Details & Finalize Bill
- **Optional Customer Phone**: Enter customer mobile number and name, or leave blank (never forced).
- **Totals Calculation**: Subtotal, optional discount (₹ flat discount), and Net Payable Amount.
- **Payment Modes**: Cash, UPI / QR, and Card.
- **Duplicate Prevention (Idempotency)**:
  - UI button locks with a processing indicator upon click.
  - Unique idempotency key sent with each bill session, ensuring multi-clicks cannot generate duplicate bills or double-charge sales.
- **Unique Bill Numbering**: Formatted sequentially per day (e.g., `BILL-20261119-0001`).
- **Timestamp & Historical Snapshot**: Records exact timestamp and permanently freezes the item price at the moment of billing.

### 5. Thermal Receipt Printing, WhatsApp Sharing & Text Download
- **Instant WhatsApp Digital Receipt**:
  - Automatically takes customer phone number entered during billing.
  - Generates a formatted digital receipt with bold titles, itemized breakdown, prices, subtotal, discount, and grand total.
  - One-click **"Send on WhatsApp"** button opens WhatsApp Web or the WhatsApp mobile app directly.
  - Also available for any past bill directly from the Bill History table with the `💬` button.
- **80mm Standard Thermal Receipt Template**:
  - Cafe Name, Address, Contact, GSTIN (optional).
  - Bill Number, Date, Time, Payment Mode.
  - Customer Mobile (if provided).
  - Clean dashed dividers, items table with quantity, price, and line total.
  - Subtotal, Discount, Final Payable, and Cafe Footer Message.
- **One-Click Printing**: Dedicated print stylesheet (`print.css`) that renders crisp black-and-white receipts for thermal POS receipt printers (80mm/58mm) or standard printers.
- **Download Receipt**: One-click download as a `.txt` receipt.

### 6. Mobile-First Responsive Design & Preview
- **Tailored for Smartphone Dimensions**: Full optimization for 360px – 430px mobile viewports (iPhone, Android).
- **Zero Text Overlapping**: Adaptive flexbox & CSS grid with touch-friendly spacing and dynamic typography scaling.
- **Mobile Bottom Navigation Bar**: Fixed bottom bar (`Home`, `POS`, `History`, `Sales`, `Profit`, `Menu`) for quick one-thumb navigation.
- **Mobile POS Mode Switcher**:
  - Switch between **Food Menu** and **Bill & Checkout** tabs.
  - Sticky floating cart indicator at the bottom: shows live item count & total (`🛒 3 items • ₹260.00  Review & Bill →`).
- **Off-Canvas Drawer**: Slide-out navigation drawer with touch backdrop.

### 6. Daily Sales Calculation
- Every finalized bill immediately increases the daily sales total.
- Chronological transaction log with bill number, time, items count, payment mode, and total.
- **Exclusion of Cancelled Bills**: Cancelled or voided bills are excluded from sales and revenue calculations.

### 7. Bill History & Transaction Records
- Search bills by bill number or customer phone number.
- Filter by date (Selected Date, All Dates, Today, Yesterday) and status (Completed, Cancelled).
- Full receipt modal view for any previous bill.
- Ability to void/cancel a bill with a recorded reason.

### 8. Settings & Food Menu Management
- **Menu Item CRUD**: Add, edit, delete, or toggle availability (Active/Inactive) of food items.
- **Unique Code Enforcement**: Client and database-level validation to prevent duplicate food codes.
- **Historical Price Protection**: When an item price is updated in Settings, all *future* bills use the new price while *past bills permanently retain their original prices*.
- **Category Management**: Create and manage menu categories.
- **Cafe Profile Customization**: Update cafe name, phone, address, GSTIN, receipt footer, and change owner password.

### 9. Profit & Expense Tracking
- **Expense Recording**: Enter daily expenses with category (Food ingredients, Staff salaries, Electricity, Rent, Gas & Fuel, Packaging, Maintenance, Other), amount, description, and date.
- **Net Profit Formula**: `Net Profit = Total Sales - Total Expenses`.
- **Strict Accuracy Rule**: If expenses have *not* been recorded for a date, net profit is displayed as **"Unavailable"** (with an informative alert) rather than assuming it equals revenue (avoiding false 100% margin calculations).
- Recalculates dynamically as expenses or bills are added or deleted.

---

## 🛠️ Architecture & Tech Stack

- **Runtime**: Node.js (v20+ / v24+)
- **Database**: SQLite via Node's native `node:sqlite` (`DatabaseSync`), configured with WAL mode (`PRAGMA journal_mode = WAL`) and foreign key constraints.
- **Backend**: Native Node HTTP server (`node:http`), WHATWG URL routing, PBKDF2 cryptography (`node:crypto`), and session cookie authentication. Zero external npm build dependencies.
- **Frontend**: Vanilla HTML5, modern semantic CSS (custom POS theme, responsive grid/flexbox, CSS variables), and reactive client modules. Zero external CDN dependencies (works 100% offline).
- **Print Engine**: Dedicated `@media print` thermal styling (`/css/print.css`) formatted for 80mm/58mm thermal printers.

---

## 📂 Project Directory Structure

```
.
├── data/
│   └── cafe.db                 # SQLite database (auto-created on first run)
├── src/
│   ├── db/
│   │   ├── database.js         # SQLite connection, schema, seeding
│   │   ├── auth.js             # Owner authentication & password hashing
│   │   ├── menu.js             # Menu items CRUD & category management
│   │   ├── bills.js            # Bill creation, line item snapshots, idempotency
│   │   ├── sales.js            # Daily sales calculations & aggregations
│   │   └── expenses.js         # Expense recording & profit calculations
│   ├── api/
│   │   └── router.js           # REST API routing & request handlers
│   └── public/
│       ├── index.html          # Single Page Application shell & layout
│       ├── css/
│       │   ├── style.css       # Modern POS design system & color theme
│       │   └── print.css       # Thermal receipt print styles (80mm)
│       └── js/
│           ├── api.js          # Client API client
│           ├── state.js        # Reactive state, formatters, toasts, modals
│           ├── pos.js          # Dual-entry billing (Method 1 + Method 2)
│           ├── dashboard.js    # Sales dashboard & dynamic calculations
│           ├── history.js      # Bill history, search, and voiding
│           ├── menu-mgmt.js    # Food menu management & price updates
│           ├── daily-sales.js  # Daily sales breakdown
│           ├── profit.js       # Profit & daily expense tracking
│           ├── settings.js     # Cafe profile & categories
│           └── app.js          # App initialization & navigation
├── test/
│   ├── test-suite.js           # Automated verification test suite (13 scenarios)
│   └── router-test.js          # Controller & API integration tests
├── server.js                   # Application server entry point
└── package.json
```

---

## ⚡ Quick Start

### 1. Start the Application

```bash
npm start
```
The server will start at:
```
http://localhost:3000
```
*(If port 3000 is occupied, it automatically falls back to port 3001 or higher).*

### 2. Default Login Credentials

| Username | Password | Role |
| :--- | :--- | :--- |
| `admin` | `admin123` | Cafe Administrator |
| `owner` | `cafe123` | Cafe Owner |

*(You can also click the quick demo buttons on the login card).*

### 3. Run the Automated Verification Suite

To verify all 16 prompt scenarios, database persistence, duplicate bill prevention, price freeze integrity, and profit calculations:

```bash
npm test
```

---

## 🧪 Verification Scenarios Tested

The test suite (`npm test`) programmatically verifies:
1. Owner logs in successfully with valid credentials.
2. Owner selects today's date (defaults to current date).
3. Owner enters food code `11` -> auto-fetches Pav Bhaji @ ₹100.
4. Line total calculation for Pav Bhaji with quantity 2 (₹200).
5. Owner selects another food item from visual menu (Vada Pav code `13` @ ₹20, qty 3).
6. Combined subtotal updates correctly (₹260).
7. Owner enters optional customer mobile number and ₹10 discount (payable ₹250).
8. Owner generates the bill -> saved with unique bill number, timestamp, and item snapshots.
9. Duplicate bill prevention: repeating generation with same idempotency key returns existing bill without double-counting.
10. Daily sales total automatically increases by ₹250.
11. Owner generates multiple bills -> all visible in Bill History.
12. Owner selects yesterday's date -> views isolated historical sales.
13. Menu price update in Settings -> new bills use updated price (₹120) while old bills permanently retain original price (₹100).
14. Profit tracking: when expenses are not recorded, net profit is marked as "Unavailable".
15. Profit tracking: when daily expenses are recorded, `Net Profit = Total Sales - Total Expenses`.
16. Food code uniqueness is strictly enforced on creation and update.

