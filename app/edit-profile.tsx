import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

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
      Alert.alert('Fait', 'Profil mis à jour !', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert('Erreur', err.message || 'Impossible de mettre à jour');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen
      title="Modifier le profil"
      left={<TouchableOpacity onPress={() => router.back()}><Text style={styles.cancel}>Annuler</Text></TouchableOpacity>}
      right={<TouchableOpacity onPress={save} disabled={loading}><Text style={[styles.save, loading && { opacity: 0.5 }]}>{loading ? '...' : 'Sauver'}</Text></TouchableOpacity>}
    >
      <TouchableOpacity style={styles.avatarWrap} onPress={pickImage}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitials}>{username.slice(0, 2).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.avatarBadge}><Feather name="camera" size={13} color={colors.white} /></View>
      </TouchableOpacity>
      <Text style={styles.avatarHint}>Appuie pour changer la photo</Text>

      <Text style={styles.sectionTitle}>Informations</Text>
      <Text style={styles.label}>Nom d'utilisateur</Text>
      <TextInput style={styles.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholderTextColor={colors.gray} />
      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.gray} />

      <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Changer le mot de passe</Text>
      <Text style={styles.sectionHint}>Laisse vide pour ne pas modifier</Text>
      <Text style={styles.label}>Nouveau mot de passe</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.gray} />
      <Text style={styles.label}>Confirmer le mot de passe</Text>
      <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.gray} />
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  cancel: { fontSize: 14, color: colors.gray },
  save: { fontSize: 14, fontWeight: '700', color: colors.purple },
  avatarWrap: { alignSelf: 'center', marginTop: 8, marginBottom: 8, position: 'relative' },
  avatarPlaceholder: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: 'white' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.purple, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  avatarHint: { fontSize: 11, color: colors.gray, textAlign: 'center', marginBottom: 28 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  sectionHint: { fontSize: 11, color: colors.gray, marginBottom: 12 },
  label: { fontSize: 11, color: colors.gray, marginTop: 14, marginBottom: 6 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: 10, color: colors.white, fontSize: 15 },
});
