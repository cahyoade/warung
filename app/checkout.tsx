import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PrinterService } from '../src/utils/PrinterService';

type Customer = { id: number, name: string };
type CartItem = { id: number, name: string, activeUnitPrice: number, costPrice: number, cartQty: number };

export default function CheckoutScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams();

  const cartData: CartItem[] = params.cartData ? JSON.parse(params.cartData as string) : [];
  const totalAmount = parseFloat(params.totalAmount as string) || 0;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const [paymentType, setPaymentType] = useState<'Cash' | 'PayLater'>('Cash');
  const [cashGiven, setCashGiven] = useState('');

  const [finalizedTransactionId, setFinalizedTransactionId] = useState<number | null>(null);
  const [finalizedPoints, setFinalizedPoints] = useState<number>(0);

  // Total Profit is sum of (activeUnitPrice - costPrice) * qty
  const totalProfit = cartData.reduce((sum, item) => sum + ((item.activeUnitPrice - item.costPrice) * item.cartQty), 0);

  useEffect(() => {
    db.getAllAsync<Customer>('SELECT id, name FROM Customer').then(setCustomers);
  }, []);

  const change = (parseFloat(cashGiven) || 0) - totalAmount;

  const handleFinalize = async () => {
    if (paymentType === 'Cash' && (parseFloat(cashGiven) || 0) < totalAmount) {
      Alert.alert('Error', 'Cash given is less than the total amount.');
      return;
    }
    if (paymentType === 'PayLater' && !selectedCustomerId) {
      Alert.alert('Error', 'You must select a customer for a Pay Later transaction.');
      return;
    }

    try {
      // 1. Create Transaction
      const dateStr = new Date().toISOString();
      const status = paymentType === 'Cash' ? 'Paid' : 'Unpaid';
      const pointsAwarded = Math.floor(totalAmount / 10000); // 1 point per 10k logic
      const actualCash = paymentType === 'Cash' ? totalAmount : 0; // for simplicity

      const res = await db.runAsync(
        'INSERT INTO "Transaction" (date, totalAmount, totalProfit, cashGiven, paymentStatus, customerId) VALUES (?, ?, ?, ?, ?, ?)',
        [dateStr, totalAmount, totalProfit, actualCash, status, selectedCustomerId || null]
      );

      const transactionId = res.lastInsertRowId;

      // 2. Insert Items & Deplete Stock
      for (const item of cartData) {
        await db.runAsync(
          'INSERT INTO TransactionItem (transactionId, productId, quantity, unitPrice, unitCost, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
          [transactionId, item.id, item.cartQty, item.activeUnitPrice, item.costPrice, item.cartQty * item.activeUnitPrice]
        );

        await db.runAsync(
          'UPDATE Product SET stockCount = stockCount - ? WHERE id = ?',
          [item.cartQty, item.id]
        );
      }

      // 3. Award Points to Customer
      if (selectedCustomerId && paymentType === 'Cash') {
        await db.runAsync(
          'UPDATE Customer SET accumulatedPoints = accumulatedPoints + ? WHERE id = ?',
          [pointsAwarded, selectedCustomerId]
        );
      }

      setFinalizedTransactionId(transactionId);
      setFinalizedPoints(pointsAwarded);
      Alert.alert('Success', `Transaction finalized!${pointsAwarded > 0 ? ` Gave ${pointsAwarded} pts.` : ''}`);

    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to finalize transaction');
    }
  };

  const handlePrint = async () => {
    if (finalizedTransactionId === null) return;
    const actualCash = paymentType === 'Cash' ? totalAmount : 0;
    const printed = await PrinterService.printReceipt({
      transactionId: finalizedTransactionId,
      items: cartData.map(c => ({ name: c.name, qty: c.cartQty, subtotal: c.cartQty * c.activeUnitPrice })),
      total: totalAmount,
      cashGiven: actualCash,
      customerName: customers.find(c => c.id === selectedCustomerId)?.name,
      pointsEarned: finalizedPoints,
    });

    if (!printed) {
      Alert.alert('Error', 'Receipt could not be printed. Please check printer connection.');
    }
  };

  if (finalizedTransactionId !== null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.heading}>Transaction Successful! 🎉</Text>
        <Text style={styles.totalText}>Transaction #{finalizedTransactionId}</Text>

        <View style={{ marginTop: 40, width: '100%' }}>
          <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
            <Text style={styles.printBtnText}>🖨️ Print Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.finalizeBtn, { backgroundColor: '#64748b' }]} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.finalizeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Finalize Transaction</Text>
      <View style={styles.summaryBox}>
        <Text style={styles.totalLabel}>Total Due</Text>
        <Text style={styles.totalText}>Rp {totalAmount.toLocaleString()}</Text>
        <Text style={styles.itemCountText}>{cartData.length} items</Text>
      </View>

      <Text style={styles.label}>Customer (Optional for Cash)</Text>
      <View style={styles.customerList}>
        <TouchableOpacity
          style={[styles.customerBtn, selectedCustomerId === null && styles.customerBtnActive]}
          onPress={() => setSelectedCustomerId(null)}>
          <Text style={selectedCustomerId === null ? { color: '#fff' } : {}}>No Customer</Text>
        </TouchableOpacity>
        {customers.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.customerBtn, selectedCustomerId === c.id && styles.customerBtnActive]}
            onPress={() => setSelectedCustomerId(c.id)}>
            <Text style={selectedCustomerId === c.id ? { color: '#fff' } : {}}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Payment Method</Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.payMethodBtn, paymentType === 'Cash' && styles.payMethodBtnActive]} onPress={() => setPaymentType('Cash')}>
          <Text style={[styles.payMethodText, paymentType === 'Cash' && { color: '#fff' }]}>💰 Cash</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.payMethodBtn, paymentType === 'PayLater' && styles.payMethodBtnActive]} onPress={() => setPaymentType('PayLater')}>
          <Text style={[styles.payMethodText, paymentType === 'PayLater' && { color: '#fff' }]}>📘 Pay Later</Text>
        </TouchableOpacity>
      </View>

      {paymentType === 'Cash' && (
        <View style={styles.cashSection}>
          <Text style={styles.label}>Cash Given by Customer</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            placeholder="Rp"
            value={cashGiven}
            onChangeText={setCashGiven}
          />
          {change > 0 && <Text style={styles.changeText}>Change to return: Rp {change.toLocaleString()}</Text>}
        </View>
      )}

      {paymentType === 'PayLater' && (
        <View style={styles.payLaterWarning}>
          <Text style={{ color: '#c2410c' }}>This transaction will be recorded as Debt for the selected customer.</Text>
        </View>
      )}

      <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalize}>
        <Text style={styles.finalizeBtnText}>Finalize Transaction</Text>
      </TouchableOpacity>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fcfcfc' },
  heading: { fontSize: 24, fontWeight: '800', marginBottom: 20, color: '#1a1a1a' },
  summaryBox: { backgroundColor: '#1e293b', padding: 20, borderRadius: 12, marginBottom: 30 },
  totalLabel: { color: '#a7f3d0', fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  totalText: { color: '#10b981', fontSize: 32, fontWeight: '900' },
  itemCountText: { color: '#94a3b8', marginTop: 5 },
  label: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10 },
  customerList: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  customerBtn: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#e2e8f0', borderRadius: 20, marginRight: 10, marginBottom: 10 },
  customerBtnActive: { backgroundColor: '#0ea5e9' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  payMethodBtn: { flex: 1, padding: 15, backgroundColor: '#e2e8f0', borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  payMethodBtnActive: { backgroundColor: '#10b981' },
  payMethodText: { fontWeight: 'bold', fontSize: 16 },
  cashSection: { marginBottom: 20 },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 20, fontWeight: 'bold' },
  changeText: { marginTop: 10, color: '#0ea5e9', fontSize: 16, fontWeight: 'bold' },
  payLaterWarning: { backgroundColor: '#ffedd5', padding: 15, borderRadius: 10, marginBottom: 20 },
  finalizeBtn: { backgroundColor: '#0f172a', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  finalizeBtnText: { color: '#f8fafc', fontWeight: 'bold', fontSize: 20 },
  printBtn: { backgroundColor: '#3b82f6', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  printBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 20 }
});

