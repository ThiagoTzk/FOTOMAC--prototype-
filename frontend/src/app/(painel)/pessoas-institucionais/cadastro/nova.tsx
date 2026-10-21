import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ImagePlus, ShieldCheck, TriangleAlert, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { createPerson } from '@/api/institutional';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Field, Input, Notice } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

const MAX_PHOTOS = 5;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/*'];

type Picked = { file: File; url: string | null; key: string };

/**
 * New institutional person (RF020). The photos are stored but NOT processed: no facial data exists
 * until the person signs the term sent to their e-mail (note 2). Unsigned in 30 days, it is all deleted.
 */
export default function NewInstitutionalPerson() {
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [unit, setUnit] = useState('');
  const [email, setEmail] = useState('');
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Free the in-memory previews when leaving the screen.
  useEffect(() => () => photos.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick() {
    const r = await DocumentPicker.getDocumentAsync({ type: TYPES, multiple: true, copyToCacheDirectory: false });
    if (r.canceled) return;
    const files = r.assets.map((a) => (a as DocumentPicker.DocumentPickerAsset & { file?: File }).file).filter((f): f is File => !!f);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(`São no máximo ${MAX_PHOTOS} fotografias: ${files.length - room} não foram incluídas.`);
    // HEIC usually has no preview in the browser; the server converts it.
    setPhotos((list) => [...list, ...files.slice(0, Math.max(0, room)).map((file) => ({
      file, key: `${file.name}-${file.size}-${Math.random()}`,
      url: /\.(heic|heif)$/i.test(file.name) ? null : URL.createObjectURL(file),
    }))]);
  }

  async function save() {
    setError(null);
    if (!photos.length) { setError('Envie de 1 a 5 fotografias de referência do rosto.'); return; }
    const form = new FormData();
    form.append('full_name', name);
    form.append('position', position);
    if (unit.trim()) form.append('unit', unit);
    form.append('email', email);
    photos.forEach((p) => form.append('photos', p.file, p.file.name));
    setSaving(true);
    try {
      const person = await createPerson(form);
      router.replace(`/pessoas-institucionais/cadastro/${person.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cadastrar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <PageHeader crumbs={[{ label: 'Pessoas institucionais', href: '/pessoas-institucionais' },
                           { label: 'Cadastro', href: '/pessoas-institucionais/cadastro' }, { label: 'Nova pessoa' }]}
                  title="Cadastrar pessoa institucional"
                  subtitle="A pessoa recebe o termo no e-mail institucional e assina na tela. Só depois disso o sistema a procura nas fotos." />
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Card padding={24} style={{ gap: 18 }}>
        <View style={styles.grid}>
          <Field label="Nome completo" style={styles.cell}>
            <Input value={name} onChangeText={setName} maxLength={120} placeholder="Nome e sobrenome" accessibilityLabel="Nome completo" />
          </Field>
          <Field label="Cargo ou função" style={styles.cell}>
            <Input value={position} onChangeText={setPosition} maxLength={100} placeholder="Ex.: Pró-reitora de Extensão" accessibilityLabel="Cargo ou função" />
          </Field>
          <Field label="Unidade ou curso (opcional)" style={styles.cell}>
            <Input value={unit} onChangeText={setUnit} maxLength={100} placeholder="Ex.: Reitoria / Campus I" accessibilityLabel="Unidade ou curso" />
          </Field>
          <Field label="E-mail institucional" help="Para onde vai o link do termo (@cesmac.edu.br)." style={styles.cell}>
            <Input value={email} onChangeText={setEmail} maxLength={254} placeholder="nome@cesmac.edu.br" inputMode="email"
                   autoCapitalize="none" accessibilityLabel="E-mail institucional" />
          </Field>
        </View>
        <Field label={`Fotografias de referência (${photos.length} de ${MAX_PHOTOS})`}
               help="De 1 a 5 fotos do rosto da pessoa, de frente e de lado: nas fotos de evento o rosto raramente está de frente. JPEG, PNG, HEIC ou WebP. As fotos são guardadas sem os metadados (sem GPS).">
          <View style={styles.photos}>
            {photos.map((p, i) => (
              <View key={p.key} style={styles.photo}>
                {p.url ? <Image source={{ uri: p.url }} style={styles.photoImg} contentFit="cover" />
                  : <View style={[styles.photoImg, styles.noPreview]}><Text style={styles.small}>HEIC</Text></View>}
                <Pressable accessibilityRole="button" accessibilityLabel={`Remover a foto ${i + 1}`} style={styles.remove}
                           onPress={() => setPhotos((list) => list.filter((x) => x.key !== p.key))}>
                  <X size={14} color="#FFFFFF" strokeWidth={2.2} absoluteStrokeWidth />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && Platform.OS === 'web' && (
              <Pressable accessibilityRole="button" accessibilityLabel="Adicionar fotografias" onPress={pick} style={[styles.photo, styles.add]}>
                <ImagePlus size={22} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth />
                <Text style={styles.addText}>Adicionar</Text>
              </Pressable>
            )}
          </View>
        </Field>
        <Notice tone="info" icon={ShieldCheck} title="Nada é processado antes da assinatura"
                description="Rosto é dado pessoal sensível (LGPD, Art. 5º, II). As fotos ficam guardadas, mas o reconhecimento facial só começa depois que a pessoa assinar o termo. Se ela recusar, ou não assinar em 30 dias, o cadastro e as fotos são apagados." />
        <View style={styles.actions}>
          <Button variant="secondary" label="Cancelar" onPress={() => router.navigate('/pessoas-institucionais/cadastro')} />
          <Button label="Cadastrar e enviar o termo" loading={saving} onPress={save}
                  disabled={!name.trim() || !position.trim() || !email.trim() || !photos.length} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cell: { flexGrow: 1, flexBasis: 300 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photo: { width: 112, height: 140, borderRadius: 10, overflow: 'hidden' },
  photoImg: { width: 112, height: 140, backgroundColor: panel.page },
  noPreview: { alignItems: 'center', justifyContent: 'center' },
  remove: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center' },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: panel.primary, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontFamily: fonts.semiBold, fontSize: 13, color: panel.primary },
  small: { fontFamily: fonts.regular, fontSize: 12, color: panel.muted },
  actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' },
});
