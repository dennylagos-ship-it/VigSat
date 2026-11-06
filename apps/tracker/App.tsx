import { StatusBar } from 'expo-status-bar';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, type User,
} from 'firebase/auth';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { createAccountWithDevice, findMyDevice, type AccountKind, type MyDevice } from './src/data';
import { auth } from './src/firebase';
import {
  clearDeviceId, isTracking, onSend, requestPermissions, saveDeviceId, startTracking, stopTracking,
} from './src/tracking';

const COLORS = {
  bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', border: '#E2E8F0',
  primary: '#0F766E', primaryText: '#FFFFFF', danger: '#B91C1C', ok: '#15803D',
};

type Phase = { name: 'loading' } | { name: 'signedOut' } | { name: 'setup'; user: User } | { name: 'ready'; user: User; device: MyDevice };

export default function App() {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setPhase({ name: 'signedOut' });
      return;
    }
    setPhase({ name: 'loading' });
    try {
      const device = await findMyDevice(user.uid);
      if (device) {
        await saveDeviceId(device.id);
        setPhase({ name: 'ready', user, device });
      } else {
        setPhase({ name: 'setup', user });
      }
    } catch {
      setPhase({ name: 'setup', user });
    }
  }), []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>VigSat</Text>
          {phase.name === 'loading' && <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 48 }} />}
          {phase.name === 'signedOut' && <AuthScreen />}
          {phase.name === 'setup' && (
            <SetupScreen
              user={phase.user}
              onDone={async (device) => {
                await saveDeviceId(device.id);
                setPhase({ name: 'ready', user: phase.user, device });
              }}
            />
          )}
          {phase.name === 'ready' && <TrackingScreen user={phase.user} device={phase.device} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------- Inicio de sesión

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, email.trim(), password);
      else await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === 'login' ? 'Iniciar sesión' : 'Crear usuario'}</Text>
      <Field label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label={mode === 'login' ? 'Entrar' : 'Registrarme'} onPress={submit} busy={busy} disabled={!email || password.length < 6} />
      <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} style={styles.link}>
        <Text style={styles.linkText}>{mode === 'login' ? '¿No tienes usuario? Regístrate' : 'Ya tengo usuario'}</Text>
      </Pressable>
    </View>
  );
}

function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Correo o contraseña incorrectos.';
  if (code.includes('email-already-in-use')) return 'Ese correo ya está registrado. Inicia sesión.';
  if (code.includes('invalid-email')) return 'El correo no es válido.';
  if (code.includes('weak-password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (code.includes('network')) return 'Sin conexión a internet.';
  return 'No se pudo completar. Intenta de nuevo.';
}

// ---------------------------------------------------------------- Primer uso

function SetupScreen({ user, onDone }: { user: User; onDone: (d: MyDevice) => void }) {
  const [kind, setKind] = useState<AccountKind>('personal');
  const [accountName, setAccountName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const device = await createAccountWithDevice({
        uid: user.uid,
        kind,
        accountName: accountName.trim(),
        deviceName: deviceName.trim(),
        plate,
      });
      onDone(device);
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Configura este celular</Text>
      <Text style={styles.muted}>Este celular enviará la ubicación del vehículo.</Text>

      <Text style={styles.label}>Tipo de cuenta</Text>
      <View style={styles.segment}>
        {(['personal', 'fleet'] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={[styles.segmentItem, kind === k && styles.segmentActive]}>
            <Text style={[styles.segmentText, kind === k && styles.segmentTextActive]}>{k === 'personal' ? 'Particular' : 'Flota / empresa'}</Text>
          </Pressable>
        ))}
      </View>

      <Field label={kind === 'fleet' ? 'Nombre de la empresa' : 'Tu nombre'} value={accountName} onChangeText={setAccountName} />
      <Field label="Nombre del vehículo" placeholder="Ej.: Camión 1, Mi carro" value={deviceName} onChangeText={setDeviceName} />
      <Field label="Placa (opcional)" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Guardar" onPress={submit} busy={busy} disabled={!accountName.trim() || !deviceName.trim()} />
      <Pressable onPress={() => signOut(auth)} style={styles.link}>
        <Text style={styles.linkText}>Cerrar sesión ({user.email})</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- Rastreo

function TrackingScreen({ user, device }: { user: User; device: MyDevice }) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    isTracking().then(setActive);
    const off = onSend((info) => {
      if ('error' in info) setMessage(`Error al enviar: ${info.error}`);
      else {
        setLastSent(info.at);
        setSentCount((c) => c + info.count);
        setMessage(null);
      }
    });
    return () => { off(); };
  }, []);

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      if (active) {
        await stopTracking();
        setActive(false);
      } else {
        const perm = await requestPermissions();
        if (perm === 'denied') {
          setMessage('Sin permiso de ubicación no se puede rastrear. Actívalo en Ajustes.');
          return;
        }
        if (perm === 'foreground-only') {
          setMessage('Solo se enviará mientras la app esté abierta. Para segundo plano, en Ajustes elige "Permitir siempre".');
        }
        const mode = await startTracking();
        setActive(true);
        if (mode === 'foreground') {
          setMessage('Este celular no permite el segundo plano en esta versión: deja la app abierta mientras rastreas.');
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo iniciar el rastreo.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await stopTracking();
    await clearDeviceId();
    await signOut(auth);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{device.name}</Text>
      {device.plate ? <Text style={styles.muted}>Placa {device.plate}</Text> : null}

      <View style={[styles.status, { borderColor: active ? COLORS.ok : COLORS.border }]}>
        <View style={[styles.dot, { backgroundColor: active ? COLORS.ok : COLORS.muted }]} />
        <Text style={styles.statusText}>{active ? 'Rastreo activo' : 'Rastreo detenido'}</Text>
      </View>

      <Text style={styles.muted}>
        {lastSent ? `Último envío: ${lastSent.toLocaleTimeString()} · ${sentCount} puntos en esta sesión` : 'Aún no se ha enviado ninguna ubicación.'}
      </Text>
      {message && <Text style={styles.error}>{message}</Text>}

      <Button label={active ? 'Detener rastreo' : 'Iniciar rastreo'} onPress={toggle} busy={busy} danger={active} />
      <Pressable onPress={logout} style={styles.link}>
        <Text style={styles.linkText}>Cerrar sesión ({user.email})</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- Componentes

function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={COLORS.muted} style={styles.input} {...props} />
    </View>
  );
}

function Button({ label, onPress, busy, disabled, danger }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; danger?: boolean }) {
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [styles.button, danger && { backgroundColor: COLORS.danger }, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {busy ? <ActivityIndicator color={COLORS.primaryText} /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingTop: 48, gap: 20 },
  brand: { fontSize: 28, fontWeight: '800', color: COLORS.primary, textAlign: 'center' },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20, gap: 14, borderWidth: 1, borderColor: COLORS.border },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  muted: { fontSize: 14, color: COLORS.muted },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: COLORS.text },
  error: { color: COLORS.danger, fontSize: 14 },
  button: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  buttonText: { color: COLORS.primaryText, fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: COLORS.primary, fontSize: 14 },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, overflow: 'hidden' },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentActive: { backgroundColor: COLORS.primary },
  segmentText: { color: COLORS.text, fontWeight: '600' },
  segmentTextActive: { color: COLORS.primaryText },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 12, padding: 14 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 18, fontWeight: '700', color: COLORS.text },
});
