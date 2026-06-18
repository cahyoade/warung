/**
 * Wrapper around the native RNBLEPrinter module that works with both
 * the old bridge (NativeModules) and New Architecture (TurboModuleRegistry).
 *
 * react-native-thermal-receipt-printer uses NativeModules.RNBLEPrinter,
 * which may be undefined in release builds with New Architecture enabled.
 */
import { NativeModules } from 'react-native';

// Try TurboModuleRegistry first (New Architecture), fall back to NativeModules (old bridge)
let RNBLEPrinter: any = NativeModules.RNBLEPrinter;
if (!RNBLEPrinter) {
    try {
        const { TurboModuleRegistry } = require('react-native');
        RNBLEPrinter = TurboModuleRegistry.get('RNBLEPrinter');
    } catch {
        // TurboModuleRegistry not available
    }
}

export function isNativeModuleAvailable(): boolean {
    return RNBLEPrinter != null;
}

function textTo64Buffer(text: string, opts: any = {}): string {
    // Import EPToolkit from the library
    const EPToolkit = require('react-native-thermal-receipt-printer/dist/utils/EPToolkit');
    const defaultOptions = {
        beep: false,
        cut: false,
        tailingLine: false,
        encoding: 'UTF8',
    };
    const options = { ...defaultOptions, ...opts };
    const buffer = EPToolkit.exchange_text(text, options);
    return buffer.toString('base64');
}

function billTo64Buffer(text: string, opts: any = {}): string {
    const EPToolkit = require('react-native-thermal-receipt-printer/dist/utils/EPToolkit');
    const defaultOptions = {
        beep: true,
        cut: true,
        encoding: 'UTF8',
        tailingLine: true,
    };
    const options = { ...defaultOptions, ...opts };
    const buffer = EPToolkit.exchange_text(text, options);
    return buffer.toString('base64');
}

/**
 * Drop-in replacement for BLEPrinter from react-native-thermal-receipt-printer
 * that accesses the native module directly instead of relying on NativeModules at import time.
 */
export const BLEPrinterDirect = {
    init(): Promise<void> {
        console.log('[BLEPrinterDirect] init() called');
        return new Promise((resolve, reject) => {
            if (!RNBLEPrinter) {
                console.error('[BLEPrinterDirect] init() failed: RNBLEPrinter native module is not available');
                return reject(new Error('RNBLEPrinter native module is not available'));
            }
            RNBLEPrinter.init(
                () => {
                    console.log('[BLEPrinterDirect] init() success');
                    resolve();
                },
                (error: string) => {
                    console.error('[BLEPrinterDirect] init() error from native:', error);
                    reject(new Error(error));
                }
            );
        });
    },

    getDeviceList(): Promise<any[]> {
        console.log('[BLEPrinterDirect] getDeviceList() called');
        return new Promise((resolve, reject) => {
            if (!RNBLEPrinter) {
                console.error('[BLEPrinterDirect] getDeviceList() failed: RNBLEPrinter native module is not available');
                return reject(new Error('RNBLEPrinter native module is not available'));
            }
            RNBLEPrinter.getDeviceList(
                (printers: any[]) => {
                    console.log('[BLEPrinterDirect] getDeviceList() success, found devices:', printers);
                    resolve(printers);
                },
                (error: string) => {
                    console.error('[BLEPrinterDirect] getDeviceList() error from native:', error);
                    reject(new Error(error));
                },
            );
        });
    },

    connectPrinter(innerMacAddress: string): Promise<any> {
        console.log(`[BLEPrinterDirect] connectPrinter() called with MAC: ${innerMacAddress}`);
        return new Promise((resolve, reject) => {
            if (!RNBLEPrinter) {
                console.error('[BLEPrinterDirect] connectPrinter() failed: RNBLEPrinter native module is not available');
                return reject(new Error('RNBLEPrinter native module is not available'));
            }
            RNBLEPrinter.connectPrinter(
                innerMacAddress,
                (printer: any) => {
                    console.log('[BLEPrinterDirect] connectPrinter() success, printer:', printer);
                    resolve(printer);
                },
                (error: string) => {
                    console.error(`[BLEPrinterDirect] connectPrinter() error from native for MAC ${innerMacAddress}:`, error);
                    reject(new Error(error));
                },
            );
        });
    },

    closeConn(): Promise<void> {
        console.log('[BLEPrinterDirect] closeConn() called');
        return new Promise((resolve) => {
            if (!RNBLEPrinter) {
                console.log('[BLEPrinterDirect] closeConn(): native module not available, resolving immediately');
                return resolve();
            }
            RNBLEPrinter.closeConn();
            console.log('[BLEPrinterDirect] closeConn() completed');
            resolve();
        });
    },

    printText(text: string, opts: any = {}): void {
        if (!RNBLEPrinter) return;
        RNBLEPrinter.printRawData(textTo64Buffer(text, opts), (error: string) =>
            console.warn(error),
        );
    },

    printBill(text: string, opts: any = {}): void {
        if (!RNBLEPrinter) return;
        RNBLEPrinter.printRawData(billTo64Buffer(text, opts), (error: string) =>
            console.warn(error),
        );
    },
};
