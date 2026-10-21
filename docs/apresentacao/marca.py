"""Renders the FOTOMAC wordmark ("FOTO" Montserrat Regular + "MAC" Montserrat ExtraBold, as in
the Figma) to transparent PNGs, so the slides show the brand font in any program, even where
Montserrat is not installed.

    ~/Agente/skills/apresentacoes/.venv/bin/python docs/apresentacao/marca.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONTS = HERE.parent.parent / "frontend" / "node_modules" / "@expo-google-fonts" / "montserrat"
REGULAR = FONTS / "400Regular" / "Montserrat_400Regular.ttf"
EXTRA_BOLD = FONTS / "800ExtraBold" / "Montserrat_800ExtraBold.ttf"
SIZE = 400  # px; the slides scale it down


def wordmark(name: str, foto_color: str, mac_color: str) -> None:
    regular, bold = ImageFont.truetype(str(REGULAR), SIZE), ImageFont.truetype(str(EXTRA_BOLD), SIZE)
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    foto_box, mac_box = probe.textbbox((0, 0), "FOTO", font=regular), probe.textbbox((0, 0), "MAC", font=bold)
    top = min(foto_box[1], mac_box[1])
    width = foto_box[2] + mac_box[2] - mac_box[0]
    height = max(foto_box[3], mac_box[3]) - top
    img = Image.new("RGBA", (width + 8, height + 8), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((0, -top), "FOTO", font=regular, fill=foto_color)
    draw.text((foto_box[2] - mac_box[0], -top), "MAC", font=bold, fill=mac_color)
    img.save(HERE / name)
    print(name, img.size)


wordmark("fotomac-marca.png", "#072D44", "#007DC5")         # light slides
wordmark("fotomac-marca-branca.png", "#FFFFFF", "#3EC3FF")  # dark slide
