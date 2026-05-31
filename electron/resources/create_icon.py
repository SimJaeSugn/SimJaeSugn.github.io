from PIL import Image, ImageDraw

def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    s = size
    r = max(4, s // 8)

    # 배경 — 다크 네이비 (#1E2D45)
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=(30, 45, 69, 255))

    # 테이블 카드
    mx = max(2, s // 7)
    tx1, tx2 = mx, s - mx
    ty1, ty2 = mx + s // 10, s - mx - s // 10
    tw, th = tx2 - tx1, ty2 - ty1

    hh = max(4, th // 5)  # 헤더 높이
    cr = max(2, s // 32)  # 카드 모서리

    # 카드 본체 — 흰색
    draw.rounded_rectangle([tx1, ty1, tx2, ty2], radius=cr, fill=(240, 246, 255, 255))

    # 헤더 — 파란색 (#2563EB)
    draw.rounded_rectangle([tx1, ty1, tx2, ty1 + hh + cr], radius=cr, fill=(37, 99, 235, 255))
    draw.rectangle([tx1, ty1 + hh, tx2, ty1 + hh + cr], fill=(37, 99, 235, 255))

    # 헤더 내 작은 점 3개 (레이아웃 힌트)
    if s >= 32:
        dot_r = max(1, s // 48)
        dot_y = ty1 + hh // 2
        for i, cx in enumerate([tx1 + hh // 2, tx1 + hh, tx1 + hh * 3 // 2]):
            draw.ellipse([cx - dot_r, dot_y - dot_r, cx + dot_r, dot_y + dot_r],
                         fill=(255, 255, 255, 200))

    # 본문 행 라인 3개
    row_area_h = th - hh
    for i in range(1, 4):
        y = ty1 + hh + int(row_area_h * i / 4)
        lw = max(1, s // 64)
        draw.rectangle([tx1 + lw, y, tx2 - lw, y + lw], fill=(200, 215, 235, 220))

    # 행마다 짧은 막대 (컬럼 힌트)
    if s >= 48:
        bar_w = [int(tw * 0.45), int(tw * 0.3), int(tw * 0.55)]
        bar_h = max(2, s // 40)
        for i in range(3):
            by = ty1 + hh + int(row_area_h * (i + 0.5) / 4) - bar_h // 2
            bx1 = tx1 + max(3, s // 32)
            bx2 = bx1 + bar_w[i % len(bar_w)]
            draw.rounded_rectangle([bx1, by, bx2, by + bar_h], radius=1,
                                    fill=(150, 175, 210, 200))

    # FK 연결선 힌트 (큰 사이즈에서만)
    if s >= 128:
        lx = tx2 + 2
        ly = ty1 + hh + int(row_area_h * 0.5 / 4)
        draw.line([lx, ly, lx + s // 20, ly], fill=(37, 99, 235, 180),
                  width=max(1, s // 80))

    return img


sizes = [256, 128, 64, 48, 32, 16]
out_path = "icon.ico"

# 256x256 소스를 기준으로 멀티사이즈 ICO 생성
src = draw_icon(256).convert("RGBA")
src.save(
    out_path,
    format="ICO",
    sizes=[(s, s) for s in sizes],
)
print(f"Created: {out_path}  ({len(sizes)} sizes: {sizes})")
