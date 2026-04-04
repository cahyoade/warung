import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../src/i18n/LanguageContext';

type Product = { id: number, name: string, stockCount: number, basePrice: number, unitOfMeasure: string };

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);

  async function fetchProducts() {
    const result = await db.getAllAsync<Product>('SELECT * FROM Product');
    setProducts(result);
    setFilteredProducts(
      search.trim() === ''
        ? result
        : result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    );
  }

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [search])
  );

  const handleSearch = (text: string) => {
    setSearch(text);
    if (text.trim() === '') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(
        products.filter((p) => p.name.toLowerCase().includes(text.toLowerCase()))
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('inventory.title')}</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-product')}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.addButtonText}>{t('inventory.addGood')}</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder={t('inventory.searchProducts')}
        value={search}
        onChangeText={handleSearch}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={<Text style={styles.emptyText}>{t('inventory.noProducts')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.productRow}>
            <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                <Text style={styles.productPrice} numberOfLines={1} ellipsizeMode="tail">Rp {item.basePrice.toLocaleString()} / {item.unitOfMeasure}</Text>
            </View>
            <View style={styles.rightActions}>
                <View style={styles.stockBadge}>
                    <Text style={styles.stockText}>{item.stockCount} {t('inventory.inStock')}</Text>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: '/add-product', params: { productId: item.id } })} style={styles.editButton}>
                    <Ionicons name="pencil" size={20} color="#64748b" />
                </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fcfcfc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: '#1a1a1a' },
  addButton: { flexDirection: 'row', backgroundColor: '#0ea5e9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#666', fontSize: 16 },
  productRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  productInfo: { flex: 1, marginRight: 12 },
  productName: { fontSize: 18, fontWeight: '600', color: '#333' },
  productPrice: { fontSize: 14, color: '#777', marginTop: 4 },
  stockBadge: { backgroundColor: '#f0f9ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  stockText: { color: '#0284c7', fontWeight: '600', fontSize: 12 },
  rightActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  editButton: { marginLeft: 12, padding: 4 }
});
