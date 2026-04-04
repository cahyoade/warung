import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../src/i18n/LanguageContext';

type Customer = { id: number, name: string, phone: string, totalDebt: number, accumulatedPoints: number };

export default function CustomersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);

  async function fetchCustomers() {
    const query = `
      SELECT c.*, 
        COALESCE(SUM(t.totalAmount - t.cashGiven), 0) as totalDebt
      FROM Customer c
      LEFT JOIN "Transaction" t ON t.customerId = c.id AND t.paymentStatus = 'Unpaid' AND t.isVoided = 0
      GROUP BY c.id
    `;
    const result = await db.getAllAsync<Customer>(query);
    setCustomers(result);
    setFilteredCustomers(
      search.trim() === ''
        ? result
        : result.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.toLowerCase().includes(search.toLowerCase()))
    );
  }

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [search])
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    if (text.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      setFilteredCustomers(
        customers.filter((c) => c.name.toLowerCase().includes(text.toLowerCase()) || c.phone.toLowerCase().includes(text.toLowerCase()))
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('customers.title')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-customer')}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>{t('customers.add')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('customers.searchCustomers')}
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={handleSearch}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filteredCustomers}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('customers.noCustomers')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.customerInfo}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone} • {item.accumulatedPoints} {t('customers.pts')}</Text>
                <View style={[styles.debtBadge, item.totalDebt > 0 ? styles.activeDebt : null]}>
                    <Text style={[styles.debtText, item.totalDebt > 0 ? styles.activeDebtText : null]}>
                      {item.totalDebt > 0 ? t('customers.owes', { amount: item.totalDebt.toLocaleString() }) : t('customers.noDebt')}
                    </Text>
                </View>
            </View>
            <View style={styles.actionColumn}>
              <TouchableOpacity
                style={styles.settleButton}
                onPress={() => router.push({ pathname: '/settle-debt', params: { customerId: item.id } })}
              >
                <Ionicons name="cash-outline" size={16} color="#0ea5e9" />
                <Text style={styles.settleText}>{t('customers.settleDebt')}</Text>
              </TouchableOpacity>
              {item.accumulatedPoints > 0 && (
                <TouchableOpacity
                  style={styles.redeemBadge}
                  onPress={() => router.push({ pathname: '/redeem-points', params: { customerId: item.id } })}
                >
                  <Text style={styles.redeemText}>🎁 {t('customers.redeem')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
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
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16, paddingHorizontal: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 16, color: '#1f2937' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#666', fontSize: 16 },
  row: { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  customerInfo: { marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '600', color: '#333' },
  phone: { fontSize: 14, color: '#777', marginTop: 4 },
  debtBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start', marginTop: 8 },
  debtText: { color: '#64748b', fontWeight: '600', fontSize: 12 },
  activeDebt: { backgroundColor: '#fef2f2' },
  activeDebtText: { color: '#ef4444' },
  actionColumn: { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  settleButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, gap: 6, flex: 1, justifyContent: 'center' },
  settleText: { color: '#0ea5e9', fontWeight: '600', fontSize: 14 },
  redeemBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ede9fe', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, flex: 1, justifyContent: 'center' },
  redeemText: { color: '#7c3aed', fontWeight: '600', fontSize: 14 },
});
