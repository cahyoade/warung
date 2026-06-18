import { Alert, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BLEPrinterDirect, isNativeModuleAvailable } from './BLEPrinterModule';

// MPT-II (58mm) = 48mm printable width = 384 dots = 32 chars (Font A, 12x24)
const LINE_WIDTH = 32;

/**
 * Determine if a Bluetooth device is likely a printer based on its Android Bluetooth Class
 * and a fallback check on the device name.
 */
function isDevicePrinter(device: any): boolean {
    // Check Bluetooth Class:
    // Major 1536 is IMAGING
    // Device 1664 is IMAGING_PRINTER, 1776 is IMAGING_PRINTER_SCANNER
    const isPrinterClass =
        device.major_class === 1536 &&
        (device.device_class === 1664 || device.device_class === 1776);

    if (isPrinterClass) return true;

    // Fallback to name keyword check for misclassified printer devices
    const name = (device.device_name || '').toLowerCase();
    const printerKeywords = ['print', 'mpt', 'rpp', 'pos', 'thermal', 'spp', 'xp-', 'mtp', 'goojprt'];
    return printerKeywords.some(keyword => name.includes(keyword));
}

export type ReceiptData = {
    transactionId: number;
    items: { name: string; qty: number; subtotal: number }[];
    total: number;
    cashGiven: number;
    customerName?: string;
    pointsEarned?: number;
    totalPointsBalance?: number;
};

// ── Formatting helpers for 32-column thermal printer ──────────────────

/** Pad / truncate a string to exactly `width` characters */
function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
    if (text.length > width) return text.substring(0, width);
    return align === 'right' ? text.padStart(width) : text.padEnd(width);
}

/** Format a currency value (no decimals, Indonesian locale) */
function rp(n: number): string {
    return `Rp ${n.toLocaleString('id-ID')}`;
}

/** Build a line with a left label and right-aligned value */
function labelValue(label: string, value: string): string {
    const gap = LINE_WIDTH - label.length - value.length;
    if (gap < 1) {
        // Value too long — put on next line, right-aligned
        return `${label}\n${pad(value, LINE_WIDTH, 'right')}\n`;
    }
    return `${label}${' '.repeat(gap)}${value}\n`;
}

/** A full-width separator */
function separator(char = '-'): string {
    return char.repeat(LINE_WIDTH) + '\n';
}

export class PrinterService {
    static isPrinterConnected = false;

