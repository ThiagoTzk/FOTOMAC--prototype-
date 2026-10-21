import { CircleCheck, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTheme, deleteTheme, listAdminThemes, renameTheme, setThemeActive, type ThemeRow } from '@/api/admin';
import { Modal } from '@/components/panel/Modal';
import { PageHeader } from '@/components/panel/PageHeader';
import { Button, Card, Field, Input, Notice, Pill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/**
 * "Manutenção dos Temas de Evento" (RF027): the list used in the event form and in the public
 * filters. A theme in use is never deleted, only inactivated (note 1) — the events keep it.
 */
export default function ThemesScreen() {
  const [themes, setThemes] = useState<ThemeRow[] | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<ThemeRow | null>(null);
  const [newName, setNewName] = useState('');
  const [removing, setRemoving] = useState<ThemeRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { listAdminThemes().then(setThemes).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(null); setDone(null);
    try {
      await action();
      setDone(message);
      load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 24, maxWidth: 900 }}>
      <PageHeader title="Temas" subtitle="Temas oferecidos no cadastro de eventos e nos filtros da busca pública." />
      {done && <Notice tone="success" icon={CircleCheck} title={done} />}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Card padding={20}>
        <View style={styles.add}>
          <Field label="Novo tema" style={{ flex: 1, minWidth: 220 }} help="Até 50 caracteres; não pode repetir um tema existente.">
            <Input value={name} onChangeText={setName} maxLength={50} placeholder="Ex.: Robótica" accessibilityLabel="Novo tema"
                   onSubmitEditing={() => name.trim() && run(() => createTheme(name), `Tema “${name.trim()}” criado.`).then((ok) => ok && setName(''))} />
          </Field>
          <Button icon={Plus} label="Adicionar" disabled={!name.trim()} loading={busy}
                  onPress={() => run(() => createTheme(name), `Tema “${name.trim()}” criado.`).then((ok) => ok && setName(''))} />
        </View>
      </Card>
      {themes && (
        <View style={styles.table} accessibilityRole="list">
          <View style={styles.head}>
            <Text style={[styles.th, { flex: 1 }]}>TEMA</Text>
            <Text style={[styles.th, { width: 110 }]}>SITUAÇÃO</Text>
            <Text style={[styles.th, { width: 90 }]}>EVENTOS</Text>
            <Text style={[styles.th, { width: 250, textAlign: 'right' }]}>AÇÕES</Text>
          </View>
          {themes.map((t) => (
            <View key={t.id} accessibilityLabel={`Tema ${t.name}`} style={[styles.row, !t.active && { backgroundColor: panel.page }]}>
              <Text style={[styles.name, { flex: 1 }, !t.active && { color: panel.muted }]}>{t.name}</Text>
              <View style={{ width: 110 }}>
                {t.active ? <Pill label="Ativo" bg={panel.successSoft} fg={panel.success} /> : <Pill label="Inativo" bg="#FFFFFF" fg={panel.muted} />}
              </View>
              <Text style={[styles.cell, { width: 90 }]}>{t.events}</Text>
              <View style={styles.actions}>
                <Action label="Renomear" icon={Pencil} onPress={() => { setEditing(t); setNewName(t.name); }} />
                <Action label={t.active ? 'Inativar' : 'Ativar'}
                        onPress={() => run(() => setThemeActive(t.id, !t.active), t.active
                          ? `“${t.name}” inativado: não aparece mais em eventos novos nem nos filtros.` : `“${t.name}” ativado.`)} />
                {/* RF027 note 1: only an unused theme can be deleted. */}
                {t.events === 0 && <Action label="Excluir" icon={Trash2} danger onPress={() => setRemoving(t)} />}
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.help}>
        Um tema usado por algum evento não pode ser excluído, apenas inativado: deixa de ser oferecido em eventos novos e
        nos filtros públicos, mas continua nos eventos que já o usam.
      </Text>

      <Modal visible={!!editing} onClose={() => setEditing(null)} icon={Pencil} title="Renomear tema">
        <View style={{ gap: 16 }}>
          <Field label="Nome do tema"><Input value={newName} onChangeText={setNewName} maxLength={50} accessibilityLabel="Nome do tema" /></Field>
          {!!editing?.events && <Text style={styles.help}>O novo nome aparece também nos {editing.events} evento(s) que usam este tema.</Text>}
          <View style={styles.modalActions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setEditing(null)} />
            <Button label="Salvar" loading={busy} disabled={!newName.trim()}
                    onPress={() => editing && run(() => renameTheme(editing.id, newName), 'Tema renomeado.').then((ok) => ok && setEditing(null))} />
          </View>
        </View>
      </Modal>
      <Modal visible={!!removing} onClose={() => setRemoving(null)} icon={Trash2} tone="danger" title="Excluir tema?">
        <View style={{ gap: 16 }}>
          <Text style={styles.help}>“{removing?.name}” não é usado por nenhum evento e será excluído definitivamente.</Text>
          <View style={styles.modalActions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setRemoving(null)} />
            <Button variant="danger" label="Excluir" loading={busy}
                    onPress={() => removing && run(() => deleteTheme(removing.id), 'Tema excluído.').then(() => setRemoving(null))} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Action({ label, icon: Icon, danger, onPress }: { label: string; icon?: typeof Pencil; danger?: boolean; onPress: () => void }) {
  const color = danger ? panel.danger : panel.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      {Icon && <Icon size={14} color={color} strokeWidth={1.8} absoluteStrokeWidth />}
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  table: { borderWidth: 1, borderColor: panel.border, borderRadius: panel.cardRadius, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  head: { height: 42, backgroundColor: panel.page, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  th: { fontFamily: fonts.bold, fontSize: 12, color: panel.muted },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1,
         borderColor: panel.borderSoft, flexWrap: 'wrap', gap: 6 },
  name: { fontFamily: fonts.regular, fontSize: 14, color: panel.text },
  cell: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted },
  actions: { width: 250, flexDirection: 'row', justifyContent: 'flex-end', gap: 14, flexWrap: 'wrap' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  actionText: { fontFamily: fonts.bold, fontSize: 13 },
  help: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: panel.muted },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
