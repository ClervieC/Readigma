import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const styles = makeStyles(colors);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUsername(profile?.username || '');
    setEmail(session?.user.email || '');
    setAvatarUri(profile?.avatar_url || null);
  }, [session, profile]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée', 'L\'accès à la galerie est nécessaire.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
    if (!result.canceled && result.assets[0].base64) setAvatarUri(`data:image/jpeg;base64,${result.assets[0].base64}`);
  };

  const save = async () => {
    if (password && password !== confirmPassword) { Alert.alert('Erreur', 'Les mots de passe ne correspondent pas'); return; }
    if (password && password.length < 6) { Alert.alert('Erreur', 'Le mot de passe doit faire au moins 6 caractères'); return; }
    if (!session) return;
    setLoading(true);
    try {
      if (!profile || username !== profile.username || avatarUri !== profile.avatar_url) {
        // Upsert, not update: an account can reach this screen with no
        // profiles row yet (e.g. it signed up while email confirmation was
        // pending, so there was no session yet to attach one to — see
        // lib/pendingUsername.ts). A plain update would silently no-op.
        const { error } = await supabase
          .from('profiles')
          .upsert({ id: session.user.id, username, avatar_url: avatarUri }, { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
      if (email !== session.user.email || password) {
        const { error } = await supabase.auth.updateUser({
          ...(email !== session.user.email ? { email } : {}),
          ...(password ? { password } : {}),
        });
        if (error) throw new Error(error.message);
      }
      await refreshProfile();
      Alert.alert('✅', 'Profil mis à jour !', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible de mettre à jour');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.cancel}>Annuler</Text></TouchableOpacity>
        <Text style={styles.title}>Modifier le profil</Text>
        <TouchableOpacity onPress={save} disabled={loading}>
          <Text style={[styles.save, loading && { opacity: 0.5 }]}>{loading ? '...' : 'Sauver'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.avatarWrap} onPress={pickImage}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{username.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.avatarBadge}><Text style={{ fontSize: 14 }}>📷</Text></View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Appuie pour changer la photo</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Nom d'utilisateur</Text>
            <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholderTextColor={colors.gray} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.gray} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Changer le mot de passe</Text>
          <Text style={styles.sectionHint}>Laisse vide pour ne pas modifier</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Nouveau mot de passe</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.gray} />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirmer le mot de passe</Text>
            <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.gray} />
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: 16, fontWeight: '700', color: colors.white },
  cancel: { fontSize: 14, color: colors.gray },
  save: { fontSize: 14, fontWeight: '700', color: colors.purple },
  scroll: { flex: 1, paddingHorizontal: 16 },
  avatarWrap: { alignSelf: 'center', marginTop: 24, marginBottom: 8, position: 'relative' },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarInitials: { fontSize: 32, fontWeight: '700', color: 'white' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  avatarHint: { fontSize: 11, color: colors.gray, textAlign: 'center', marginBottom: 24 },
  section: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.white, marginBottom: 4 },
  sectionHint: { fontSize: 11, color: colors.gray, marginBottom: 12 },
  field: { marginTop: 12 },
  label: { fontSize: 11, color: colors.gray, marginBottom: 6 },
  input: { backgroundColor: colors.card2, borderRadius: radius.sm, padding: 12, color: colors.white, fontSize: 15, borderWidth: 1, borderColor: colors.divider },
});
