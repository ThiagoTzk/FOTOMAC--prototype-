import * as DocumentPicker from 'expo-document-picker';
import { FileImage } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { requestRemovalByFile } from '@/api/public';
import { VisitorHeader } from '@/components/visitor/Header';
import { RemovalDone, RemovalForm } from '@/components/visitor/Removal';
import { Column, vtext } from '@/components/visitor/ui';
import { poppins, visitor } from '@/theme/tokens';

/**
 * RF023 open to ANYONE (RF022 note 6): a person who appears incidentally in a photo — and never
 * used the search — identifies the image by sending the file they obtained. The file is NOT
 * converted here: only an exact copy of the file delivered by FOTOMAC identifies the image.
 */
export default function RemovalPage() {
  const [file, setFile] = useState<{ name: string; blob: Blob } | null>(null);
  const [done, setDone] = useState(false);

  async function choose() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg'], multiple: false, copyToCacheDirectory: false });
    const asset = r.assets?.[0];
    if (asset?.file) setFile({ name: asset.name, blob: asset.file });
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader back />
      <Column narrow style={{ gap: 20, marginTop: 24 }}>
        <View style={{ gap: 6 }}>
          <Text style={vtext.h1} accessibilityRole="header">Solicitar remoção de imagem</Text>
          <Text style={vtext.body}>
            Qualquer pessoa retratada pode pedir a remoção de uma foto, sem precisar justificar.
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={vtext.h3}>Encontrou a foto pela busca?</Text>
          <Text style={vtext.body}>
            Abra a foto no resultado da busca do evento e toque em “Solicitar remoção”. É o jeito mais seguro de
            indicar exatamente a imagem.
          </Text>
        </View>
        <View style={[styles.card, { gap: 14 }]}>
          <Text style={vtext.h3}>Tem o arquivo da foto?</Text>
          {done ? <RemovalDone closeLabel="Voltar ao início" onClose={() => router.replace('/')} /> : (
            <RemovalForm
              canSend={!!file}
              send={async (email, reason) => { await requestRemovalByFile(file!.blob, email, reason); setDone(true); }}
              target={(
                <View style={{ gap: 8 }}>
                  <Text style={vtext.body}>
                    Envie o arquivo exatamente como foi baixado do FOTOMAC. Cópias reenviadas por aplicativos de mensagem
                    são alteradas e não podem ser identificadas com segurança.
                  </Text>
                  <Pressable accessibilityRole="button" onPress={choose} style={styles.picker}>
                    <FileImage size={22} color={visitor.primary} strokeWidth={1.6} absoluteStrokeWidth />
                    <Text style={styles.pickerText} numberOfLines={1}>{file ? file.name : 'Selecionar arquivo da foto (JPEG)'}</Text>
                  </Pressable>
                </View>
              )} />
          )}
        </View>
      </Column>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: visitor.page },
  card: { backgroundColor: visitor.surface, borderRadius: 12, padding: 16, gap: 8, boxShadow: visitor.cardShadow },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1,
            borderStyle: 'dashed', borderColor: visitor.primary, backgroundColor: 'rgba(0, 125, 197, 0.04)' },
  pickerText: { flex: 1, fontFamily: poppins.medium, fontSize: 14, color: visitor.primary },
});
