# splash/promo — 원본 홍보영상 (스플래시 promo 모드)

claude.ai/design 의 `AgenticERM 홍보영상.dc.html`(React/JSX 30초 promo)을 데스크탑 스플래시에서
오프라인·즉시 재생하도록 **사전 트랜스파일 + 로컬 React 벤더링**한 번들.

| 파일 | 설명 |
|------|------|
| `promo.html` | iframe 호스트 — 로컬 React UMD + 트랜스파일된 엔진/장면 로드 후 `PromoVideo` 마운트. 재생바(스크러버)는 CSS 로 숨김 |
| `animations.jsx` · `promo-scenes.jsx` | **소스**(원본). 타임라인 엔진 + AgenticERM 장면 |
| `animations.js` · `promo-scenes.js` | **빌드 산출물**(런타임 로드). `.jsx` → JSX 트랜스파일 후 IIFE 로 감싼 것 — 직접 편집 금지 |

런타임 의존: `../../vendor/react.production.min.js`, `../../vendor/react-dom.production.min.js` (로컬, CDN 불필요).

## 재빌드 (`.jsx` 수정 시)

JSX → `React.createElement` 변환 + IIFE 래핑이 필요하다(두 파일의 top-level 식별자가 전역
스코프에서 충돌하지 않도록 각 파일을 IIFE 로 격리; 파일 간 통신은 `window` 전역으로만).

```js
// @babel/standalone 으로 1회 변환 (node)
const Babel = require('@babel/standalone');         // 또는 babel.min.js
for (const f of ['animations', 'promo-scenes']) {
  const out = Babel.transform(fs.readFileSync(f + '.jsx', 'utf8'),
    { presets: [['react', { runtime: 'classic', pragma: 'React.createElement', pragmaFrag: 'React.Fragment' }]] }).code;
  fs.writeFileSync(f + '.js', '(function () {\n' + out + '\n})();\n');
}
```

> 스플래시는 시작 시 lite(경량 재현)/promo(이 번들) 중 무작위 선택(`js/splash.js`).
> promo 로드 실패 시 자동으로 lite 로 폴백한다.
