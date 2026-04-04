import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '../src/i18n/LanguageContext';

export default function AddCustomerScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSave = async () => {
    if (!name) {
      Alert.alert(t('common.error'), t('addCustomer.errorName'));
      return;
    }

    try {
      await db.runAsync('INSERT INTO Customer (name, phone) VALUES (?, ?)', [name, phone]);
      router.back();
    } catch (e) {
      Alert.alert(t('common.error'), t('addCustomer.errorSave'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('addCustomer.name')}</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('addCustomer.namePlaceholder')} />

      <Text style={styles.label}>{t('addCustomer.phone')}</Text>
      <TextInput style={styles.input} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder={t('addCustomer.phonePlaceholder')} />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>{t('addCustomer.save')}</Text>
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
