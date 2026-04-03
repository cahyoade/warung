import { useState } from 'react';
import { ActivityIndicator, Alert, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BLEPrinter } from 'react-native-thermal-receipt-printer';
import { PrinterService } from '../../src/utils/PrinterService';

/**
 * Request Bluetooth runtime permissions.
 * - Android 12+ (API 31+): BLUETOOTH_CONNECT + BLUETOOTH_SCAN
 * - Android 11 and below: ACCESS_FINE_LOCATION (required for BLE scanning)
 * Returns true if all required permissions were granted.
 */
async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const apiLevel = Platform.Version;

    if (typeof apiLevel === 'number' && apiLevel >= 31) {
      // Android 12+
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);

      const allGranted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;

      if (!allGranted) {
        Alert.alert(
          'Bluetooth Permission Required',
          'This app needs Bluetooth permissions to connect to your thermal printer. Please grant the permission in your device settings.'
        );
      }
      return allGranted;
    } else {
      // Android 11 and below — BLE scanning requires location permission
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission Required',
          message: 'This app needs location access to scan for nearby Bluetooth printers.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert(
          'Location Permission Required',
          'Bluetooth scanning requires location permission on this Android version. Please grant it in your device settings.'
        );
        return false;
      }
      return true;
    }
  } catch (err) {
    console.error('Permission request error:', err);
    Alert.alert('Permission Error', 'Failed to request Bluetooth permissions.');
    return false;
  }
}

const HEARTBEAT_INTERVAL_MS = 8000; // ping printer every 8 seconds

export default function SettingsScreen() {
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const handleTestPrint = async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const success = await PrinterService.printReceipt({
        transactionId: 999,
        items: [{ name: 'Test Item', qty: 1, subtotal: 5000 }],
        total: 5000,
        cashGiven: 6000,
        customerName: 'Pak Budi (Test)',
        pointsEarned: 0,
        totalPointsBalance: 45,
      });
      if (success) {
        Alert.alert('Print Sent', 'Test receipt was sent to the printer.');
      }
      // If !success, PrinterService already showed an error alert
    } finally {
      setPrinting(false);
    }
  };

  const connectPrinter = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      // Guard: the native module won't exist in Expo Go
      if (!BLEPrinter || typeof BLEPrinter.init !== 'function') {
        Alert.alert(
          'Native Module Missing',
          'BLEPrinter is not available. You must run a custom dev client (npx expo run:android) — Expo Go does not support native BLE printing.'
        );
        return;
      }

      // Request runtime Bluetooth permissions (required on Android 12+)
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) return;

      // init() must be called BEFORE closeConn() to ensure the internal native adapter exists!
      await BLEPrinter.init();

      // Always tear down any previous connection first.
      // The library caches internal BLE state — without this, reconnecting
      // after the printer goes offline will silently reuse the dead socket.
      try {
        await BLEPrinter.closeConn();
      } catch {
        // No active connection to close — that's fine, continue.
      }
      const devices = await BLEPrinter.getDeviceList();
      if (devices.length === 0) {
        setConnectedDevice(null);
        PrinterService.isPrinterConnected = false;
        Alert.alert('No Devices', 'Try pairing in Android settings first.');
        return;
      }

      const device = devices[0];
      await BLEPrinter.connectPrinter(device.inner_mac_address);

      setConnectedDevice(device.device_name);
      PrinterService.isPrinterConnected = true;
      Alert.alert('Connected', `Ready to print on "${device.device_name}".`);
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      setConnectedDevice(null);
      PrinterService.isPrinterConnected = false;
      Alert.alert('Connection Error', `${msg}\n\nMake sure you are on a physical device with a custom dev client (not Expo Go).`);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    // In production, use @react-native-google-signin/google-signin here
    // to obtain the Google OAuth Access Token, then pass it to our Service:
    // 
    // const transactions = await db.getAllAsync('SELECT * FROM "Transaction"');
    // const sheetId = await SyncService.syncTransactionsToGoogleDrive(accessToken, transactions);

    Alert.alert('Google Cloud Setup Required',
      'To use this backup feature, you must create a Google Cloud Project, enable the Google Sheets API, and place your OAuth Web Client ID into the app config.'
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings & Hardware</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bluetooth Printer</Text>
        <Text style={styles.cardDesc}>Pair your printer in Android Settings, then connect to it here before trying to test print.</Text>

        {/* Connection status indicator */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, connectedDevice ? styles.statusDotOn : styles.statusDotOff]} />
          <Text style={[styles.statusText, connectedDevice ? styles.statusTextOn : styles.statusTextOff]}>
            {connectedDevice ? `Connected: ${connectedDevice}` : 'Not connected'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.btnHardware, { backgroundColor: '#eab308' }, connecting && styles.btnDisabled]}
          onPress={connectPrinter}
          disabled={connecting}
          activeOpacity={0.7}
        >
          <View style={styles.btnInner}>
            {connecting && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
            <Text style={styles.btnHardwareText}>{connecting ? 'Connecting...' : 'Connect to Default Printer'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnHardware, printing && styles.btnDisabled]}
          onPress={handleTestPrint}
          disabled={printing}
          activeOpacity={0.7}
        >
          <View style={styles.btnInner}>
            {printing && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
            <Text style={styles.btnHardwareText}>{printing ? 'Printing...' : 'Test Receipt Print'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cloud Back-up</Text>
        <Text style={styles.cardDesc}>Securely sync your transactions to a Google Sheet.</Text>
        <TouchableOpacity style={styles.btnSync} onPress={handleSync}>
          <Text style={styles.btnSyncText}>Trigger Sync</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fcfcfc' },
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  cardDesc: { color: '#64748b', marginVertical: 10 },
  btnHardware: { backgroundColor: '#0f172a', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnHardwareText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 4 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  statusDotOn: { backgroundColor: '#10b981' },
  statusDotOff: { backgroundColor: '#94a3b8' },
  statusText: { fontSize: 13, fontWeight: '600' },
  statusTextOn: { color: '#10b981' },
  statusTextOff: { color: '#94a3b8' },
  btnSync: { backgroundColor: '#10b981', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnSyncText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