    /**
     * Request the runtime permissions needed to scan for and connect to a
     * Bluetooth thermal printer.
     *
     * - Android 12+ (API 31+): BLUETOOTH_CONNECT + BLUETOOTH_SCAN are strictly
     *   required. ACCESS_FINE_LOCATION is requested as a best-effort because
     *   some Samsung BLE stacks still need it to return scan results, but we
     *   do NOT fail if the user denies it — otherwise devices that don't need
     *   location (e.g. Infinix) would be permanently blocked.
     * - Android 11 and below: ACCESS_FINE_LOCATION is required for BLE scanning.
     *
     * Pass `{ showAlerts: true }` to surface user-facing alerts on denial.
     */
    static async requestPermissions(options: { showAlerts?: boolean } = {}): Promise<boolean> {
        if (Platform.OS !== 'android') return true;

        const { showAlerts = false } = options;

        try {
            const apiLevel = Platform.Version;

            if (typeof apiLevel === 'number' && apiLevel >= 31) {
                // Android 12+
                const results = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);

                const allGranted =
                    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
                    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;

                if (!allGranted && showAlerts) {
                    Alert.alert(
                        'Bluetooth Permission Required',
                        'This app needs Bluetooth permissions to connect to your thermal printer. Please grant the permission in your device settings.'
                    );
                }
                return allGranted;
            } else {
                // Android 11 and below — BLE scanning requires location permission
                const rationale = showAlerts
                    ? {
                          title: 'Location Permission Required',
                          message: 'This app needs location access to scan for nearby Bluetooth printers.',
                          buttonPositive: 'Allow',
                          buttonNegative: 'Deny',
                      }
                    : undefined;
                const granted = rationale
                    ? await PermissionsAndroid.request(
                          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                          rationale
                      )
                    : await PermissionsAndroid.request(
                          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                      );
                const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
                if (!ok && showAlerts) {
                    Alert.alert(
                        'Location Permission Required',
                        'Bluetooth scanning requires location permission on this Android version. Please grant it in your device settings.'
                    );
                }
                return ok;
            }
        } catch (err) {
            console.error('Permission request error:', err);
            if (showAlerts) {
                Alert.alert('Permission Error', 'Failed to request Bluetooth permissions.');
            }
            return false;
        }
    }

    /**
     * Build a receipt string formatted for 32-column (58mm) thermal printers.
     * Uses the library's XML-like tags for alignment: <C>, <L>, <B>.
     */
    static buildReceiptFormat(data: ReceiptData): string {
        let r = '';

        // ── Header ──
        r += separator('=');
        r += '<C><B>WARUNG POS</B></C>\n';
        r += separator('=');

        // ── Transaction info ──
        r += `<L>Txn: #${data.transactionId}</L>\n`;
        r += `<L>${new Date().toLocaleString('id-ID')}</L>\n`;
        r += '\n';

        // ── Items ──
        data.items.forEach(item => {
            const price = rp(item.subtotal);
            // Item name on its own line (truncated if needed)
            const name = item.name.length > LINE_WIDTH
                ? item.name.substring(0, LINE_WIDTH - 1) + '…'
                : item.name;
            r += `<L>${name}</L>\n`;
            // Qty × unit + subtotal, right-aligned
            const qtyLabel = `  x${item.qty}`;
            r += labelValue(qtyLabel, price);
        });

        // ── Totals ──
        r += separator('-');
        r += `<B>${labelValue('TOTAL', rp(data.total))}</B>`;
        r += labelValue('BAYAR', rp(data.cashGiven));
        const change = data.cashGiven - data.total;
        if (change > 0) {
            r += labelValue('KEMBALI', rp(change));
        }
        r += separator('-');

        // ── Customer / loyalty ──
        if (data.customerName) {
            r += `<L>Pelanggan: ${data.customerName}</L>\n`;
            if (data.cashGiven < data.total) {
                r += `<L>* Poin akan diberikan saat</L>\n`;
                r += `<L>  hutang dilunasi.</L>\n`;
            } else if (data.pointsEarned && data.pointsEarned > 0) {
                r += `<L>Poin Dapat : +${data.pointsEarned}</L>\n`;
            }
            if (data.totalPointsBalance) {
                r += `<L>Total Poin : ${data.totalPointsBalance}</L>\n`;
            }
            r += '\n';
        }

        // ── Footer ──
        r += '<C>Terima Kasih!</C>\n';
        r += separator('=');

        return r;
    }

    /**
     * Print a receipt on the already-connected BLE printer.
     * Attempt to automatically connect if not connected.
     */
    static async printReceipt(data: ReceiptData): Promise<boolean> {
        console.log('[PrinterService] printReceipt called with transaction:', data.transactionId);
        // Guard: native module may not exist in Expo Go
        if (!isNativeModuleAvailable()) {
            console.warn('[PrinterService] RNBLEPrinter native module is not available — skipping print.');
            Alert.alert(
                'Printer Unavailable',
                'The Bluetooth printing native module is not loaded. Make sure you are running a development build (not Expo Go).'
            );
            return false;
        }

        if (!this.isPrinterConnected) {
            console.log('[PrinterService] Printer is not connected. Attempting auto-connect...');
            const hasPermission = await this.requestPermissions();
            console.log('[PrinterService] Permission check result:', hasPermission);
            if (hasPermission) {
                try {
                    console.log('[PrinterService] Auto-connect: Initializing BLE adapter...');
                    await BLEPrinterDirect.init();
                    try {
                        console.log('[PrinterService] Auto-connect: Tearing down existing connections...');
                        await BLEPrinterDirect.closeConn();
                    } catch (closeErr) {
                        console.log('[PrinterService] Auto-connect: closeConn error ignored:', closeErr);
                    }
                    console.log('[PrinterService] Auto-connect: Fetching saved printer details...');
                    const savedMac = await AsyncStorage.getItem('SELECTED_PRINTER_MAC');
                    console.log('[PrinterService] Auto-connect: Saved MAC address is:', savedMac);

                    console.log('[PrinterService] Auto-connect: Fetching paired device list...');
                    const devices = await BLEPrinterDirect.getDeviceList();
                    console.log(`[PrinterService] Auto-connect: Found ${devices?.length || 0} paired devices`);

                    let targetDevice = null;
                    if (savedMac && devices && devices.length > 0) {
                        targetDevice = devices.find(d => d.inner_mac_address === savedMac);
                        if (targetDevice) {
                            console.log(`[PrinterService] Auto-connect: Found saved printer device: ${targetDevice.device_name}`);
                        } else {
                            console.warn('[PrinterService] Auto-connect: Saved printer MAC not in paired list. Searching by keywords.');
                        }
                    }

                    if (!targetDevice && devices && devices.length > 0) {
                        // Try finding device using Bluetooth class or keyword matching
                        targetDevice = devices.find(d => isDevicePrinter(d));

                        if (targetDevice) {
                            console.log(`[PrinterService] Auto-connect: Found printer by Bluetooth Class/Keyword matching: ${targetDevice.device_name}`);
                        } else {
                            // Fallback to first device in list
                            targetDevice = devices[0];
                            console.log(`[PrinterService] Auto-connect: Fallback to first device in list: ${targetDevice.device_name}`);
                        }
                    }

                    if (targetDevice) {
                        console.log(`[PrinterService] Auto-connect: Attempting to connect to device ${targetDevice.device_name} (${targetDevice.inner_mac_address})`);
                        await BLEPrinterDirect.connectPrinter(targetDevice.inner_mac_address);
                        this.isPrinterConnected = true;
                        console.log('[PrinterService] Auto-connect successful!');
                    } else {
                        console.warn('[PrinterService] Auto-connect failed: No devices in paired list');
                    }
                } catch (e) {
                    console.warn('[PrinterService] Auto connection failed with error:', e);
                }
            }

            if (!this.isPrinterConnected) {
                console.error('[PrinterService] Failed to print: No printer connected.');
                Alert.alert(
                    'Printer Error',
                    'Could not connect to a printer. Please turn on your Bluetooth thermal printer and check the connection in the Settings screen.'
                );
                return false;
            }
        }

        const receiptText = this.buildReceiptFormat(data);
        console.log('[PrinterService] SENDING TO BLUETOOTH PRINTER:\n', receiptText);

        try {
            await BLEPrinterDirect.printBill(receiptText, { beep: false, cut: false });
            console.log('[PrinterService] printBill successfully sent to native module');
            return true;
        } catch (e: any) {
            const msg = e?.message || 'Unknown error';
            console.error('[PrinterService] printReceipt failed with exception:', msg);
            Alert.alert(
                'Printer Error',
                `Failed to print receipt: ${msg}\n\nMake sure the printer is connected via the Settings screen first.`
            );
            return false;
        }
    }
}

