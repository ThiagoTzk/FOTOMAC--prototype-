"""The authorization term an institutional person signs (RF020 note 3).

Versioned like the visitor's notice: changing a word makes a new version, and every signature keeps
the version it signed. PROVISIONAL text, written with the law at hand (Lei nº 13.709/2018) — it must be
validated by CESMAC's legal area before production (requirements, section 11, pending item 5).
"""
from __future__ import annotations

TERM_VERSION = "2026-10-v1"
TERM_TITLE = "Termo de autorização de uso de imagem e de reconhecimento facial — pessoa institucional"


def paragraphs(full_name: str, position: str, unit: str | None) -> list[str]:
    who = f"{full_name}, {position}" + (f" ({unit})" if unit else "")
    return [
        f"Eu, {who}, autorizo o Centro Universitário CESMAC a usar as fotografias de referência do meu rosto, "
        "mostradas nesta página, para que o sistema FOTOMAC me localize nas fotografias publicadas dos eventos da "
        "instituição.",
        "Para isso, o sistema calcula, a partir dessas fotografias, um vetor facial — dado pessoal sensível de "
        "natureza biométrica (LGPD, Art. 5º, II) — e o compara com os rostos de todas as fotografias publicadas no "
        "FOTOMAC, inclusive as publicadas depois desta autorização. É a única busca no acervo inteiro que o "
        "sistema faz, e só para quem a autorizou.",
        "As fotografias em que eu for localizado ficam disponíveis para consulta somente pelas equipes de "
        "fotografia e de marketing e pela administração do FOTOMAC, para a comunicação institucional do CESMAC. "
        "Cada marcação é conferida por uma pessoa antes de qualquer uso, e cada consulta fica registrada. Nada é "
        "mostrado ao público por causa desta autorização.",
        "Esta autorização é livre, específica e destacada (LGPD, Art. 11, I). Posso revogá-la a qualquer momento, "
        "sem justificativa e sem custo, pelo link que recebo por e-mail ao assinar (LGPD, Art. 8º, § 5º). Com a "
        "revogação, as fotografias de referência, o vetor facial e todas as marcações são eliminados.",
        "Para comprovar esta autorização (LGPD, Art. 8º, § 2º), o CESMAC guarda este termo, a minha assinatura, a "
        "data e a hora, o endereço de rede (IP) e o navegador usados, inclusive depois de uma eventual revogação.",
        "Ao assinar, declaro que li este termo e que concordo com ele.",
    ]
