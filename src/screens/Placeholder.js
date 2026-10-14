import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { C } from '../theme';
import { supabase } from '../lib/supabase';

export function Soon({ title }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18, color: C.primary }}>{title}</Text><Text style={{ color: C.muted, marginTop: 6 }}>শীঘ্রই আসছে</Text></View>;
}
export function Account() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
      <TouchableOpacity
        style={{ backgroundColor: C.bad, padding: 14, borderRadius: 10, alignItems: 'center' }}
        onPress={() => Alert.alert('লগআউট', 'আপনি কি লগআউট করবেন?', [{ text: 'না' }, { text: 'হ্যাঁ', onPress: () => supabase.auth.signOut() }])}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>🚪 লগআউট</Text>
      </TouchableOpacity>
    </View>
  );
}
