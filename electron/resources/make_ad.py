"""설치 마법사 광고 이미지 생성 — AgenticERM(에이전틱 ERD 관리 시스템) 홍보.

생성물(24bit BMP):
  ad.bmp        164x314  환영/완료 페이지 좌측 대형
  ad_small.bmp   55x58   내부 페이지 우상단 소형(로고)
  ad_banner.bmp 600x120  내부 페이지(설치위치선택·준비완료·설치중) 하단 배너

실제 광고로 교체할 때는 동일 크기 BMP 로 덮어쓰면 된다.
실행: python electron/resources/make_ad.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

ACCENT = (91, 157, 255)     # 파랑 강조
INK = (236, 239, 246)       # 밝은 글자
MUT = (175, 185, 215)       # 보조 글자
BG_TOP = (16, 19, 38)       # 진한 남색
BG_BOT = (44, 33, 84)       # 보라


def _font(size, bold=False):
    cands = ([r"C:\Windows\Fonts\malgunbd.ttf"] if bold else []) + [
        r"C:\Windows\Fonts\malgun.ttf", r"C:\Windows\Fonts\malgunbd.ttf"]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def _bg(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        c = (int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
             int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
             int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t))
        for x in range(w):
            px[x, y] = c
    return img


def _ctext(d, cx, y, text, font, fill):
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    d.text((cx - (r - l) / 2 - l, y), text, font=font, fill=fill)


def _bullet(d, x, y, text, font):
    d.text((x, y), "•", font=font, fill=ACCENT)
    d.text((x + 16, y), text, font=font, fill=INK)


def make_sidebar(path):
    w, h = 164, 314
    img = _bg(w, h)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, 5], fill=ACCENT)                 # 상단 강조 바
    _ctext(d, w / 2, 26, "AgenticERM", _font(19, True), ACCENT)
    _ctext(d, w / 2, 52, "AI 에이전트", _font(13), INK)
    _ctext(d, w / 2, 70, "ERD 관리 시스템", _font(13), INK)
    d.line([18, 98, w - 18, 98], fill=(90, 100, 140))
    f = _font(11)
    feats = ["자연어로 ERD 설계", "AI 자동 정규화·검증", "DDL 생성·운영DB 연동", "실시간 협업·버전관리"]
    for i, t in enumerate(feats):
        _bullet(d, 16, 112 + i * 26, t, f)
    d.line([18, h - 56, w - 18, h - 56], fill=(90, 100, 140))
    _ctext(d, w / 2, h - 44, "자연어로 설계하는", _font(11), MUT)
    _ctext(d, w / 2, h - 28, "차세대 ERD 도구", _font(12, True), ACCENT)
    img.save(path, "BMP")
    print(f"생성: ad.bmp ({w}x{h})")


def make_small(path):
    w, h = 55, 58
    img = _bg(w, h)
    d = ImageDraw.Draw(img)
    _ctext(d, w / 2, 10, "AE", _font(22, True), INK)
    _ctext(d, w / 2, 37, "ERD", _font(11, True), ACCENT)
    img.save(path, "BMP")
    print(f"생성: ad_small.bmp ({w}x{h})")


def make_banner(path):
    w, h = 600, 120
    img = _bg(w, h)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 5, h - 1], fill=ACCENT)                 # 좌측 강조 바
    d.text((28, 24), "AgenticERM", font=_font(36, True), fill=ACCENT)
    d.text((30, 72), "AI 에이전트 ERD 관리 시스템", font=_font(17), fill=INK)
    d.line([320, 20, 320, h - 20], fill=(90, 100, 140))
    f = _font(15)
    for i, t in enumerate(["자연어로 ERD 제어", "자동 정규화 · DDL 생성", "운영 DB 연동 · AI 검증"]):
        _bullet(d, 345, 26 + i * 28, t, f)
    img.save(path, "BMP")
    print(f"생성: ad_banner.bmp ({w}x{h})")


if __name__ == "__main__":
    make_sidebar(os.path.join(HERE, "ad.bmp"))
    make_small(os.path.join(HERE, "ad_small.bmp"))
    make_banner(os.path.join(HERE, "ad_banner.bmp"))
