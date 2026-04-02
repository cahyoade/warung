# Warung POS 🏪

An offline-first, high-performance Point of Sale (POS) system built with React Native (Expo) and SQLite. Designed specifically for small convenience stores (Warungs) running entirely on local Android devices with zero recurring server costs.

## Features
- **Offline-First**: Powered entirely by a local `expo-sqlite` database. No internet required to check out customers or track inventory.
- **Dynamic Wholesale Pricing**: Setup pricing tiers (e.g., 1 pc = Rp 3000, 5 pcs = Rp 2500). The cart automatically reduces the subtotal as quantities increase.
- **Kasbon (Debt) Tracking**: Check out customers using "Pay Later". The system automatically aggregates unpaid debts and flags them next to the customer's name.
- **Profit Analytics**: Accurately tracks Historical Net Profit. Cost prices are locked in at the exact time of the transaction, ensuring fluctuating distributor prices don't ruin your reports.
- **Loyalty Program**: Auto-calculates points (e.g. 1 point for every Rp 10,000 spent).
- **Google Sheets Backup**: Raw REST algorithm to export your local SQLite data directly to your personal Google Drive (Zero-infrastructure).
- **Thermal Printer Ready**: ESC/POS syntax builder ready to plug-and-play with Native Bluetooth Drivers.

---

## 🚀 How to Setup & Run

### Prerequisites
1. Install [Node.js](https://nodejs.org/en) (LTS version recommended)
2. Install the Expo CLI globally: `npm install -g eas-cli`
3. Download the **Expo Go** app on your physical Android phone (available on Google Play Store).

### 1. Installation
Clone the repository and install all dependencies:
```bash
# Navigate into the project folder
cd warung

# Install node modules
npm install
```

### 2. Running Locally (Development)
Because the current app uses standard Expo SDK modules (including `expo-sqlite` which works natively in Expo Go starting SDK 50+), you can immediately test the app on your phone without Android Studio!

```bash
# Start the Expo Bundler
npx expo start
```
* A QR Code will appear in your terminal.
* Open the **Expo Go** app on your phone and scan the QR code.
* The app will instantly load and hot-reload as you make changes to the code.

### 3. Building the Final APK (Production)
When you are ready to permanently install the app on your store's tablet or phone (or if you install Custom Native Bluetooth plugins), you must compile it into a standalone `.apk`.

```bash
# Log into Expo Application Services (Free)
eas login

# Build the Android APK in the cloud
eas build -p android --profile preview
```
Once the build finishes, Expo will give you a link to download the `.apk` file. Transfer it to your Android device and install it!

---

## 🛠 Advanced Features Setup

### Google Sheets Cloud Backup (Phase 6)
To activate the cloud backup without paying for a server:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a New Project.
3. Search for "Google Sheets API" and **Enable** it.
4. Go to **Credentials** -> Create **OAuth Client ID** (Type: Web Application).
5. Pass this credential into a Google Sign-In package (like `@react-native-google-signin/google-signin` or `expo-auth-session`) to obtain an `AccessToken`.
6. Pass the `AccessToken` to `SyncService.syncTransactionsToGoogleDrive()` to instantly push your database to your personal Google Drive!

### Bluetooth Thermal Printing (Phase 5)
The receipt format logic is encapsulated in `src/utils/PrinterService.ts`. 
To actually pipe this data to your hardware:
1. Pair your Android device with the 58mm/80mm thermal printer in standard Android Bluetooth Settings.
2. Install a Native library (e.g., `react-native-thermal-receipt-printer`).
3. Pass the generated string from `PrinterService.buildReceiptFormat()` directly to the printer's write command. 
*(Note: Installing native Bluetooth libraries requires moving away from Expo Go and using an Expo Custom Dev Client `./android` folder).*
