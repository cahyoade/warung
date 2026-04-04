import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';

type PriceTier = { minQty: string, price: string };
type ProductRow = { id: number, name: string, category: string, barcode: string, basePrice: number, costPrice: number, unitOfMeasure: string, stockCount: number };
type TierRow = { minQuantity: number, price: number };

export default function AddProductScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId?: string }>();

  const isEditing = !!productId;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Permission required', 'Camera permission is needed to scan barcodes.');
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
    setBarcode(data);
  };

  const [basePrice, setBasePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('Pcs');
  const [stock, setStock] = useState('0');
  
  const [tiers, setTiers] = useState<PriceTier[]>([]);

  useEffect(() => {
    if (productId) {
      const loadProduct = async () => {
        try {
          const product = await db.getFirstAsync<ProductRow>('SELECT * FROM Product WHERE id = ?', [parseInt(productId)]);
          if (product) {
            setName(product.name);
            setCategory(product.category || '');
            setBarcode(product.barcode || '');
            setBasePrice(product.basePrice.toString());
            setCostPrice(product.costPrice.toString());
            setUnitOfMeasure(product.unitOfMeasure);
            setStock(product.stockCount.toString());

            const existingTiers = await db.getAllAsync<TierRow>('SELECT minQuantity, price FROM ProductPriceTier WHERE productId = ?', [product.id]);
            setTiers(existingTiers.map(t => ({ minQty: t.minQuantity.toString(), price: t.price.toString() })));
          }
        } catch (e) {
          console.error("Failed to load product", e);
        }
      };
      loadProduct();
    }
  }, [productId, db]);

  const handleSave = async () => {
    if (!name || !basePrice || !costPrice) {
      Alert.alert('Error', 'Name, Selling Price, and Cost Price are required.');
      return;
    }

    try {
      if (isEditing && productId) {
        // Update existing
        await db.runAsync(
          'UPDATE Product SET name = ?, category = ?, barcode = ?, basePrice = ?, costPrice = ?, unitOfMeasure = ?, stockCount = ? WHERE id = ?',
          [name, category, barcode, parseFloat(basePrice) || 0, parseFloat(costPrice) || 0, unitOfMeasure, parseFloat(stock) || 0, parseInt(productId)]
        );

        // Delete old tiers and re-insert
        await db.runAsync('DELETE FROM ProductPriceTier WHERE productId = ?', [parseInt(productId)]);

        for (const tier of tiers) {
          if (tier.minQty && tier.price) {
            await db.runAsync(
              'INSERT INTO ProductPriceTier (productId, minQuantity, price) VALUES (?, ?, ?)',
              [parseInt(productId), parseFloat(tier.minQty), parseFloat(tier.price)]
            );
          }
        }
      } else {
        // Insert new
        const result = await db.runAsync(
          'INSERT INTO Product (name, category, barcode, basePrice, costPrice, unitOfMeasure, stockCount) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [name, category, barcode, parseFloat(basePrice) || 0, parseFloat(costPrice) || 0, unitOfMeasure, parseFloat(stock) || 0]
        );

        const newProductId = result.lastInsertRowId;

        for (const tier of tiers) {
          if (tier.minQty && tier.price) {
              await db.runAsync(
                'INSERT INTO ProductPriceTier (productId, minQuantity, price) VALUES (?, ?, ?)',
                [newProductId, parseFloat(tier.minQty), parseFloat(tier.price)]
              );
          }
        }
      }

      router.back();
    } catch (e) {
      Alert.alert('Database Error', 'Failed to save product.');
      console.error(e);
    }
  };

  const removeTier = (index: number) => {
    const newTiers = [...tiers];
    newTiers.splice(index, 1);
    setTiers(newTiers);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: isEditing ? 'Edit Good' : 'Add New Good' }} />
      <Text style={styles.label}>Product Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Indomie Goreng" />

      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Makanan" />

      <Text style={styles.label}>Barcode</Text>
      <View style={styles.barcodeRow}>
        <TextInput style={[styles.input, { flex: 1 }]} value={barcode} onChangeText={setBarcode} placeholder="Scan or type barcode" />
        <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
          <Ionicons name="barcode-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Selling Price *</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={basePrice} onChangeText={setBasePrice} placeholder="Rp" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Cost Price *</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={costPrice} onChangeText={setCostPrice} placeholder="Rp (Modal)" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Unit of Measure</Text>
          <TextInput style={styles.input} value={unitOfMeasure} onChangeText={setUnitOfMeasure} placeholder="Pcs, Kg, Gram..." />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Current Stock</Text>
          <TextInput style={styles.input} keyboardType="numeric" value={stock} onChangeText={setStock} />
        </View>
      </View>

      <View style={styles.tierSection}>
        <Text style={styles.tierTitle}>Wholesale / Tiered Pricing</Text>
        <Text style={styles.tierSubtitle}>Offer discounts for bulk purchases</Text>
        
        {tiers.map((tier, index) => (
          <View key={index} style={styles.tierCard}>
            <View style={styles.tierCardHeader}>
               <Text style={styles.tierCardTitle}>Tier {index + 1}</Text>
               <TouchableOpacity onPress={() => removeTier(index)}>
                   <Ionicons name="trash" size={20} color="#ef4444" />
               </TouchableOpacity>
            </View>
            <View style={styles.row}>
              <View style={styles.half}>
                 <Text style={styles.label}>Buy X or more</Text>
                 <TextInput style={styles.input} placeholder="Min Qty" keyboardType="numeric" 
                    value={tier.minQty} onChangeText={(v) => {
                      const newTiers = [...tiers]; newTiers[index].minQty = v; setTiers(newTiers);
                 }} />
              </View>
              <View style={styles.half}>
                 <Text style={styles.label}>Price becomes</Text>
                 <TextInput style={styles.input} placeholder="Rp" keyboardType="numeric" 
                    value={tier.price} onChangeText={(v) => {
                      const newTiers = [...tiers]; newTiers[index].price = v; setTiers(newTiers);
                 }} />
              </View>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.addTierBtn} onPress={() => setTiers([...tiers, {minQty: '', price: ''}])}>
          <Ionicons name="add-circle" size={20} color="#0ea5e9" /><Text style={styles.addTierText}>Add Price Tier</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Save Product'}</Text>
      </TouchableOpacity>
      </ScrollView>

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
            <Text style={styles.scanHint}>Point camera at a barcode</Text>
          </View>
          <TouchableOpacity style={styles.scanClose} onPress={() => setScannerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fcfcfc', paddingBottom: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  half: { width: '48%' },
  tierSection: { marginTop: 30, padding: 15, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  tierTitle: { fontWeight: 'bold', fontSize: 16, color: '#0f172a' },
  tierSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 15 },
  tierCard: { backgroundColor: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 5, elevation: 1 },
  tierCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -5 },
  tierCardTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  addTierBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 5, paddingVertical: 10, justifyContent: 'center', backgroundColor: '#e0f2fe', borderRadius: 8 },
  addTierText: { color: '#0ea5e9', fontWeight: 'bold', marginLeft: 8 },
  saveBtn: { backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: { backgroundColor: '#0ea5e9', borderRadius: 10, padding: 14, justifyContent: 'center', alignItems: 'center' },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 220, height: 140, borderWidth: 2, borderColor: '#0ea5e9', borderRadius: 12, backgroundColor: 'transparent' },
  scanHint: { color: '#fff', marginTop: 16, fontSize: 14, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  scanClose: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6 }
});
