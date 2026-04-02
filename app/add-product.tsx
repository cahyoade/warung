import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type PriceTier = { minQty: string, price: string };

export default function AddProductScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('Pcs');
  const [stock, setStock] = useState('0');
  
  const [tiers, setTiers] = useState<PriceTier[]>([]);

  const handleSave = async () => {
    if (!name || !basePrice || !costPrice) {
      Alert.alert('Error', 'Name, Selling Price, and Cost Price are required.');
      return;
    }

    try {
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

      router.back();
    } catch (e) {
      Alert.alert('Database Error', 'Failed to save product.');
      console.error(e);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Product Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Indomie Goreng" />

      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Makanan" />

      <Text style={styles.label}>Barcode</Text>
      <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="Scan or type barcode" />

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
        {tiers.map((tier, index) => (
          <View key={index} style={styles.row}>
             <TextInput style={[styles.input, styles.half]} placeholder="Min Qty" keyboardType="numeric" 
                value={tier.minQty} onChangeText={(v) => {
                  const newTiers = [...tiers]; newTiers[index].minQty = v; setTiers(newTiers);
             }} />
             <TextInput style={[styles.input, styles.half]} placeholder="Price" keyboardType="numeric" 
                value={tier.price} onChangeText={(v) => {
                  const newTiers = [...tiers]; newTiers[index].price = v; setTiers(newTiers);
             }} />
          </View>
        ))}
        <TouchableOpacity style={styles.addTierBtn} onPress={() => setTiers([...tiers, {minQty: '', price: ''}])}>
          <Ionicons name="add-circle" size={20} color="#0ea5e9" /><Text style={styles.addTierText}>Add Price Tier</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Product</Text>
      </TouchableOpacity>
      <View style={{height: 50}} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fcfcfc' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  half: { width: '48%' },
  tierSection: { marginTop: 30, padding: 15, backgroundColor: '#f1f5f9', borderRadius: 12 },
  tierTitle: { fontWeight: 'bold', marginBottom: 10, color: '#334155' },
  addTierBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  addTierText: { color: '#0ea5e9', fontWeight: 'bold', marginLeft: 8 },
  saveBtn: { backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});
