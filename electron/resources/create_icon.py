"""AgenticERM 실행 아이콘 생성 — 네이비→퍼플 그라데이션 배지 + ERD 엔티티 카드 + AI 반짝임.

고해상도(4x)로 렌더 후 LANCZOS 다운스케일하여 멀티사이즈 ICO 생성(안티앨리어싱).
실행: python electron/resources/create_icon.py  → icon.ico
"""
import os

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))

NAVY = (18, 21, 43)
PURPLE = (48, 34, 96)
ACCENT = (91, 157, 255)
ACCENT2 = (124, 92, 255)
WHITE = (245, 248, 255)
ROW = (150, 165, 200)


def _star4(d, cx, cy, R, fill):
    r = R * 0.30
    d.polygon([(cx, cy - R), (cx + r, cy - r), (cx + R, cy), (cx + r, cy + r),
               (cx, cy + R), (cx - r, cy + r), (cx - R, cy), (cx - r, cy - r)], fill=fill)


def render(S):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # ── 그라데이션 배지(둥근 사각) ──
    grad = Image.new("RGB", (S, S))
    gp = grad.load()
    for y in range(S):
        t = y / (S - 1)
        row = (int(NAVY[0] + (PURPLE[0] - NAVY[0]) * t),
               int(NAVY[1] + (PURPLE[1] - NAVY[1]) * t),
               int(NAVY[2] + (PURPLE[2] - NAVY[2]) * t))
        for x in range(S):
            gp[x, y] = row
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    img.paste(grad, (0, 0), mask)
    # 상단 하이라이트 테두리(은은)
    ImageDraw.Draw(img).rounded_rectangle(
        [int(S * 0.02), int(S * 0.02), int(S * 0.98), int(S * 0.98)],
        radius=int(S * 0.20), outline=(255, 255, 255, 45), width=max(1, S // 200))

    # ── ERD 엔티티 카드 ──
    cx1, cy1, cx2, cy2 = int(S * 0.25), int(S * 0.28), int(S * 0.75), int(S * 0.80)
    cr = int(S * 0.045)
    # 그림자
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([cx1 + S // 60, cy1 + S // 50, cx2 + S // 60, cy2 + S // 50],
                                         radius=cr, fill=(0, 0, 0, 90))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(S // 90)))
    d = ImageDraw.Draw(img)
    # 카드 본체
    d.rounded_rectangle([cx1, cy1, cx2, cy2], radius=cr, fill=WHITE + (255,))
    # 헤더(accent)
    hh = int((cy2 - cy1) * 0.26)
    d.rounded_rectangle([cx1, cy1, cx2, cy1 + hh + cr], radius=cr, fill=ACCENT + (255,))
    d.rectangle([cx1, cy1 + hh, cx2, cy1 + hh + cr], fill=ACCENT + (255,))
    # 행(컬럼) — 첫 행 PK 강조 + 라인
    pad = int((cx2 - cx1) * 0.12)
    ry = cy1 + hh + cr + int((cy2 - cy1) * 0.10)
    gap = int((cy2 - cy1) * 0.20)
    dot = max(2, S // 90)
    lh = max(2, S // 110)
    for i in range(3):
        y = ry + i * gap
        col = ACCENT2 if i == 0 else ROW
        d.ellipse([cx1 + pad, y, cx1 + pad + dot * 2, y + dot * 2], fill=col + (255,))
        d.rounded_rectangle([cx1 + pad + dot * 3, y, cx2 - pad, y + lh * 2], radius=lh, fill=ROW + (255,))

    # ── AI 반짝임(우상단) — 글로우 + 4점 별 ──
    sx, sy, R = int(S * 0.77), int(S * 0.23), int(S * 0.075)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([sx - R, sy - R, sx + R, sy + R], fill=ACCENT + (130,))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(S // 55)))
    _star4(ImageDraw.Draw(img), sx, sy, R, WHITE + (255,))
    return img


if __name__ == "__main__":
    master = render(1024).resize((256, 256), Image.LANCZOS)
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(os.path.join(HERE, "icon.ico"), format="ICO", sizes=sizes)
    print(f"생성: icon.ico (사이즈 {len(sizes)}종)")
