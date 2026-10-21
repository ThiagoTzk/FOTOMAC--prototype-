import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getPrivacy } from '@/api/public';
import { VisitorHeader } from '@/components/visitor/Header';
import { Column, VLink, vtext } from '@/components/visitor/ui';
import { visitor } from '@/theme/tokens';

type Privacy = Awaited<ReturnType<typeof getPrivacy>>;

/**
 * Política de Privacidade (RF022): public, plain language, reachable from every screen through
 * the header menu and from the permission notice. The retention shown is the one the system
 * actually applies (note 5), read from the server.
 *
 * Engineering text written with the law at hand (Lei nº 13.709/2018) — it must be reviewed by
 * CESMAC's legal area before going into production.
 */
export default function PrivacyPolicy() {
  const [info, setInfo] = useState<Privacy | null>(null);
  useEffect(() => { getPrivacy().then(setInfo).catch(() => undefined); }, []);
  const retention = info?.retention ?? '…';

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader back />
      <Column narrow style={{ gap: 20, marginTop: 24 }}>
        <View style={{ gap: 6 }}>
          <Text style={vtext.h1} accessibilityRole="header">Política de Privacidade</Text>
          <Text style={vtext.body}>
            Como o FOTOMAC trata dados pessoais, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº
            13.709/2018 — LGPD).
          </Text>
        </View>

        <Section title="Quem trata os seus dados">
          O controlador é o {info?.controller ?? 'Centro Universitário CESMAC'}. O FOTOMAC existe para que cada pessoa
          fotografada nos eventos institucionais encontre as suas próprias fotos — e somente elas.
        </Section>

        <Section title="Quais dados tratamos">
          {'• Fotografias dos eventos, enviadas e conferidas pelos fotógrafos da instituição. Ficam numa galeria privada: '}
          {'ninguém navega pelo acervo; cada pessoa vê apenas as fotos em que foi reconhecida.\n'}
          {'• Vetor facial: uma sequência de números calculada a partir dos rostos das fotos publicadas, usada só para a '}
          {'comparação. É dado pessoal sensível de natureza biométrica (LGPD, Art. 5º, inciso II) e fica guardado '}
          {'separado das fotos, com acesso restrito.\n'}
          {'• Seu autorretrato da busca: usado apenas na memória do servidor durante a comparação com as fotos daquele '}
          {'evento e descartado em seguida. Não é gravado em disco, em registro nem em cache, e não há opção de guardá-lo '}
          {'para buscas futuras.\n'}
          {'• Registro da sua ciência: apenas a data, a hora, o evento e a versão do aviso — sem ligação com a sua imagem, '}
          {'seu nome ou seu aparelho.\n'}
          {'• E-mail informado numa solicitação de remoção: usado só para avisar a conclusão e apagado em seguida.'}
        </Section>

        <Section title="Para que usamos — e para que não usamos">
          As fotos e os vetores servem exclusivamente para entregar a cada pessoa as fotos em que aparece. Não são
          cedidos a terceiros, não são vendidos e não são usados para nenhuma outra finalidade. A busca acontece sempre
          dentro de um único evento: o sistema não procura uma pessoa em todos os eventos nem informa em quais eventos
          alguém aparece.
        </Section>

        <Section title="Sua permissão">
          A comparação do seu rosto só acontece depois que você lê o aviso “Permissão para uso de imagem” e toca em
          “Estou ciente” — nunca há opção marcada de antemão. O tratamento de dado sensível depende de consentimento
          específico e destacado, para finalidade específica (LGPD, Art. 11, inciso I). Se você não concordar, basta não
          prosseguir: nada é processado.
        </Section>

        <Section title="Crianças e adolescentes">
          O serviço não se destina a pessoas menores de 18 anos sem o consentimento de um dos pais ou do responsável legal
          (LGPD, Art. 14).
        </Section>

        <Section title="Por quanto tempo">
          As fotos de cada evento ficam disponíveis por {retention} após a data do evento. Ao fim do prazo, o sistema
          exclui automaticamente as fotos, as cópias reduzidas e todos os vetores faciais derivados delas.
        </Section>

        <Section title="Seus direitos">
          Você pode pedir confirmação de tratamento, acesso, correção, eliminação e informações sobre o uso dos seus
          dados (LGPD, Art. 18). Para retirar uma foto em que você aparece, use “Solicitar remoção”: a foto sai das buscas
          na hora e é excluída definitivamente em até 72 horas, mesmo sem ação do fotógrafo. Qualquer pessoa pode
          solicitar, mesmo sem ter usado a busca.
        </Section>
        <VLink label="Solicitar remoção de uma imagem" href="/remocao" />

        <Section title="Segurança">
          A conexão com o servidor é protegida, o acesso da equipe é individual e registrado, os arquivos ficam em
          armazenamento privado e cada foto só é entregue a quem a encontrou na própria busca, por um endereço que expira
          em 15 minutos.
        </Section>

        <Section title="Encarregado pelo tratamento de dados">
          {info?.dpo ?? 'A indicação do encarregado (LGPD, Art. 41) é atribuição da instituição e será publicada aqui.'}
        </Section>

        <Text style={vtext.small}>Versão do aviso de permissão em vigor: {info?.consent_version ?? '…'}</Text>
      </Column>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={vtext.h3}>{title}</Text>
      <Text style={[vtext.body, { textAlign: 'justify' }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: visitor.page } });
