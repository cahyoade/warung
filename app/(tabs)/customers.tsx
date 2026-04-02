import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

type Customer = { id: number, name: string, phone: string, totalDebt: number, accumulatedPoints: number };

export default function CustomersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
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
        <Text style={styles.title}>Customers & Debt</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-customer')}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.emptyText}>No customers registered yet!</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone} • {item.accumulatedPoints} pts</Text>
            </View>
            <View style={[styles.debtBadge, item.totalDebt > 0 ? styles.activeDebt : null]}>
                <Text style={[styles.debtText, item.totalDebt > 0 ? styles.activeDebtText : null]}>
                  {item.totalDebt > 0 ? `Owes Rp ${item.totalDebt.toLocaleString()}` : 'No Debt'}
                </Text>
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
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a' },
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
