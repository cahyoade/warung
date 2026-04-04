import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../src/i18n/LanguageContext';

type Customer = { id: number, name: string, phone: string, accumulatedPoints: number };

export default function RedeemPointsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const customerId = parseInt(params.customerId as string, 10);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [redeemAmount, setRedeemAmount] = useState('');

  const POINT_VALUE = 500; // internal: 1 point = Rp 500 discount

  useEffect(() => {
    if (isNaN(customerId)) return;
    fetchCustomer();
  }, [customerId]);

  const fetchCustomer = async () => {
    const cust = await db.getFirstAsync<Customer>('SELECT * FROM Customer WHERE id = ?', [customerId]);
    setCustomer(cust);
  };

  const pointsToRedeem = parseInt(redeemAmount, 10) || 0;

  const handleRedeem = async () => {
    if (!customer) return;

    if (isNaN(pointsToRedeem) || pointsToRedeem <= 0) {
      Alert.alert(t('common.error'), t('redeemPoints.errorAmount'));
      return;
    }

    if (pointsToRedeem > customer.accumulatedPoints) {
      Alert.alert(t('common.error'), t('redeemPoints.errorExceed'));
      return;
    }

    try {
      await db.runAsync(
        'UPDATE Customer SET accumulatedPoints = accumulatedPoints - ? WHERE id = ?',
        [pointsToRedeem, customerId]
      );

      Alert.alert(
        t('common.success'),
        t('redeemPoints.success', {
          points: pointsToRedeem,
        })
      );

      router.replace('/(tabs)/customers');
    } catch (error) {
      console.error(error);
      Alert.alert(t('common.error'), t('redeemPoints.error'));
    }
  };

  const handleRedeemAll = () => {
    if (customer) {
      setRedeemAmount(customer.accumulatedPoints.toString());
    }
  };

  if (!customer) return null;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>{t('redeemPoints.title', { name: customer.name })}</Text>

      <View style={styles.summaryBox}>
        <Text style={styles.totalLabel}>{t('redeemPoints.availablePoints')}</Text>
        <Text style={styles.totalText}>{customer.accumulatedPoints} {t('customers.pts')}</Text>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.label}>{t('redeemPoints.pointsToRedeem')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
            value={redeemAmount}
            onChangeText={setRedeemAmount}
            placeholder={t('redeemPoints.enterPoints')}
          />
          <TouchableOpacity style={styles.allBtn} onPress={handleRedeemAll}>
            <Text style={styles.allBtnText}>{t('redeemPoints.all')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.redeemBtn, (pointsToRedeem <= 0 || pointsToRedeem > customer.accumulatedPoints) && { backgroundColor: '#cbd5e1' }]}
        onPress={handleRedeem}
        disabled={pointsToRedeem <= 0 || pointsToRedeem > customer.accumulatedPoints}
      >
        <Text style={styles.redeemBtnText}>{t('redeemPoints.submit')}</Text>
      </TouchableOpacity>
      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fcfcfc' },
  heading: { fontSize: 24, fontWeight: '800', marginBottom: 20, color: '#1a1a1a' },
  summaryBox: { backgroundColor: '#dbeafe', padding: 20, borderRadius: 12, marginBottom: 30, alignItems: 'center' },
  totalLabel: { color: '#2563eb', fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  totalText: { color: '#1d4ed8', fontSize: 32, fontWeight: '900' },
  label: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 15 },
  inputSection: { marginBottom: 30 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { backgroundColor: '#fff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', fontSize: 20, fontWeight: 'bold' },
  allBtn: { backgroundColor: '#e0e7ff', paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center' },
  allBtnText: { color: '#4f46e5', fontWeight: 'bold', fontSize: 14 },
  redeemBtn: { backgroundColor: '#8b5cf6', padding: 20, borderRadius: 12, alignItems: 'center' },
  redeemBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
