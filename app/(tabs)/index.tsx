import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useRef, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../../src/i18n/LanguageContext';

type Product = { id: number, name: string, barcode: string, stockCount: number, basePrice: number, costPrice: number, unitOfMeasure: string };
type PriceTier = { productId: number, minQuantity: number, price: number };

type ProductWithTierRow = Product & { tierMinQty: number | null, tierPrice: number | null };

// The CartItem extends Product to add logic info
export type CartItem = Product & { cartQty: number, activeUnitPrice: number };

export default function POSScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();

  const [products, setProducts] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Search & Barcode state
  const [searchQuery, setSearchQuery] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  // Fractional Modal State
  const [fractionModalVisible, setFractionModalVisible] = useState(false);
  const [selectedFractionProduct, setSelectedFractionProduct] = useState<Product | null>(null);
  const [customFraction, setCustomFraction] = useState('');

  // Refresh products and tiers every time tab is focused
  useFocusEffect(
    React.useCallback(() => {
      async function fetchProducts() {
        const rows = await db.getAllAsync<ProductWithTierRow>(`
          SELECT p.*, 
                 t.minQuantity AS tierMinQty, 
                 t.price AS tierPrice
          FROM Product p
          LEFT JOIN ProductPriceTier t ON p.id = t.productId
        `);

        const productsMap = new Map<number, Product>();
        const trs: PriceTier[] = [];

        for (const row of rows) {
          if (!productsMap.has(row.id)) {
            productsMap.set(row.id, {
              id: row.id,
              name: row.name,
              barcode: row.barcode,
              stockCount: row.stockCount,
              basePrice: row.basePrice,
              costPrice: row.costPrice,
              unitOfMeasure: row.unitOfMeasure,
            });
          }

          if (row.tierMinQty !== null && row.tierPrice !== null) {
            trs.push({
              productId: row.id,
              minQuantity: row.tierMinQty,
              price: row.tierPrice,
            });
          }
        }

        setProducts(Array.from(productsMap.values()));
        setTiers(trs);
      }
      fetchProducts();
    }, [db])
  );

  const handleProductTap = (product: Product) => {
      const isUncountable = ['kg', 'g', 'gram', 'liter', 'l'].includes(product.unitOfMeasure.toLowerCase());
      if (isUncountable) {
          setSelectedFractionProduct(product);
          setFractionModalVisible(true);
      } else {
          addToCart(product, 1);
      }
  };

  const updateCartItemQuantity = (productId: number, newQty: number) => {
    setCart(prev => {
      let newCart = prev.map(item => {
        if (item.id === productId) {
          return { ...item, cartQty: newQty };
        }
        return item;
      }).filter(item => item.cartQty > 0);

      // Recalculate prices based on tiers
      return newCart.map(item => {
        const productTiers = tiers.filter(t => t.productId === item.id).sort((a, b) => b.minQuantity - a.minQuantity);
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

  const addToCartFromModal = (qty: number) => {
      if (selectedFractionProduct) {
          addToCart(selectedFractionProduct, qty);
          setFractionModalVisible(false);
          setCustomFraction('');
          setSelectedFractionProduct(null);
      }
  };

  const addToCart = (product: Product, qty: number = 1) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      let newCart = [...prev];
      if (existing) {
        existing.cartQty += qty;
      } else {
        newCart.push({ ...product, cartQty: qty, activeUnitPrice: product.basePrice });
      }

      // Recalculate prices based on tiers
      return newCart.map(item => {
        // Find best tier
        const productTiers = tiers.filter(t => t.productId === item.id).sort((a, b) => b.minQuantity - a.minQuantity);
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

  const filteredProducts = searchQuery.trim()
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : products;

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(t('pos.permissionRequired'), t('pos.cameraPermissionMsg'));
        return;
      }
    }
    scannedRef.current = false;
    setScannerVisible(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScannerVisible(false);

    // Match by exact barcode field first, then fall back to name search
    const matched = products.find(p => p.barcode && p.barcode === data)
      ?? products.find(p => p.name.toLowerCase().includes(data.toLowerCase()));

    if (matched) {
      handleProductTap(matched);
    } else {
      setSearchQuery('');
      Alert.alert(t('pos.notFound'), t('pos.notFoundMsg', { barcode: data }));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('pos.title')}</Text>
        <TouchableOpacity style={styles.quickAddBtn} onPress={() => router.push('/add-product')}>
          <Ionicons name="flash" size={20} color="#fff" />
          <Text style={styles.quickAddText}>{t('pos.quickAdd')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Product Grid */}
        <View style={styles.gridContainer}>
          {/* Search Bar */}
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={15} color="#94a3b8" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('pos.searchProduct')}
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
              <Ionicons name="barcode-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={filteredProducts}
            numColumns={1}
            keyExtractor={p => p.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.productCard} onPress={() => handleProductTap(item)}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>Rp {item.basePrice.toLocaleString()}</Text>
                <Text style={styles.productStock}>{item.stockCount} {item.unitOfMeasure} {t('pos.left')}</Text>
                {tiers.some(t => t.productId === item.id) && (
                  <View style={styles.wholesaleBadge}><Text style={styles.wholesaleText}>{t('pos.wholesale')}</Text></View>
                )}
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Cart Sidebar / Bottom Area */}
        <View style={styles.cartContainer}>
          <Text style={styles.cartTitle}>{t('pos.currentCart')}</Text>
          <FlatList
            data={cart}
            keyExtractor={c => c.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.cartItemRow}>
                {/* Top row: name + price */}
                <View style={styles.cartItemTop}>
                  <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.cartItemPrice}>Rp {item.activeUnitPrice.toLocaleString()} / {item.unitOfMeasure}</Text>
                </View>
                {/* Bottom: qty controls then subtotal stacked */}
                <View style={styles.cartItemBottom}>
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      onPress={() => updateCartItemQuantity(item.id, item.cartQty - (item.cartQty > 0 && item.cartQty < 1 ? item.cartQty : 1))}
                      style={styles.qtyBtn}
                    >
                      <Ionicons name={item.cartQty <= 1 ? "trash" : "remove"} size={14} color={item.cartQty <= 1 ? "#ef4444" : "#475569"} />
                    </TouchableOpacity>
                    <Text style={styles.cartQty}>{item.cartQty}</Text>
                    <TouchableOpacity
                      onPress={() => updateCartItemQuantity(item.id, item.cartQty + 1)}
                      style={styles.qtyBtn}
                    >
                      <Ionicons name="add" size={14} color="#475569" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.cartSubtotal}>Rp {(item.cartQty * item.activeUnitPrice).toLocaleString()}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#888', marginTop: 20 }}>{t('pos.cartEmpty')}</Text>}
          />
          <View style={styles.checkoutBox}>
            <Text style={styles.totalLabel}>{t('pos.total')}</Text>
            <Text style={styles.totalAmount}>Rp {currentTotal.toLocaleString()}</Text>
            <TouchableOpacity
              style={[styles.checkoutBtn, cart.length === 0 && { backgroundColor: '#ccc' }]}
              disabled={cart.length === 0}
              onPress={() => router.push({ pathname: '/checkout', params: { cartData: JSON.stringify(cart), totalAmount: currentTotal } })}
            >
              <Text style={styles.checkoutBtnText}>{t('pos.checkout')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      
      {/* Barcode Scanner Modal */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a', 'upc_e'] }}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>{t('pos.pointCamera')}</Text>
          </View>
          <TouchableOpacity style={styles.scanClose} onPress={() => setScannerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Fractional Quantity Modal */}
      <Modal visible={fractionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>{t('pos.selectQuantity')}</Text>
                <Text style={styles.modalSubtitle}>{selectedFractionProduct?.name}</Text>
                
                <View style={styles.fractionRow}>
                    <TouchableOpacity onPress={() => addToCartFromModal(0.25)} style={styles.fractionBtn}><Text style={styles.fractionBtnText}>1/4</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => addToCartFromModal(0.5)} style={styles.fractionBtn}><Text style={styles.fractionBtnText}>1/2</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => addToCartFromModal(0.75)} style={styles.fractionBtn}><Text style={styles.fractionBtnText}>3/4</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => addToCartFromModal(1)} style={styles.fractionBtn}><Text style={styles.fractionBtnText}>1</Text></TouchableOpacity>
                </View>

                <TextInput style={styles.fractionInput} keyboardType="numeric" placeholder={t('pos.orEnterCustom')} onChangeText={setCustomFraction} value={customFraction} />

                <View style={styles.modalActions}>
                    <TouchableOpacity onPress={() => { setFractionModalVisible(false); setCustomFraction(''); }} style={styles.modalCancelBtn}><Text style={styles.modalCancelText}>{t('pos.cancel')}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => {
                        const val = parseFloat(customFraction);
                        if (!isNaN(val) && val > 0) addToCartFromModal(val);
                    }} style={styles.modalConfirmBtn}><Text style={styles.modalConfirmText}>{t('pos.add')}</Text></TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 36 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 8, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  quickAddBtn: { flexDirection: 'row', backgroundColor: '#eab308', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  quickAddText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 13 },
  content: { flex: 1, flexDirection: 'row' },
  gridContainer: { flex: 2, paddingHorizontal: 4 },
  productCard: { backgroundColor: '#fff', flex: 1, margin: 5, padding: 10, borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  productName: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  productPrice: { fontSize: 11, color: '#0ea5e9', marginTop: 2, fontWeight: '600' },
  productStock: { fontSize: 10, color: '#64748b', marginTop: 4 },
  wholesaleBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#ecfdf5', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  wholesaleText: { color: '#10b981', fontSize: 9, fontWeight: 'bold' },
  searchRow: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: 4, marginBottom: 6 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0', marginRight: 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#1e293b', padding: 0 },
  scanBtn: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 220, height: 140, borderWidth: 2, borderColor: '#0ea5e9', borderRadius: 12, backgroundColor: 'transparent' },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 14, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  scanClose: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6 },
  cartContainer: { flex: 1.6, backgroundColor: '#fff', borderLeftWidth: 1, borderColor: '#e2e8f0', padding: 15 },
  cartTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#334155' },
  cartItemRow: { flexDirection: 'column', marginBottom: 15, borderBottomWidth: 1, borderColor: '#f1f5f9', paddingBottom: 10 },
  cartItemTop: { marginBottom: 6 },
  cartItemBottom: { flexDirection: 'column', marginTop: 4, gap: 6 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, alignSelf: 'flex-start' },
  qtyBtn: { padding: 8 },
  cartItemName: { fontWeight: '600', color: '#1e293b', fontSize: 13 },
  cartItemPrice: { fontSize: 11, color: '#64748b' },
  cartQty: { fontWeight: 'bold', color: '#0ea5e9', minWidth: 24, textAlign: 'center', fontSize: 13 },
  cartSubtotal: { fontWeight: 'bold', color: '#0f172a', fontSize: 13 },
  checkoutBox: { marginTop: 'auto', borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 15 },
  totalLabel: { fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  totalAmount: { fontSize: 24, fontWeight: '900', color: '#1e293b', marginBottom: 15 },
  checkoutBtn: { backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center' },
  checkoutBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 5 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  fractionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  fractionBtn: { backgroundColor: '#f1f5f9', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, flex: 1, marginHorizontal: 4, alignItems: 'center' },
  fractionBtnText: { fontSize: 16, fontWeight: 'bold', color: '#0ea5e9' },
  fractionInput: { width: '100%', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  modalCancelBtn: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, marginRight: 10 },
  modalCancelText: { fontWeight: 'bold', color: '#64748b' },
  modalConfirmBtn: { flex: 1, padding: 15, alignItems: 'center', backgroundColor: '#10b981', borderRadius: 8, marginLeft: 10 },
  modalConfirmText: { fontWeight: 'bold', color: '#fff' }
});
