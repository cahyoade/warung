import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { BLEPrinterDirect, isNativeModuleAvailable } from './BLEPrinterModule';

// MPT-II (58mm) = 48mm printable width = 384 dots = 32 chars (Font A, 12x24)
const LINE_WIDTH = 32;

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

    static async requestPermissions(): Promise<boolean> {
        if (Platform.OS !== 'android') return true;

        try {
            const apiLevel = Platform.Version;

            if (typeof apiLevel === 'number' && apiLevel >= 31) {
                // Android 12+
                const results = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);

                return (
                    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
                    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
                    results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
                );
            } else {
                // Android 11 and below — BLE scanning requires location permission
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            }
        } catch (err) {
            console.error('Permission request error:', err);
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
        // Guard: native module may not exist in Expo Go
        if (!isNativeModuleAvailable()) {
            console.warn('RNBLEPrinter native module is not available — skipping print.');
            Alert.alert(
                'Printer Unavailable',
                'The Bluetooth printing native module is not loaded. Make sure you are running a development build (not Expo Go).'
            );
            return false;
        }

        if (!this.isPrinterConnected) {
            console.log('Attempting auto-connect...');
            const hasPermission = await this.requestPermissions();
            if (hasPermission) {
                try {
                    await BLEPrinterDirect.init();
                    try {
                        await BLEPrinterDirect.closeConn();
                    } catch {
                        // ignore
                    }
                    const devices = await BLEPrinterDirect.getDeviceList();
                    if (devices && devices.length > 0) {
                        const device = devices[0];
                        await BLEPrinterDirect.connectPrinter(device.inner_mac_address);
                        this.isPrinterConnected = true;
                    }
                } catch (e) {
                    console.warn('Auto connection failed', e);
                }
            }

            if (!this.isPrinterConnected) {
                Alert.alert(
                    'Printer Error',
                    'Could not connect to a printer. Please turn on your Bluetooth thermal printer and check the connection in the Settings screen.'
                );
                return false;
            }
        }

        const receiptText = this.buildReceiptFormat(data);
        console.log('SENDING TO BLUETOOTH PRINTER:\n', receiptText);

        try {
            await BLEPrinterDirect.printBill(receiptText, { beep: false, cut: false });
            return true;
        } catch (e: any) {
            const msg = e?.message || 'Unknown error';
            console.error('PrinterService.printReceipt failed:', msg);
            Alert.alert(
                'Printer Error',
                `Failed to print receipt: ${msg}\n\nMake sure the printer is connected via the Settings screen first.`
            );
            return false;
        }
    }
}

