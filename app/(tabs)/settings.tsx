import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { PrinterService } from '../../src/utils/PrinterService';

export default function SettingsScreen() {
  const handleTestPrint = () => {
    PrinterService.printReceipt({
        transactionId: 999,
        items: [{name: 'Test Item', qty: 1, subtotal: 5000}],
        total: 5000,
        cashGiven: 6000,
        customerName: 'Pak Budi (Test)',
        pointsEarned: 0,
        totalPointsBalance: 45
    });
    Alert.alert(
      'Test Print Fired', 
      'Sent string data to Native Bluetooth Module! (Check device logs)'
    );
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
         <Text style={styles.cardDesc}>Connection requires Android APK compilation. Pair your printer in Android Settings, then click test print.</Text>
         <TouchableOpacity style={styles.btnHardware} onPress={handleTestPrint}>
             <Text style={styles.btnHardwareText}>Test Receipt Print</Text>
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
  btnSync: { backgroundColor: '#10b981', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnSyncText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
