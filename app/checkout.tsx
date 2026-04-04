import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../src/i18n/LanguageContext';
import { PrinterService } from '../src/utils/PrinterService';

type Customer = { id: number, name: string };
type CartItem = { id: number, name: string, activeUnitPrice: number, costPrice: number, cartQty: number };

export default function CheckoutScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();

  const cartData: CartItem[] = params.cartData ? JSON.parse(params.cartData as string) : [];
  const totalAmount = parseFloat(params.totalAmount as string) || 0;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const [paymentType, setPaymentType] = useState<'Cash' | 'PayLater'>('Cash');
  const [cashGiven, setCashGiven] = useState('');

  const [finalizedTransactionId, setFinalizedTransactionId] = useState<number | null>(null);
  const [finalizedPoints, setFinalizedPoints] = useState<number>(0);
  const [finalizedTotalPoints, setFinalizedTotalPoints] = useState<number>(0);

  // Debt payment state
  const [customerDebt, setCustomerDebt] = useState<number>(0);
  const [includeDebtPayment, setIncludeDebtPayment] = useState(false);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [finalizedDebtPayment, setFinalizedDebtPayment] = useState<number>(0);

  // Customer picker modal state
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const refreshCustomers = () => {
    db.getAllAsync<Customer>('SELECT id, name FROM Customer').then(setCustomers);
  };

  const fetchCustomerDebt = async (custId: number | null) => {
    if (!custId) {
      setCustomerDebt(0);
      setIncludeDebtPayment(false);
      setDebtPaymentAmount('');
      return;
    }
    const row = await db.getFirstAsync<{ debt: number }>(
      `SELECT COALESCE(SUM(totalAmount - cashGiven), 0) as debt FROM "Transaction" WHERE customerId = ? AND paymentStatus = 'Unpaid' AND isVoided = 0`,
      [custId]
    );
    const debt = row?.debt ?? 0;
    setCustomerDebt(debt);
    if (debt <= 0) {
      setIncludeDebtPayment(false);
      setDebtPaymentAmount('');
    }
  };

  // Total Profit is sum of (activeUnitPrice - costPrice) * qty
  const totalProfit = cartData.reduce((sum, item) => sum + ((item.activeUnitPrice - item.costPrice) * item.cartQty), 0);

  useEffect(() => {
    db.getAllAsync<Customer>('SELECT id, name FROM Customer').then(setCustomers);
  }, []);

  useEffect(() => {
    fetchCustomerDebt(selectedCustomerId);
  }, [selectedCustomerId]);

  const cashGivenNum = parseFloat(cashGiven) || 0;
  const debtPayNum = includeDebtPayment ? (parseFloat(debtPaymentAmount) || 0) : 0;
  const totalWithDebt = totalAmount + debtPayNum;
  const cashShortfall = paymentType === 'Cash' ? Math.max(0, totalAmount - cashGivenNum) : 0;
  const change = cashGivenNum - totalWithDebt;

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) ?? null;

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const handleFinalize = async () => {
    if (paymentType === 'Cash' && cashGivenNum < totalAmount && !selectedCustomerId) {
      Alert.alert(t('common.error'), t('checkout.errorCashNoCustomer'));
      return;
    }
    if (paymentType === 'PayLater' && !selectedCustomerId) {
      Alert.alert(t('common.error'), t('checkout.errorCustomer'));
      return;
    }
    if (includeDebtPayment && debtPayNum <= 0) {
      Alert.alert(t('common.error'), t('checkout.errorDebtAmount'));
      return;
    }
    if (includeDebtPayment && debtPayNum > customerDebt) {
      Alert.alert(t('common.error'), t('checkout.errorDebtExceed'));
      return;
    }
    if (includeDebtPayment && paymentType === 'Cash' && cashGivenNum < totalWithDebt) {
      Alert.alert(t('common.error'), t('checkout.errorCashDebt'));
      return;
    }

    try {
      // 1. Create Transaction
      const dateStr = new Date().toISOString();
      const actualCash = paymentType === 'Cash' ? cashGivenNum : 0;
      const isFullyPaid = paymentType === 'Cash' && cashGivenNum >= totalAmount;
      const status = isFullyPaid ? 'Paid' : 'Unpaid';
      const pointsAwarded = selectedCustomerId && isFullyPaid ? Math.floor(totalAmount / 20000) : 0; // points only for fully paid with customer

      const res = await db.runAsync(
        'INSERT INTO "Transaction" (date, totalAmount, totalProfit, cashGiven, paymentStatus, customerId) VALUES (?, ?, ?, ?, ?, ?)',
        [dateStr, totalAmount, totalProfit, Math.min(actualCash, totalAmount), status, selectedCustomerId || null]
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

      // 3. Award Points to Customer (only for fully paid)
      if (selectedCustomerId && isFullyPaid) {
        await db.runAsync(
          'UPDATE Customer SET accumulatedPoints = accumulatedPoints + ? WHERE id = ?',
          [pointsAwarded, selectedCustomerId]
        );
      }

      // 3b. Process debt payment if included
      let debtPointsAwarded = 0;
      if (includeDebtPayment && debtPayNum > 0 && selectedCustomerId) {
        debtPointsAwarded = Math.floor(debtPayNum / 20000);

        // Distribute payment across unpaid transactions
        const unpaidTxns = await db.getAllAsync<{ id: number, totalAmount: number, cashGiven: number }>(
          `SELECT id, totalAmount, cashGiven FROM "Transaction" WHERE customerId = ? AND paymentStatus = 'Unpaid' AND isVoided = 0 ORDER BY date ASC`,
          [selectedCustomerId]
        );

        let remainingPayment = debtPayNum;
        for (const txn of unpaidTxns) {
          if (remainingPayment <= 0) break;
          const txnOwes = txn.totalAmount - txn.cashGiven;
          const applyToTxn = Math.min(txnOwes, remainingPayment);
          const newCashGiven = txn.cashGiven + applyToTxn;
          const newStatus = newCashGiven >= txn.totalAmount ? 'Paid' : 'Unpaid';
          await db.runAsync(
            'UPDATE "Transaction" SET cashGiven = ?, paymentStatus = ? WHERE id = ?',
            [newCashGiven, newStatus, txn.id]
          );
          remainingPayment -= applyToTxn;
        }

        // Insert DebtSettlement record
        await db.runAsync(
          'INSERT INTO "Transaction" (date, totalAmount, totalProfit, cashGiven, paymentStatus, customerId, isVoided) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [dateStr, debtPayNum, 0, debtPayNum, 'DebtSettlement', selectedCustomerId, 0]
        );

        // Award debt payment points
        if (debtPointsAwarded > 0) {
          await db.runAsync(
            'UPDATE Customer SET accumulatedPoints = accumulatedPoints + ? WHERE id = ?',
            [debtPointsAwarded, selectedCustomerId]
          );
        }
      }

      // Fetch updated points balance for the customer
      let totalPoints = 0;
      if (selectedCustomerId) {
        const row = await db.getFirstAsync<{ accumulatedPoints: number }>(
          'SELECT accumulatedPoints FROM Customer WHERE id = ?',
          [selectedCustomerId]
        );
        totalPoints = row?.accumulatedPoints ?? 0;
      }

      setFinalizedTransactionId(transactionId);
      setFinalizedPoints(pointsAwarded + debtPointsAwarded);
      setFinalizedTotalPoints(totalPoints);
      setFinalizedDebtPayment(debtPayNum);

      const debtAmount = paymentType === 'Cash' ? Math.max(0, totalAmount - cashGivenNum) : totalAmount;
      const debtMsg = debtAmount > 0 && selectedCustomerId
        ? `\n${t('checkout.debtAdded', { amount: debtAmount.toLocaleString() })}`
        : '';
      const totalPtsAwarded = pointsAwarded + debtPointsAwarded;
      const pointsMsg = selectedCustomerId && totalPtsAwarded > 0 ? ` ${totalPtsAwarded} pts.` : '';
      const debtPayMsg = debtPayNum > 0 ? `\n${t('checkout.debtPaid', { amount: debtPayNum.toLocaleString() })}` : '';
      Alert.alert(t('common.success'), `${t('checkout.finalize')}!${pointsMsg}${debtMsg}${debtPayMsg}`);

    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('checkout.errorFinalize'));
    }
  };

  const handlePrint = async () => {
    if (finalizedTransactionId === null) return;
    const actualCash = paymentType === 'Cash' ? totalWithDebt : 0;
    const receiptItems = cartData.map(c => ({ name: c.name, qty: c.cartQty, subtotal: c.cartQty * c.activeUnitPrice }));
    if (finalizedDebtPayment > 0) {
      receiptItems.push({ name: 'Pembayaran Hutang', qty: 1, subtotal: finalizedDebtPayment });
    }
    const printed = await PrinterService.printReceipt({
      transactionId: finalizedTransactionId,
      items: receiptItems,
      total: totalAmount + finalizedDebtPayment,
      cashGiven: actualCash,
      customerName: customers.find(c => c.id === selectedCustomerId)?.name,
      pointsEarned: finalizedPoints,
      totalPointsBalance: selectedCustomerId ? finalizedTotalPoints : undefined,
    });

    if (!printed) {
      Alert.alert(t('common.error'), t('checkout.printError'));
    }
  };

  if (finalizedTransactionId !== null) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.heading}>{t('checkout.success')}</Text>
        <Text style={styles.totalText}>{t('checkout.transactionNum', { id: finalizedTransactionId })}</Text>

        <View style={{ marginTop: 40, width: '100%' }}>
          <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
            <Text style={styles.printBtnText}>{t('checkout.printReceipt')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.finalizeBtn, { backgroundColor: '#64748b' }]} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.finalizeBtnText}>{t('checkout.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      {/* ── Customer Picker Modal ── */}
      <Modal
        visible={customerModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setCustomerModalVisible(false); setCustomerSearch(''); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior="height"
        >
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('checkout.selectCustomer')}</Text>
              <TouchableOpacity onPress={() => { setCustomerModalVisible(false); setCustomerSearch(''); }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder={t('checkout.searchCustomer')}
                placeholderTextColor="#94a3b8"
                value={customerSearch}
                onChangeText={setCustomerSearch}
                autoFocus
              />
              {customerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setCustomerSearch('')}>
                  <Text style={{ color: '#94a3b8', fontSize: 18, paddingHorizontal: 8 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Add New Customer shortcut */}
            <TouchableOpacity
              style={styles.addCustomerBtn}
              onPress={() => {
                setCustomerModalVisible(false);
                setCustomerSearch('');
                router.push('/add-customer');
              }}
            >
              <Text style={styles.addCustomerBtnText}>+ {t('checkout.addNewCustomer')}</Text>
            </TouchableOpacity>

            {/* List */}
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {/* No customer option */}
              <TouchableOpacity
                style={[styles.customerRow, selectedCustomerId === null && styles.customerRowActive]}
                onPress={() => { setSelectedCustomerId(null); setCustomerModalVisible(false); setCustomerSearch(''); }}
              >
                <View style={[styles.customerAvatar, selectedCustomerId === null && styles.customerAvatarActive]}>
                  <Text style={{ fontSize: 16 }}>—</Text>
                </View>
                <Text style={[styles.customerRowName, selectedCustomerId === null && styles.customerRowNameActive]}>
                  {t('checkout.noCustomer')}
                </Text>
                {selectedCustomerId === null && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>

              {filteredCustomers.length === 0 ? (
                <Text style={styles.emptyText}>{t('checkout.noMatch', { query: customerSearch })}</Text>
              ) : (
                filteredCustomers.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.customerRow, selectedCustomerId === c.id && styles.customerRowActive]}
                    onPress={() => { setSelectedCustomerId(c.id); setCustomerModalVisible(false); setCustomerSearch(''); }}
                  >
                    <View style={[styles.customerAvatar, selectedCustomerId === c.id && styles.customerAvatarActive]}>
                      <Text style={[styles.customerAvatarText, selectedCustomerId === c.id && { color: '#fff' }]}>
                        {c.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.customerRowName, selectedCustomerId === c.id && styles.customerRowNameActive]}>
                      {c.name}
                    </Text>
                    {selectedCustomerId === c.id && <Text style={styles.checkMark}>✓</Text>}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{t('checkout.title')}</Text>
        <View style={styles.summaryBox}>
          <Text style={styles.totalLabel}>{t('checkout.totalDue')}</Text>
          <Text style={styles.totalText}>Rp {totalAmount.toLocaleString()}</Text>
          <Text style={styles.itemCountText}>{t('checkout.items', { count: cartData.length })}</Text>
        </View>

        {/* Customer Selector */}
        <Text style={styles.label}>{t('checkout.customerOptional')}</Text>
        <TouchableOpacity
          style={styles.customerSelector}
          onPress={() => { refreshCustomers(); setCustomerModalVisible(true); }}
          activeOpacity={0.8}
        >
          <View style={styles.customerSelectorLeft}>
            <View style={[styles.customerAvatar, selectedCustomer && styles.customerAvatarActive]}>
              <Text style={[styles.customerAvatarText, selectedCustomer && { color: '#fff' }]}>
                {selectedCustomer ? selectedCustomer.name.charAt(0).toUpperCase() : '—'}
              </Text>
            </View>
            <Text style={styles.customerSelectorName}>
              {selectedCustomer ? selectedCustomer.name : t('checkout.noCustomer')}
            </Text>
          </View>
          <Text style={styles.customerSelectorChevron}>›</Text>
        </TouchableOpacity>

        <Text style={styles.label}>{t('checkout.paymentMethod')}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.payMethodBtn, paymentType === 'Cash' && styles.payMethodBtnActive]} onPress={() => setPaymentType('Cash')}>
            <Text style={[styles.payMethodText, paymentType === 'Cash' && { color: '#fff' }]}>{t('checkout.cash')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.payMethodBtn, paymentType === 'PayLater' && styles.payMethodBtnActive]} onPress={() => setPaymentType('PayLater')}>
            <Text style={[styles.payMethodText, paymentType === 'PayLater' && { color: '#fff' }]}>{t('checkout.payLater')}</Text>
          </TouchableOpacity>
        </View>

        {paymentType === 'Cash' && (
          <View style={styles.cashSection}>
            <Text style={styles.label}>{t('checkout.cashGiven')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Rp"
              value={cashGiven}
              onChangeText={setCashGiven}
            />

            {/* Denomination shortcuts */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.denomRow}
              keyboardShouldPersistTaps="handled"
            >
              {/* Clear button */}
              <TouchableOpacity
                style={[styles.denomChip, styles.denomChipClear]}
                onPress={() => setCashGiven('')}
              >
                <Text style={[styles.denomChipText, styles.denomChipTextClear]}>⌫</Text>
              </TouchableOpacity>

              {/* Exact button */}
              <TouchableOpacity
                style={[styles.denomChip, styles.denomChipExact]}
                onPress={() => setCashGiven(String(totalWithDebt))}
              >
                <Text style={[styles.denomChipText, styles.denomChipTextExact]}>{t('checkout.exact')}</Text>
              </TouchableOpacity>

              {[1000, 2000, 5000, 10000, 20000, 50000, 100000].map(denom => {
                const label = denom >= 1000 ? `+${denom / 1000}k` : `+${denom}`;
                return (
                  <TouchableOpacity
                    key={denom}
                    style={styles.denomChip}
                    onPress={() => {
                      const current = parseFloat(cashGiven) || 0;
                      setCashGiven(String(current + denom));
                    }}
                  >
                    <Text style={styles.denomChipText}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {change > 0 && <Text style={styles.changeText}>{t('checkout.changeToReturn', { amount: change.toLocaleString() })}</Text>}
            {cashShortfall > 0 && selectedCustomerId && (
              <Text style={styles.debtText}>{t('checkout.debtNote', { amount: cashShortfall.toLocaleString() })}</Text>
            )}
            {cashShortfall > 0 && !selectedCustomerId && (
              <Text style={styles.debtWarningText}>{t('checkout.errorCashNoCustomer')}</Text>
            )}
          </View>
        )}

        {/* Debt Payment Option */}
        {paymentType === 'Cash' && selectedCustomerId && customerDebt > 0 && (
          <View style={styles.debtPaymentSection}>
            <TouchableOpacity
              style={styles.debtPaymentToggle}
              onPress={() => {
                setIncludeDebtPayment(!includeDebtPayment);
                if (!includeDebtPayment) setDebtPaymentAmount(String(customerDebt));
                else setDebtPaymentAmount('');
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.debtCheckbox, includeDebtPayment && styles.debtCheckboxActive]}>
                {includeDebtPayment && <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.debtPaymentLabel}>{t('checkout.includeDebtPayment')}</Text>
                <Text style={styles.debtPaymentHint}>{t('checkout.customerOwes', { amount: customerDebt.toLocaleString() })}</Text>
              </View>
            </TouchableOpacity>

            {includeDebtPayment && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>{t('checkout.debtPaymentAmount')}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Rp"
                  value={debtPaymentAmount}
                  onChangeText={setDebtPaymentAmount}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[styles.denomChip, styles.denomChipExact]}
                    onPress={() => setDebtPaymentAmount(String(customerDebt))}
                  >
                    <Text style={[styles.denomChipText, styles.denomChipTextExact]}>{t('checkout.payAll')}</Text>
                  </TouchableOpacity>
                </View>
                {debtPayNum > 0 && (
                  <Text style={[styles.debtText, { marginTop: 8 }]}>
                    {t('checkout.totalWithDebt', { amount: totalWithDebt.toLocaleString() })}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {paymentType === 'PayLater' && (
          <View style={styles.payLaterWarning}>
            <Text style={{ color: '#c2410c' }}>{t('checkout.payLaterWarning')}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.finalizeBtn} onPress={handleFinalize}>
          <Text style={styles.finalizeBtnText}>{t('checkout.finalize')}</Text>
        </TouchableOpacity>
        <View style={{ height: 100 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </>
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

  // Customer selector button
  customerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  customerSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerSelectorName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  customerSelectorChevron: { fontSize: 26, color: '#94a3b8', lineHeight: 28 },

  // Shared avatar
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarActive: { backgroundColor: '#0ea5e9' },
  customerAvatarText: { fontSize: 16, fontWeight: '700', color: '#475569' },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  modalClose: { fontSize: 20, color: '#64748b', padding: 4 },

  // Search bar inside modal
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, height: 44, fontSize: 16, color: '#1e293b' },

  modalList: { flexShrink: 1 },

  // Rows inside modal
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  customerRowActive: { backgroundColor: '#f0f9ff' },
  customerRowName: { flex: 1, fontSize: 16, color: '#334155', fontWeight: '500' },
  customerRowNameActive: { color: '#0ea5e9', fontWeight: '700' },
  checkMark: { fontSize: 18, color: '#0ea5e9', fontWeight: '700' },
  emptyText: { textAlign: 'center', color: '#94a3b8', padding: 30, fontSize: 15 },
  addCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#6ee7b7',
    borderStyle: 'dashed',
  },
  addCustomerBtnText: { fontSize: 15, fontWeight: '700', color: '#059669' },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  payMethodBtn: { flex: 1, padding: 15, backgroundColor: '#e2e8f0', borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
  payMethodBtnActive: { backgroundColor: '#10b981' },
  payMethodText: { fontWeight: 'bold', fontSize: 16 },
  cashSection: { marginBottom: 20 },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 20, fontWeight: 'bold' },

  // Denomination shortcuts
  denomRow: { flexDirection: 'row', marginTop: 12, marginBottom: 4 },
  denomChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 56,
  },
  denomChipExact: {
    backgroundColor: '#ecfdf5',
    borderColor: '#6ee7b7',
  },
  denomChipClear: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  denomChipText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  denomChipTextExact: { color: '#059669' },
  denomChipTextClear: { color: '#e11d48' },

  changeText: { marginTop: 10, color: '#0ea5e9', fontSize: 16, fontWeight: 'bold' },
  debtText: { marginTop: 10, color: '#d97706', fontSize: 15, fontWeight: '600' },
  debtWarningText: { marginTop: 10, color: '#dc2626', fontSize: 14, fontWeight: '600' },
  payLaterWarning: { backgroundColor: '#ffedd5', padding: 15, borderRadius: 10, marginBottom: 20 },
  debtPaymentSection: {
    backgroundColor: '#fffbeb',
    borderWidth: 1.5,
    borderColor: '#fcd34d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  debtPaymentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  debtCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d97706',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  debtCheckboxActive: {
    backgroundColor: '#d97706',
    borderColor: '#d97706',
  },
  debtPaymentLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400e',
  },
  debtPaymentHint: {
    fontSize: 13,
    color: '#b45309',
    marginTop: 2,
  },
  finalizeBtn: { backgroundColor: '#0f172a', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  finalizeBtnText: { color: '#f8fafc', fontWeight: 'bold', fontSize: 20 },
  printBtn: { backgroundColor: '#3b82f6', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  printBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 20 }
});
