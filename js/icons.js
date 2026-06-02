// ── Lucide 아이콘 초기화 (로컬 번들 vendor/lucide.min.js) ──────────
// 정적/동적 마크업의 <i data-lucide="이름"></i> 를 인라인 SVG로 치환한다.
// 동적으로 아이콘 마크업을 삽입한 뒤에는 refreshIcons()를 호출하면 된다.
// (createIcons()는 문서 전체를 스캔하며, 이미 치환된 SVG는 건너뛰므로 반복 호출이 안전하다.)
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(); } catch (e) {}
  }
}
window.addEventListener('DOMContentLoaded', refreshIcons);
