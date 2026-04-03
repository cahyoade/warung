import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import React from 'react';
import { PrinterService } from '../../src/utils/PrinterService';

type Transaction = { id: number, date: string, totalAmount: number, totalProfit: number, paymentStatus: string, isVoided: number, cashGiven: number, customerId: number | null };

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);

  const fetchReports = async () => {
    // Basic aggregation for non-voided transactions
    const result = await db.getAllAsync<Transaction>('SELECT * FROM "Transaction" ORDER BY date DESC LIMIT 50');
    setTransactions(result);

    const agg = await db.getFirstAsync<{ rev: number, prof: number }>(`
      SELECT SUM(totalAmount) as rev, SUM(totalProfit) as prof 
      FROM "Transaction" 
      WHERE isVoided = 0 AND paymentStatus = 'Paid'
    `);
    
    setTotalRevenue(agg?.rev || 0);
    setTotalProfit(agg?.prof || 0);
  };

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [])
  );

  const handleTransactionClick = (txn: Transaction) => {
    if (txn.isVoided) {
        Alert.alert('Voided', 'This transaction has already been voided.');
        return;
    }

    Alert.alert(
      `Transaction #${txn.id}`,
      `Total: Rp ${txn.totalAmount.toLocaleString()}\nStatus: ${txn.paymentStatus}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reprint Receipt', onPress: () => reprintReceipt(txn) },
        { 
          text: 'Void / Cancel Sale', 
          style: 'destructive',
          onPress: () => confirmVoid(txn)
        }
      ]
    );
  };

  const reprintReceipt = async (txn: Transaction) => {
    try {
      const items = await db.getAllAsync<{name: string, quantity: number, subtotal: number}>(
        `SELECT p.name, t.quantity, t.subtotal 
         FROM TransactionItem t 
         JOIN Product p ON t.productId = p.id 
         WHERE t.transactionId = ?`, 
        [txn.id]
      );

      let customerName = undefined;
      if (txn.customerId) {
        const customer = await db.getFirstAsync<{name: string}>('SELECT name FROM Customer WHERE id = ?', [txn.customerId]);
        if (customer) {
          customerName = customer.name;
        }
      }

      await PrinterService.printReceipt({
        transactionId: txn.id,
        items: items.map(i => ({ name: i.name, qty: i.quantity, subtotal: i.subtotal })),
        total: txn.totalAmount,
        cashGiven: txn.cashGiven || txn.totalAmount,
        customerName: customerName,
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to fetch transaction details for reprint.');
    }
  };

  const confirmVoid = (txn: Transaction) => {
    Alert.alert('Are you sure?', 'Voiding this will restore stock and reverse customer points.', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Void It', style: 'destructive', onPress: () => voidTransaction(txn) }
    ]);
  };

  const voidTransaction = async (txn: Transaction) => {
    try {
      // 1. Mark as voided
      await db.runAsync('UPDATE "Transaction" SET isVoided = 1 WHERE id = ?', [txn.id]);

      // 2. Replenish stock
      const items = await db.getAllAsync<{productId: number, quantity: number}>('SELECT productId, quantity FROM TransactionItem WHERE transactionId = ?', [txn.id]);
      for (const item of items) {
         await db.runAsync('UPDATE Product SET stockCount = stockCount + ? WHERE id = ?', [item.quantity, item.productId]);
      }

      // 3. Remove points (if attached to customer)
      const txnData = await db.getFirstAsync<{customerId: number | null}>('SELECT customerId FROM "Transaction" WHERE id = ?', [txn.id]);
      if (txnData?.customerId) {
         const pointsToRemove = Math.floor(txn.totalAmount / 10000);
         await db.runAsync('UPDATE Customer SET accumulatedPoints = accumulatedPoints - ? WHERE id = ?', [pointsToRemove, txnData.customerId]);
      }

      Alert.alert('Success', 'Transaction legally voided and stock restored.');
      fetchReports();
    } catch(e) {
      Alert.alert('Error', 'Failed to void transaction.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reports & History</Text>
      
      <View style={styles.statsCard}>
          <Text style={styles.statsLabel}>Lifetime Revenue</Text>
          <Text style={styles.statsGross}>Rp {totalRevenue.toLocaleString()}</Text>
          <View style={styles.profitBadge}>
             <Text style={styles.statsProfit}>+ Rp {totalProfit.toLocaleString()} Net Profit</Text>
          </View>
      </View>

      <Text style={styles.subTitle}>Recent Transactions</Text>
      <FlatList
        data={transactions}
        keyExtractor={t => t.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
             style={[styles.txnRow, item.isVoided ? styles.voidedRow : null]}
             onPress={() => handleTransactionClick(item)}
          >
            <View>
                <Text style={[styles.txnDate, item.isVoided ? styles.voidedText : null]}>{new Date(item.date).toLocaleString()}</Text>
                <Text style={[styles.txnStatus, item.isVoided ? styles.voidedText : null]}>
                  {item.isVoided ? 'VOID' : (item.paymentStatus === 'DebtSettlement' ? 'DEBT SETTLEMENT' : item.paymentStatus)}
                </Text>
            </View>
            <View style={{alignItems: 'flex-end'}}>
                <Text style={[styles.txnAmount, item.isVoided ? styles.voidedText : null]}>Rp {item.totalAmount.toLocaleString()}</Text>
                {item.paymentStatus !== 'DebtSettlement' && (
                  <Text style={[styles.txnProfit, item.isVoided ? styles.voidedText : null]}>Profit: Rp {item.totalProfit.toLocaleString()}</Text>
                )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fcfcfc' },
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 20 },
  statsCard: { backgroundColor: '#1e293b', padding: 25, borderRadius: 16, marginBottom: 30, alignItems: 'center' },
  statsLabel: { color: '#94a3b8', fontSize: 16, fontWeight: 'bold' },
  statsGross: { color: '#10b981', fontSize: 36, fontWeight: '900', marginVertical: 10 },
  profitBadge: { backgroundColor: '#064e3b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statsProfit: { color: '#34d399', fontWeight: 'bold' },
  subTitle: { fontSize: 20, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  txnDate: { fontWeight: 'bold', color: '#1e293b', fontSize: 16 },
  txnStatus: { color: '#64748b', marginTop: 4, fontWeight: '600' },
  txnAmount: { fontWeight: '900', color: '#0f172a', fontSize: 18 },
  txnProfit: { color: '#10b981', marginTop: 4, fontWeight: 'bold' },
  voidedRow: { backgroundColor: '#fdf2f8', opacity: 0.6 },
  voidedText: { textDecorationLine: 'line-through', color: '#9ca3af' }
});
