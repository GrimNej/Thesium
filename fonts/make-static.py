"""Builds fonts/static/: fixed-weight instances of the bundled variable fonts.

Some engines (EffectCraft 0.11) draw a variable font at its default instance whatever weight is
asked for, so they get one file per weight instead. Run from the repository root:

    python fonts/make-static.py

Needs fontTools (pip install fonttools). The output is committed; rerun only when fonts change.
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).parent
OUT = HERE / 'static'

# family file, family name, [(style name, axis values)]
PLAN = [
    ('Unbounded.ttf', 'Unbounded', [('Light', {'wght': 300}), ('Regular', {'wght': 400}),
                                     ('Bold', {'wght': 700}), ('Black', {'wght': 900})]),
    ('Fraunces.ttf', 'Fraunces', [('Light', {'wght': 300, 'opsz': 72, 'SOFT': 50, 'WONK': 0}),
                                   ('Regular', {'wght': 400, 'opsz': 72, 'SOFT': 50, 'WONK': 0}),
                                   ('SemiBold', {'wght': 600, 'opsz': 72, 'SOFT': 50, 'WONK': 1}),
                                   ('Black', {'wght': 900, 'opsz': 72, 'SOFT': 100, 'WONK': 1})]),
    ('SpaceGrotesk.ttf', 'Space Grotesk', [('Regular', {'wght': 400}), ('Medium', {'wght': 500}),
                                           ('Bold', {'wght': 700})]),
    ('Manrope.ttf', 'Manrope', [('Regular', {'wght': 400}), ('SemiBold', {'wght': 600}),
                                 ('ExtraBold', {'wght': 800})]),
    ('JetBrainsMono.ttf', 'JetBrains Mono', [('Medium', {'wght': 500}), ('Bold', {'wght': 700})]),
]

WEIGHT_CLASS = {'Light': 300, 'Regular': 400, 'Medium': 500, 'SemiBold': 600, 'Bold': 700,
                'ExtraBold': 800, 'Black': 900}


def rename(font: TTFont, family: str, style: str):
    """Names the instance as family + style so every engine lists it under the family."""
    names = font['name']
    ps = f"{family.replace(' ', '')}-{style}"
    full = f'{family} {style}'
    for record in list(names.names):
        if record.nameID in (16, 17, 21, 22, 25):
            names.removeNames(nameID=record.nameID)
    plain = style in ('Regular', 'Bold')
    for nid, value in {1: family if plain else f'{family} {style}', 2: style if plain else 'Regular',
                       4: full, 6: ps, 16: family, 17: style}.items():
        names.setName(value, nid, 3, 1, 0x409)
        names.setName(value, nid, 1, 0, 0)
    font['OS/2'].usWeightClass = WEIGHT_CLASS[style]
    bold = style in ('Bold', 'ExtraBold', 'Black')
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~0b1100001) | (0b100000 if bold else 0b1000000)
    font['head'].macStyle = 1 if bold else 0


def main():
    OUT.mkdir(exist_ok=True)
    for file, family, styles in PLAN:
        for style, axes in styles:
            font = TTFont(HERE / file)
            available = {a.axisTag for a in font['fvar'].axes}
            instance = instantiateVariableFont(font, {k: v for k, v in axes.items() if k in available},
                                               updateFontNames=False)
            rename(instance, family, style)
            target = OUT / f"{family.replace(' ', '')}-{style}.ttf"
            instance.save(target)
            print(f'{target.name}: {target.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
