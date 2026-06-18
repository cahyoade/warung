import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../src/i18n/LanguageContext';
import { PrinterService } from '../src/utils/PrinterService';

type Customer = { id: number, name: string, phone: string, accumulatedPoints: number };
type TransactionItem = { name: string, quantity: number, subtotal: number };
type Transaction = { id: number, date: string, totalAmount: number, cashGiven: number, items: TransactionItem[] };

export default function SettleDebtScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const customerId = parseInt(params.customerId as string, 10);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [unpaidTransactions, setUnpaidTransactions] = useState<Transaction[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [totalDebt, setTotalDebt] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [finalized, setFinalized] = useState<{ settledAmount: number, cashGiven: number, pointsAwarded: number } | null>(null);

  useEffect(() => {
    if (isNaN(customerId)) return;
    fetchData();
  }, [customerId]);

  const fetchData = async () => {
    const cust = await db.getFirstAsync<Customer>('SELECT * FROM Customer WHERE id = ?', [customerId]);
    setCustomer(cust);

    const txns = await db.getAllAsync<Transaction>(`
      SELECT id, date, totalAmount, cashGiven 
      FROM "Transaction" 
      WHERE customerId = ? AND paymentStatus = 'Unpaid' AND isVoided = 0
      ORDER BY date ASC
    `, [customerId]);
    
    const txnsWithItems = await Promise.all(txns.map(async txn => {
      const items = await db.getAllAsync<TransactionItem>(
        `SELECT p.name, ti.quantity, ti.subtotal 
         FROM TransactionItem ti 
         JOIN Product p ON ti.productId = p.id 
         WHERE ti.transactionId = ?`, 
        [txn.id]
      );
      return { ...txn, items };
    }));
    
    setUnpaidTransactions(txnsWithItems);

    const debt = txnsWithItems.reduce((sum, txn) => sum + (txn.totalAmount - txn.cashGiven), 0);
    setTotalDebt(debt);
    setPaymentAmount(debt.toString());
  };

  const handleSettle = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('common.error'), t('settleDebt.errorAmount'));
      return;
    }

    setIsProcessing(true);
    try {
      const settledAmount = Math.min(amount, totalDebt);
      let remainingPayment = settledAmount;
      let pointsAwarded = 0;

      await db.withTransactionAsync(async () => {
        // 1. Distribute payment across transactions
        for (const txn of unpaidTransactions) {
          if (remainingPayment <= 0) break;
          
          const txnOwes = txn.totalAmount - txn.cashGiven;
          const applyToTxn = Math.min(txnOwes, remainingPayment);
          
          const newCashGiven = txn.cashGiven + applyToTxn;
          const newStatus = newCashGiven >= txn.totalAmount ? 'Paid' : 'Unpaid';
          
          // Award points based on the full transaction amount for fully-paid transactions
          if (newStatus === 'Paid') {
            pointsAwarded += Math.floor(txn.totalAmount / 20000);
          }

          await db.runAsync(
            'UPDATE "Transaction" SET cashGiven = ?, paymentStatus = ? WHERE id = ?',
            [newCashGiven, newStatus, txn.id]
          );
          
          remainingPayment -= applyToTxn;
        }

        // 2. Insert Debt Settlement record for reporting
        const dateStr = new Date().toISOString();
        await db.runAsync(
          'INSERT INTO "Transaction" (date, totalAmount, totalProfit, cashGiven, paymentStatus, customerId, isVoided) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [dateStr, settledAmount, 0, settledAmount, 'DebtSettlement', customerId, 0]
        );

        // 3. Award Points
        if (pointsAwarded > 0) {
          await db.runAsync(
            'UPDATE Customer SET accumulatedPoints = accumulatedPoints + ? WHERE id = ?',
            [pointsAwarded, customerId]
          );
        }
      });

      setFinalized({ settledAmount, cashGiven: amount, pointsAwarded });
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'), t('settleDebt.error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = async () => {
    if (!finalized) return;
    const printed = await PrinterService.printReceipt({
      transactionId: 0,
      items: [{ name: 'Pembayaran Hutang', qty: 1, subtotal: finalized.settledAmount }],
      total: finalized.settledAmount,
      cashGiven: finalized.cashGiven,
      customerName: customer?.name,
      pointsEarned: finalized.pointsAwarded,
    });
    if (!printed) {
      Alert.alert(t('common.error'), t('settleDebt.printError'));
    }
  };

  if (!customer) return null;

  if (finalized) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.heading}>{t('settleDebt.successTitle')}</Text>
        <Text style={styles.totalText}>Rp {finalized.settledAmount.toLocaleString()}</Text>
        {finalized.pointsAwarded > 0 && (
          <Text style={styles.hint}>{t('settleDebt.success', { points: finalized.pointsAwarded })}</Text>
        )}
        {finalized.cashGiven > finalized.settledAmount && (
          <Text style={styles.changeText}>{t('settleDebt.changeToReturn', { amount: (finalized.cashGiven - finalized.settledAmount).toLocaleString() })}</Text>
        )}
        <View style={{ marginTop: 40, width: '100%' }}>
          <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
            <Text style={styles.printBtnText}>{t('settleDebt.printReceipt')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.settleBtn, { backgroundColor: '#64748b', marginTop: 12 }]} onPress={() => router.replace('/(tabs)/customers')}>
            <Text style={styles.settleBtnText}>{t('settleDebt.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>{t('settleDebt.title', { name: customer.name })}</Text>
      
      <View style={styles.summaryBox}>
        <Text style={styles.totalLabel}>{t('settleDebt.totalOwed')}</Text>
        <Text style={styles.totalText}>Rp {totalDebt.toLocaleString()}</Text>
      </View>

      <Text style={styles.label}>{t('settleDebt.outstandingTransactions')}</Text>
      <View style={styles.listContainer}>
        {unpaidTransactions.length === 0 ? (
          <Text style={styles.emptyText}>{t('settleDebt.noPendingDebt')}</Text>
        ) : (
          unpaidTransactions.map(txn => {
            const owes = txn.totalAmount - txn.cashGiven;
            return (
              <View key={txn.id} style={styles.txnCard}>
                <View style={styles.txnRowHeader}>
                  <View>
                    <Text style={styles.txnDate}>{new Date(txn.date).toLocaleString()}</Text>
                    <Text style={styles.txnId}>{t('settleDebt.transaction', { id: txn.id })}</Text>
                  </View>
                  <Text style={styles.txnOwes}>Rp {owes.toLocaleString()}</Text>
                </View>
                <View style={styles.txnItemsContainer}>
                  {txn.items.map((i, idx) => (
                    <View key={idx} style={styles.itemRow}>
                       <Text style={styles.itemName}>{i.quantity}x {i.name}</Text>
                       <Text style={styles.itemPrice}>Rp {i.subtotal.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.label}>{t('settleDebt.settlementAmount')}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={paymentAmount}
          onChangeText={setPaymentAmount}
          placeholder={t('settleDebt.enterAmount')}
        />
        <Text style={styles.hint}>{t('settleDebt.pointHint')}</Text>
        {(parseFloat(paymentAmount) || 0) > totalDebt && totalDebt > 0 && (
          <Text style={styles.changeText}>{t('settleDebt.changeToReturn', { amount: ((parseFloat(paymentAmount) || 0) - totalDebt).toLocaleString() })}</Text>
        )}
      </View>

      <TouchableOpacity 
        style={[styles.settleBtn, (unpaidTransactions.length === 0 || isProcessing) && { backgroundColor: '#cbd5e1' }]} 
        onPress={handleSettle}
        disabled={unpaidTransactions.length === 0 || isProcessing}
      >
        <Text style={styles.settleBtnText}>{isProcessing ? t('settleDebt.processing') : t('settleDebt.submitPayment')}</Text>
      </TouchableOpacity>
      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fcfcfc' },
  heading: { fontSize: 24, fontWeight: '800', marginBottom: 20, color: '#1a1a1a' },
  summaryBox: { backgroundColor: '#fee2e2', padding: 20, borderRadius: 12, marginBottom: 30, alignItems: 'center' },
  totalLabel: { color: '#ef4444', fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  totalText: { color: '#b91c1c', fontSize: 32, fontWeight: '900' },
  label: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  listContainer: { marginBottom: 30 },
  txnCard: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  txnRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  txnDate: { fontWeight: 'bold', color: '#334155', fontSize: 14 },
  txnId: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  txnOwes: { fontWeight: '900', color: '#ef4444', fontSize: 16 },
  txnItemsContainer: { padding: 15 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemName: { color: '#475569', fontSize: 14 },
  itemPrice: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  emptyText: { color: '#94a3b8', fontStyle: 'italic' },
  inputSection: { marginBottom: 30 },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 20, fontWeight: 'bold' },
  hint: { color: '#64748b', fontSize: 12, marginTop: 8 },
  changeText: { color: '#10b981', fontWeight: 'bold', fontSize: 16, marginTop: 10 },
  settleBtn: { backgroundColor: '#10b981', padding: 20, borderRadius: 12, alignItems: 'center' },
  settleBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  printBtn: { backgroundColor: '#3b82f6', padding: 20, borderRadius: 12, alignItems: 'center' },
  printBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});
