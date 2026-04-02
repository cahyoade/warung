import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

type Product = { id: number, name: string, stockCount: number, basePrice: number, costPrice: number, unitOfMeasure: string };
type PriceTier = { productId: number, minQuantity: number, price: number };

// The CartItem extends Product to add logic info
export type CartItem = Product & { cartQty: number, activeUnitPrice: number };

export default function POSScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Refresh products and tiers every time tab is focused
  useFocusEffect(
    React.useCallback(() => {
      async function fetchProducts() {
        const prods = await db.getAllAsync<Product>('SELECT * FROM Product');
        const trs = await db.getAllAsync<PriceTier>('SELECT * FROM ProductPriceTier');
        setProducts(prods);
        setTiers(trs);
      }
      fetchProducts();
    }, [db])
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      let newCart = [...prev];
      if (existing) {
        existing.cartQty += 1;
      } else {
        newCart.push({ ...product, cartQty: 1, activeUnitPrice: product.basePrice });
      }

      // Recalculate prices based on tiers
      return newCart.map(item => {
        // Find best tier
        const productTiers = tiers.filter(t => t.productId === item.id).sort((a,b) => b.minQuantity - a.minQuantity);
        let bestPrice = item.basePrice;
        for (const t of productTiers) {
          if (item.cartQty >= t.minQuantity) {
            bestPrice = t.price;
            break;
          }
        }
        return { ...item, activeUnitPrice: bestPrice };
      });
    });
  };

  const currentTotal = cart.reduce((sum, item) => sum + (item.activeUnitPrice * item.cartQty), 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Warung POS</Text>
        <TouchableOpacity style={styles.quickAddBtn} onPress={() => router.push('/add-product')}>
          <Ionicons name="flash" size={20} color="#fff" />
          <Text style={styles.quickAddText}>Quick Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Product Grid */}
        <View style={styles.gridContainer}>
          <FlatList
            data={products}
            numColumns={2}
            keyExtractor={p => p.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productCard} onPress={() => addToCart(item)}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>Rp {item.basePrice.toLocaleString()}</Text>
                <Text style={styles.productStock}>{item.stockCount} {item.unitOfMeasure} left</Text>
                {tiers.some(t => t.productId === item.id) && (
                   <View style={styles.wholesaleBadge}><Text style={styles.wholesaleText}>Wholesale</Text></View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Cart Sidebar / Bottom Area */}
        <View style={styles.cartContainer}>
          <Text style={styles.cartTitle}>Current Cart</Text>
          <FlatList
            data={cart}
            keyExtractor={c => c.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.cartItemRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.cartItemName}>{item.name}</Text>
                  <Text style={styles.cartItemPrice}>Rp {item.activeUnitPrice.toLocaleString()} / {item.unitOfMeasure}</Text>
                </View>
                <Text style={styles.cartQty}>x {item.cartQty}</Text>
                <Text style={styles.cartSubtotal}>Rp {(item.cartQty * item.activeUnitPrice).toLocaleString()}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={{textAlign: 'center', color: '#888', marginTop: 20}}>Cart is empty</Text>}
          />
          <View style={styles.checkoutBox}>
            <Text style={styles.totalText}>Total: Rp {currentTotal.toLocaleString()}</Text>
            <TouchableOpacity 
               style={[styles.checkoutBtn, cart.length === 0 && {backgroundColor: '#ccc'}]} 
               disabled={cart.length === 0}
               onPress={() => router.push({ pathname: '/checkout', params: { cartData: JSON.stringify(cart), totalAmount: currentTotal } })}
            >
               <Text style={styles.checkoutBtnText}>Checkout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 15, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: '#0f172a' },
  quickAddBtn: { flexDirection: 'row', backgroundColor: '#eab308', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  quickAddText: { color: '#fff', fontWeight: 'bold', marginLeft: 4 },
  content: { flex: 1, flexDirection: 'row' },
  gridContainer: { flex: 2, paddingHorizontal: 10 },
  productCard: { backgroundColor: '#fff', flex: 1, margin: 8, padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  productName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  productPrice: { fontSize: 14, color: '#0ea5e9', marginTop: 4, fontWeight: '600' },
  productStock: { fontSize: 12, color: '#64748b', marginTop: 8 },
  wholesaleBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: '#ecfdf5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  wholesaleText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  cartContainer: { flex: 1.2, backgroundColor: '#fff', borderLeftWidth: 1, borderColor: '#e2e8f0', padding: 15 },
  cartTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#334155' },
  cartItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderColor: '#f1f5f9', paddingBottom: 10 },
  cartItemName: { fontWeight: '600', color: '#1e293b' },
  cartItemPrice: { fontSize: 12, color: '#64748b' },
  cartQty: { fontWeight: 'bold', marginHorizontal: 10, color: '#0ea5e9' },
  cartSubtotal: { fontWeight: 'bold', color: '#0f172a' },
  checkoutBox: { marginTop: 'auto', borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 15 },
  totalText: { fontSize: 22, fontWeight: '900', color: '#1e293b', marginBottom: 15 },
  checkoutBtn: { backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center' },
  checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});
