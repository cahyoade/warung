# Warung POS 🏪

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Built with Expo](https://img.shields.io/badge/Built%20with-Expo-000020?logo=expo)](https://expo.dev)
[![Platform: Android](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android)](https://android.com)

An offline-first, high-performance Point of Sale (POS) system built with React Native (Expo) and SQLite. Designed specifically for small convenience stores (Warungs) running entirely on local Android devices with zero recurring server costs.

---

## ✨ Features

- **Offline-First** — Powered entirely by a local `expo-sqlite` database. No internet required to check out customers or track inventory.
- **Dynamic Wholesale Pricing** — Set up pricing tiers (e.g., 1 pc = Rp 3,000 / 5 pcs = Rp 2,500). The cart automatically applies the best price as quantities increase.
- **Barcode Scanner** — Scan product barcodes using the device camera to instantly find and add items to the cart.
- **Fractional Quantities** — Supports weight/volume-based products (kg, g, liter, etc.) with a quick-select or custom quantity modal.
- **Cart Modification** — Adjust item quantities or remove items directly from the cart before checkout.
- **Kasbon (Debt) Tracking** — Check out customers using "Pay Later". The system tracks unpaid debts per customer and supports partial or full settlement.
- **Debt Settlement** — Distribute repayments across oldest unpaid transactions automatically, with loyalty points awarded on settlement.
- **Profit Analytics** — Tracks historical net profit with cost prices locked at transaction time, so fluctuating distributor prices never distort your reports.
- **Loyalty Program** — Auto-calculates reward points (e.g., 1 point per Rp 10,000 spent).
- **Thermal Printer Ready** — ESC/POS receipt builder with native Bluetooth support via `react-native-thermal-receipt-printer`.
- **Google Sheets Backup** — Raw REST export to push your local SQLite data directly to Google Drive (zero infrastructure).

---

## 🚀 Getting Started

### Prerequisites

1. Install [Node.js](https://nodejs.org/en) (LTS version recommended)
2. Install the EAS CLI: `npm install -g eas-cli`
3. Create a free account at [expo.dev](https://expo.dev)

### 1. Clone & Install

```bash
git clone https://github.com/cahyoade/warung.git
cd warung
npm install
```

### 2. Development Build (Recommended)

Because this app uses native modules (camera, Bluetooth), it requires a **custom development build** — Expo Go is not supported.

```bash
# Log into Expo Application Services
eas login

# Trigger a cloud development build for Android
eas build --profile development --platform android
```

Once the build finishes, download and install the `.apk` on your Android device. Then start the JS bundler:

```bash
npx expo start --dev-client
```

Scan the QR code from the installed dev app — the app will load and hot-reload as you make changes.

> **Note:** Whenever you install a new package with native code, you must trigger a new EAS build before that module is available at runtime.

### 3. Production Build

When ready to deploy to your store's device:

```bash
eas build --profile preview --platform android
```

Expo will provide a download link for the `.apk`. Transfer it to your Android device and install it.

---

## 🛠 Advanced Features Setup

### Bluetooth Thermal Printing

Receipt formatting is encapsulated in `src/utils/PrinterService.ts`.

1. Pair your Android device with your 58mm/80mm thermal printer via Android Bluetooth Settings.
2. The app uses `react-native-thermal-receipt-printer` — already included in dependencies.
3. Connect to the printer via the **Settings** screen inside the app.

### Google Sheets Cloud Backup

To activate cloud backup without a server:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. Enable the **Google Sheets API**.
3. Create an **OAuth Client ID** (Type: Web Application) under Credentials.
4. Use `expo-auth-session` or `@react-native-google-signin/google-signin` to obtain an `AccessToken`.
5. Pass the token to `SyncService.syncTransactionsToGoogleDrive()` to push data to your personal Google Drive.

---

## 🗂 Project Structure

```
warung/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Bottom tab screens (POS, Inventory, Reports, Settings)
│   ├── checkout.tsx      # Cart checkout & payment screen
│   ├── add-product.tsx   # Add new product
│   ├── edit-product.tsx  # Edit existing product
│   ├── settle-debt.tsx   # Customer debt settlement
│   └── ...
├── src/
│   └── utils/
│       └── PrinterService.ts   # ESC/POS receipt builder
├── assets/               # Icons, splash screens
├── eas.json              # EAS Build profiles
└── app.json              # Expo app configuration
```

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0**.
See the [LICENSE](./LICENSE) file for full details.

> You are free to use, modify, and distribute this software under the terms of the GPL v3. Any derivative work must also be distributed under the same license.
