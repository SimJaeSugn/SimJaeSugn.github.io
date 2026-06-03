"""설치 마법사 광고 이미지(placeholder) 생성.

Inno Setup WizardImageFile(좌측 대형, 164x314) · WizardSmallImageFile(우상단, 55x58) BMP.
실제 광고로 교체할 때는 동일 크기의 24bit BMP 로 ad.bmp / ad_small.bmp 를 덮어쓰면 된다.

실행: python electron/resources/make_ad.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))


def _font(size):
    for path in (r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


def _center(draw, box, text, font, fill):
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    draw.text((x0 + (x1 - x0 - (r - l)) / 2 - l, y0 + (y1 - y0 - (b - t)) / 2 - t), text, font=font, fill=fill)


def make(path, w, h, title, sub):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):                       # 세로 그라데이션(남색→보라)
        t = y / max(h - 1, 1)
        px_row = (int(30 + t * 40), int(40 + t * 20), int(90 + t * 90))
        for x in range(w):
            px[x, y] = px_row
    d = ImageDraw.Draw(img)
    d.rectangle([2, 2, w - 3, h - 3], outline=(255, 255, 255))
    if w >= 120:                             # 대형: 제목 + 부제 + 안내
        _center(d, (0, h * 0.30, w, h * 0.46), title, _font(34), (255, 255, 255))
        _center(d, (0, h * 0.50, w, h * 0.60), sub, _font(15), (220, 225, 255))
        _center(d, (0, h * 0.85, w, h * 0.95), "(이미지 교체 가능)", _font(11), (180, 190, 230))
    else:                                    # 소형: 짧은 텍스트만
        _center(d, (0, 0, w, h), "AD", _font(20), (255, 255, 255))
    img.save(path, "BMP")
    print(f"생성: {os.path.relpath(path, HERE)} ({w}x{h})")


if __name__ == "__main__":
    make(os.path.join(HERE, "ad.bmp"), 164, 314, "광고", "여기에 광고")          # 환영/완료 좌측 대형
    make(os.path.join(HERE, "ad_small.bmp"), 55, 58, "AD", "")                    # 내부 페이지 우상단
    make(os.path.join(HERE, "ad_banner.bmp"), 600, 120, "광고 배너", "여기에 광고")  # 내부 페이지 하단 배너(준비완료·설치중)
