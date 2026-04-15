import { GoogleSignin, statusCodes, type User } from '@react-native-google-signin/google-signin';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../src/i18n/LanguageContext';
import { BLEPrinterDirect, isNativeModuleAvailable } from '../../src/utils/BLEPrinterModule';
import { BackupScheduler } from '../../src/utils/BackupScheduler';
import { PrinterService } from '../../src/utils/PrinterService';
import { SyncService } from '../../src/utils/SyncService';

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
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

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
  const { t, language, setLanguage } = useTranslation();
  // Google Sign-In state
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
      webClientId: '844339429836-mn5vcr28d27u9453249asq3attd9hpvn.apps.googleusercontent.com',
      offlineAccess: false,
      forceCodeForRefreshToken: false,
    });
    // Try to restore previous sign-in
    if (GoogleSignin.hasPreviousSignIn()) {
      const currentUser = GoogleSignin.getCurrentUser();
      setUserInfo(currentUser);
    }
  }, []);

  // Load auto-backup state
  useEffect(() => {
    BackupScheduler.isEnabled().then(setAutoBackupEnabled);
    BackupScheduler.getLastBackupTime().then(setLastBackupTime);
  }, []);

  const toggleAutoBackup = async () => {
    if (autoBackupEnabled) {
      await BackupScheduler.disable();
      setAutoBackupEnabled(false);
    } else {
      if (!userInfo) {
        Alert.alert('Not signed in', 'Please sign in with Google first to enable auto-backup.');
        return;
      }
      const registered = await BackupScheduler.enable();
      await BackupScheduler.enable();
      setAutoBackupEnabled(true);
    }
  };

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (response.type === 'success') {
        setUserInfo(response.data);
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled
      } else if (error.code === statusCodes.IN_PROGRESS) {
        Alert.alert('Sign-in in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services not available');
      } else {
        Alert.alert('Sign-in error', error.message || 'Unknown error');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await GoogleSignin.signOut();
      setUserInfo(null);
    } catch (e) {
      Alert.alert('Sign-out error', (e as any)?.message || 'Unknown error');
    }
  };
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
      if (!isNativeModuleAvailable()) {
        Alert.alert(
          'Native Module Missing',
          'RNBLEPrinter native module is not loaded. This can happen in Expo Go or if the module failed to link. Please use a development build.'
        );
        return;
      }

      // Request runtime Bluetooth permissions (required on Android 12+)
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) return;

      // init() must be called BEFORE closeConn() to ensure the internal native adapter exists!
      await BLEPrinterDirect.init();

      // Always tear down any previous connection first.
      // The library caches internal BLE state — without this, reconnecting
      // after the printer goes offline will silently reuse the dead socket.
      try {
        await BLEPrinterDirect.closeConn();
      } catch {
        // No active connection to close — that's fine, continue.
      }
      const devices = await BLEPrinterDirect.getDeviceList();
      if (devices.length === 0) {
        setConnectedDevice(null);
        PrinterService.isPrinterConnected = false;
        Alert.alert('No Devices', 'Try pairing in Android settings first.');
        return;
      }

      const device = devices[0];
      await BLEPrinterDirect.connectPrinter(device.inner_mac_address);

      setConnectedDevice(device.device_name);
      PrinterService.isPrinterConnected = true;
      Alert.alert('Connected', `Ready to print on "${device.device_name}".`);
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      setConnectedDevice(null);
      PrinterService.isPrinterConnected = false;
      Alert.alert('Connection Error', `${msg}\n\nEnsure Bluetooth is enabled and the printer is paired in Android settings.`);
    } finally {
      setConnecting(false);
    }
  };

  const db = useSQLiteContext();
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [backupList, setBackupList] = useState<{ id: string; name: string; createdTime: string }[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);

  // Use Google Sign-In to get access token
  const getAccessToken = async () => {
    if (!userInfo) {
      Alert.alert('Not signed in', 'Please sign in with Google first.');
      return '';
    }
    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken;
  };

  const handleSync = async () => {
    setBackupLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      const spreadsheetId = await SyncService.backupAllToGoogleDrive(accessToken, db);
      await BackupScheduler.recordBackup();
      setLastBackupTime(new Date().toLocaleString());
      Alert.alert('Backup Success', `Backup completed! Spreadsheet ID: ${spreadsheetId}`);
    } catch (e: any) {
      Alert.alert('Backup Failed', e?.message || 'Unknown error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      setBackupListLoading(true);
      setRestoreModalVisible(true);
      const files = await SyncService.listBackupSpreadsheets(accessToken);
      setBackupList(files);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to list backups');
      setRestoreModalVisible(false);
    } finally {
      setBackupListLoading(false);
    }
  };

  const handleRestoreFromSpreadsheet = async (spreadsheetId: string) => {
    setRestoreModalVisible(false);
    setRestoreLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;
      await SyncService.restoreAllFromGoogleDrive(accessToken, spreadsheetId, db);
      Alert.alert('Restore Success', 'All data has been restored from backup.');
    } catch (e: any) {
      Alert.alert('Restore Failed', e?.message || 'Unknown error');
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 80 }}>
      <Text style={styles.title}>{t('settings.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.printer')}</Text>
        <Text style={styles.cardDesc}>{t('settings.printerDesc')}</Text>

        {/* Connection status indicator */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, connectedDevice ? styles.statusDotOn : styles.statusDotOff]} />
          <Text style={[styles.statusText, connectedDevice ? styles.statusTextOn : styles.statusTextOff]}>
            {connectedDevice ? t('settings.connected', { name: connectedDevice }) : t('settings.notConnected')}
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
            <Text style={styles.btnHardwareText}>{connecting ? t('settings.connecting') : t('settings.connectPrinter')}</Text>
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
            <Text style={styles.btnHardwareText}>{printing ? t('settings.printing') : t('settings.testPrint')}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.cloudBackup')}</Text>
        <Text style={styles.cardDesc}>{t('settings.cloudBackupDesc')}</Text>
        {userInfo ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: '#1e293b', marginBottom: 4 }}>{t('settings.signedInAs', { email: userInfo.user.email })}</Text>
            <TouchableOpacity style={[styles.btnSync, { backgroundColor: '#ef4444', marginBottom: 10 }]} onPress={handleGoogleSignOut}>
              <Text style={styles.btnSyncText}>{t('settings.signOut')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.btnSync, { backgroundColor: '#2563eb', marginBottom: 10 }]} onPress={handleGoogleSignIn} disabled={signingIn}>
            {signingIn ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : null}
            <Text style={styles.btnSyncText}>{signingIn ? t('settings.signingIn') : t('settings.signInGoogle')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.btnSync} onPress={handleSync} disabled={backupLoading || !userInfo}>
          {backupLoading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : null}
          <Text style={styles.btnSyncText}>{backupLoading ? t('settings.backingUp') : t('settings.triggerBackup')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSync, { backgroundColor: '#2563eb', marginTop: 10 }]} onPress={handleRestore} disabled={restoreLoading || !userInfo}>
          {restoreLoading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : null}
          <Text style={styles.btnSyncText}>{restoreLoading ? t('settings.restoring') : t('settings.restoreFromBackup')}</Text>
        </TouchableOpacity>

        {/* Auto-backup toggle */}
        <View style={styles.autoBackupRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '600', color: '#1e293b' }}>{t('settings.dailyAutoBackup')}</Text>
            <Text style={{ fontSize: 12, color: '#64748b' }}>
              {lastBackupTime ? t('settings.lastBackup', { time: lastBackupTime }) : t('settings.noBackupYet')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, autoBackupEnabled ? styles.toggleBtnOn : styles.toggleBtnOff]}
            onPress={toggleAutoBackup}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>
              {autoBackupEnabled ? t('settings.on') : t('settings.off')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Language Setting */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('settings.language')}</Text>
        <Text style={styles.cardDesc}>{t('settings.languageDesc')}</Text>
        <View style={styles.langRow}>
          <TouchableOpacity
            style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
            onPress={() => setLanguage('en')}
          >
            <Text style={[styles.langBtnText, language === 'en' && styles.langBtnTextActive]}>{t('settings.english')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === 'id' && styles.langBtnActive]}
            onPress={() => setLanguage('id')}
          >
            <Text style={[styles.langBtnText, language === 'id' && styles.langBtnTextActive]}>{t('settings.indonesian')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Restore Backup Picker Modal */}
      <Modal visible={restoreModalVisible} transparent animationType="slide" onRequestClose={() => setRestoreModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.cardTitle}>{t('settings.selectBackup')}</Text>
            <Text style={[styles.cardDesc, { marginBottom: 10 }]}>{t('settings.overwriteWarning')}</Text>
            {backupListLoading ? (
              <ActivityIndicator size="large" color="#10b981" style={{ marginVertical: 20 }} />
            ) : backupList.length === 0 ? (
              <Text style={{ color: '#64748b', textAlign: 'center', marginVertical: 20 }}>{t('settings.noBackupsFound')}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {backupList.map((file) => (
                  <TouchableOpacity
                    key={file.id}
                    style={styles.backupItem}
                    onPress={() => {
                      Alert.alert(t('settings.confirmRestore'), t('settings.confirmRestoreMsg', { name: file.name }), [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: t('settings.restore'), style: 'destructive', onPress: () => handleRestoreFromSpreadsheet(file.id) },
                      ]);
                    }}
                  >
                    <Text style={styles.backupItemName}>{file.name}</Text>
                    <Text style={styles.backupItemDate}>{new Date(file.createdTime).toLocaleString()}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[styles.btnSync, { backgroundColor: '#64748b', marginTop: 10 }]} onPress={() => setRestoreModalVisible(false)}>
              <Text style={styles.btnSyncText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, paddingBottom: 120, backgroundColor: '#fcfcfc' },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
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
  btnSyncText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  backupItem: { backgroundColor: '#f1f5f9', padding: 14, borderRadius: 10, marginBottom: 8 },
  backupItemName: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  backupItemDate: { fontSize: 12, color: '#64748b', marginTop: 2 },
  autoBackupRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  toggleBtnOn: { backgroundColor: '#10b981' },
  toggleBtnOff: { backgroundColor: '#94a3b8' },
  langRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  langBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#f8fafc' },
  langBtnActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  langBtnText: { fontWeight: '600', color: '#64748b', fontSize: 15 },
  langBtnTextActive: { color: '#0ea5e9' },
});
