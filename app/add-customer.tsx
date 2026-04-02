import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';

export default function AddCustomerScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSave = async () => {
    if (!name) {
      Alert.alert('Error', 'Name is required.');
      return;
    }

    try {
      await db.runAsync('INSERT INTO Customer (name, phone) VALUES (?, ?)', [name, phone]);
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save customer. Phone number might already exist.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Customer Name *</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Pak Budi" />

      <Text style={styles.label}>Phone Number</Text>
      <TextInput style={styles.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="0812..." />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Customer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fcfcfc' },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#fff', padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 16 },
  saveBtn: { backgroundColor: '#10b981', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 }
});
