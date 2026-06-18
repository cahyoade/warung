import { Alert, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
                ]);

                return (
                    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
                    results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
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
                        // If no saved MAC or saved MAC not found, check by common keywords:
                        const printerKeywords = ['print', 'mpt', 'rpp', 'pos', 'thermal', 'spp', 'xp-', 'mtp', 'goojprt'];
                        targetDevice = devices.find(d => {
                            const name = (d.device_name || '').toLowerCase();
                            return printerKeywords.some(keyword => name.includes(keyword));
                        });

                        if (targetDevice) {
                            console.log(`[PrinterService] Auto-connect: Found printer by keyword match: ${targetDevice.device_name}`);
                        } else {
                            // Fallback to first device
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

