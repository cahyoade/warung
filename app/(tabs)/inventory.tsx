import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Product = { id: number, name: string, stockCount: number, basePrice: number, unitOfMeasure: string };

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);

  async function fetchProducts() {
    const result = await db.getAllAsync<Product>('SELECT * FROM Product');
    setProducts(result);
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-product')}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>Add Good</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.emptyText}>No products found. Start by adding some goods!</Text>}
        renderItem={({ item }) => (
          <View style={styles.productRow}>
            <View>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>Rp {item.basePrice.toLocaleString()} / {item.unitOfMeasure}</Text>
            </View>
            <View style={styles.stockBadge}>
                <Text style={styles.stockText}>{item.stockCount} in stock</Text>
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
  addButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#666', fontSize: 16 },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  productName: { fontSize: 18, fontWeight: '600', color: '#333' },
  productPrice: { fontSize: 14, color: '#777', marginTop: 4 },
  stockBadge: { backgroundColor: '#f0f9ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  stockText: { color: '#0284c7', fontWeight: '600', fontSize: 12 }
});
