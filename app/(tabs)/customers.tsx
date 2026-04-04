import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../src/i18n/LanguageContext';

type Customer = { id: number, name: string, phone: string, totalDebt: number, accumulatedPoints: number };

export default function CustomersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);

  async function fetchCustomers() {
    // We get customer and dynamically sum their debt
    const query = `
      SELECT c.*, 
        COALESCE(SUM(t.totalAmount - t.cashGiven), 0) as totalDebt
      FROM Customer c
      LEFT JOIN "Transaction" t ON t.customerId = c.id AND t.paymentStatus = 'Unpaid' AND t.isVoided = 0
      GROUP BY c.id
    `;
    const result = await db.getAllAsync<Customer>(query);
    setCustomers(result);
  }

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('customers.title')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-customer')}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>{t('customers.add')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('customers.noCustomers')}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.row}
            onPress={() => router.push({ pathname: '/settle-debt', params: { customerId: item.id } })}
          >
            <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone} • {item.accumulatedPoints} {t('customers.pts')}</Text>
            </View>
            <View style={[styles.debtBadge, item.totalDebt > 0 ? styles.activeDebt : null]}>
                <Text style={[styles.debtText, item.totalDebt > 0 ? styles.activeDebtText : null]}>
                  {item.totalDebt > 0 ? t('customers.owes', { amount: item.totalDebt.toLocaleString() }) : t('customers.noDebt')}
                </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fcfcfc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },
  addButton: { flexDirection: 'row', backgroundColor: '#0ea5e9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 6 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#666', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  name: { fontSize: 18, fontWeight: '600', color: '#333' },
  phone: { fontSize: 14, color: '#777', marginTop: 4 },
  debtBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  debtText: { color: '#64748b', fontWeight: '600', fontSize: 12 },
  activeDebt: { backgroundColor: '#fef2f2' },
  activeDebtText: { color: '#ef4444' }
});
