# UXER Manager — 브라우저 기반 ERD 설계 도구

> 설치 없이 브라우저에서 바로 실행되는 ERD 편집기.  
> 로컬스토리지에 자동 저장, 서버 없이 P2P 협업, SQLite 즉시 실행까지.

---

## 목차

1. [시작하기](#1-시작하기)
2. [화면 구성](#2-화면-구성)
3. [엔티티 편집](#3-엔티티-편집)
4. [AI 스키마 생성](#4-ai-스키마-생성)
5. [관계 편집](#5-관계-편집)
6. [캔버스 조작](#6-캔버스-조작)
7. [보기 모드](#7-보기-모드)
8. [내보내기 · 가져오기](#8-내보내기--가져오기)
9. [스냅샷 & 타임라인 슬라이더](#9-스냅샷--타임라인-슬라이더)
10. [SQL 실행기](#10-sql-실행기)
11. [JOIN 경로 탐색기](#11-join-경로-탐색기)
12. [정규화 진단](#12-정규화-진단)
13. [포워드 엔지니어링](#13-포워드-엔지니어링)
14. [리버스 엔지니어링](#14-리버스-엔지니어링)
15. [데이터 볼륨 시각화](#15-데이터-볼륨-시각화)
16. [탭 동기화 (BroadcastChannel)](#16-탭-동기화-broadcastchannel)
17. [P2P 실시간 협업 (WebRTC)](#17-p2p-실시간-협업-webrtc)
18. [DB 프로파일 관리](#18-db-프로파일-관리)
19. [공유 URL](#19-공유-url)
20. [테마 & 색상](#20-테마--색상)
21. [컬럼 템플릿](#21-컬럼-템플릿)
22. [단축키 모음](#22-단축키-모음)
23. [기술 스택](#23-기술-스택)
24. [데스크탑 앱 빌드](#24-데스크탑-앱-빌드-electron--python-사이드카)
25. [프로젝트 아키텍처](#25-프로젝트-아키텍처)
26. [전체 파일 구조](#26-전체-파일-구조)
27. [개발환경 설정](#27-개발환경-설정)
28. [배포 방법](#28-배포-방법)

---

## 1. 시작하기

### 로컬 실행

```
index.html 을 브라우저에서 직접 열기 (file:// 프로토콜 가능)
```

### GitHub Pages 배포 후 접속

```
https://<계정>.github.io/<저장소명>/
```

**데이터는 어디에 저장되나요?**  
모든 ERD 데이터는 브라우저 **로컬스토리지**에 자동 저장됩니다. 서버가 없어도 되며, 브라우저 캐시를 초기화하면 데이터가 사라지므로 정기적으로 백업을 권장합니다.

---

## 2. 화면 구성

```
┌─────────────────────────────────────────────────────────────────────┐
│  AgenticERM  파일  편집  보기  도구  공유  Help ● 변경됨   －100%＋  │  ← 메뉴바
├─────────────────────────────────────────────────────────────────────┤
│  ↩↪  ＋↔  💾  ⊟↺  논리 물리  ⊞▭  ⌘🔍📷  [커스텀 영역]  ⊕       │  ← 퀵바
├─────────────────────────────────────────────────────────────────────┤
│ ┌──────────┐                                 ┌─────────────┐        │
│ │ 탐색기   │                                 │ 속성│Agent  │        │  ← 우측 패널
│ │ 다이어그램│        캔버스 (ERD 작업 영역)   │  속성(컬럼) │        │     (속성/Agent 탭)
│ │ ─────────│                                 │  편집기     │        │
│ │ 엔티티   │                                 │             │        │
│ └──────────┘ ← 좌측 탐색기 패널              └─────────────┘        │
│  ┌──────────┐                                                        │
│  │  범  례  │                                                        │
│  ├──────────┤                                                        │
│  │  미니맵  │                   ┌───── 타임라인 HUD ──────┐          │
│  └──────────┘                   │ ⏱ ●──●──●──●──[슬라이더]│          │
└─────────────────────────────────────────────────────────────────────┘
                                               ↑ 우측 상단 줌 패널
```

| 영역 | 설명 |
|---|---|
| **메뉴바** | `파일` · `편집` · `보기` · `도구` · `공유` · `Help` 6개 드롭다운 메뉴. 우측에 줌 ＋－ 컨트롤. **Electron 빌드에서는** `titleBarStyle: 'hidden'` + Windows Controls Overlay(WCO)를 사용하여 OS 네이티브 창 버튼(최소화·최대화·닫기)이 오른쪽 상단에 오버레이로 표시되며, Windows 11 Snap Layouts가 활성화됨. 메뉴바 빈 영역을 드래그해 창 이동 가능 |
| **퀵바 (빠른 실행 도구 모음)** | 자주 쓰는 기능 버튼 모음. `▭` 위치 핸들로 상단 ↔ 좌측 도킹 전환 가능. 메뉴 항목을 드래그해 커스텀 버튼 추가 가능 |
| **캔버스** | ERD 작업 영역. 드래그 이동, 휠 줌, 컨텍스트 메뉴 지원 |
| **좌측 탐색기 패널** | VSCode 스타일 좌측 패널. **다이어그램** 섹션(추가·이름변경·삭제·색상·드래그 정렬·전환) + **엔티티** 섹션(목록·속성 펼침·클릭 시 캔버스 포커스). `Ctrl+B` 또는 메뉴바 레이아웃 버튼으로 토글 |
| **우측 패널** | 상단 **`속성` / `Agent` 탭** 전환. `속성` 탭: 선택한 엔티티/관계의 속성(컬럼) 인라인 편집기. `Agent` 탭: 자연어로 ERD를 제어하는 채팅 UI. 패널은 탭 (`◀`) 클릭으로 토글 |
| **하단 패널** | VSCode 스타일 서브탭 패널. `SQL 실행` 탭: 연결된 DB에 SQL 실행·결과 표시. `Ctrl+J` 또는 레이아웃 버튼으로 토글 |
| **좌하단** | 범례 + 미니맵 (각각 `+` 버튼으로 펼치기) |
| **우측 상단** | 줌 레벨 표시 및 ＋ / － 버튼 |
| **하단 중앙** | 타임라인 슬라이더 HUD (열었을 때만 표시) |

### 명령 팔레트

`Ctrl + K` (또는 `도구` → `메뉴 전체 검색`)

기능 이름이나 단축키로 모든 메뉴 항목을 즉시 검색해 실행할 수 있습니다.

---

## 3. 엔티티 편집

### 엔티티 추가

**방법 1 — 메뉴:**  
`파일` → `엔티티 추가` (단축키 `N`)

**방법 2 — 컨텍스트 메뉴:**  
캔버스 빈 곳에서 **우클릭** → `엔티티 추가`

**방법 3 — 더블클릭:**  
캔버스 빈 곳을 **더블클릭**하면 엔티티 추가 팝업이 열립니다.

### 엔티티 모달 필드 설명

| 필드 | 설명 |
|---|---|
| **엔티티 ID** | 영문 식별자. 관계 연결 시 키로 사용. 공백·특수문자 불가 |
| **논리명** | 한글 표시명 (논리 보기 모드에서 표시) |
| **물리명** | 실제 테이블명 (물리 보기 모드에서 표시, DDL 생성에 사용) |
| **설명** | 엔티티 용도 설명 |
| **예상 데이터 볼륨** | 예상 행 수 입력 시 테두리 두께로 시각화 ([15장 참고](#15-데이터-볼륨-시각화)) |
| **헤더 색상** | 파랑·초록·주황·빨강·보라·노랑·하늘 중 선택 |

### 속성(컬럼) 관리

엔티티 모달 하단의 속성 테이블에서 직접 편집합니다.

| 버튼 | 기능 |
|---|---|
| `＋ 행 추가` | 새 속성 추가 |
| `PK` | PK 토글 (빨간 열쇠 아이콘) |
| `FK` | FK 토글 (주황 아이콘). FK로 설정 시 참조 엔티티·컬럼 선택 필요 |
| `↑ ↓` | 속성 순서 위/아래 이동 |
| `✕` | 속성 삭제 |
| `⊞ 탬플릿 삽입` | 저장된 컬럼 탬플릿 일괄 삽입 |

**속성 상세 옵션:**  
각 속성 행의 `▶` 를 클릭하면 추가 옵션 표시:

- NOT NULL / UNIQUE / AUTO_INCREMENT
- 기본값 (Default Value)
- 설명 (Description)
- 인덱스 설정

### 엔티티 편집 / 삭제

- **헤더 더블클릭** → 엔티티 접기/펼치기
- **본문 더블클릭** → 편집 모달 열기
- **우클릭** → 컨텍스트 메뉴에서 `엔티티 편집` / `엔티티 삭제` / `엔티티 복제` 선택

### 포커스 모드

특정 엔티티와 연결된 관계만 강조 표시합니다.

**활성화:** 엔티티 우클릭 → `🔍 포커스 모드`  
**해제:** 빈 곳 우클릭 → `포커스 모드 해제` 또는 동일 엔티티 우클릭

---

## 4. AI 스키마 생성

`편집` → `🤖 AI 스키마 생성`

**Anthropic Claude API**를 사용해 비즈니스 요구사항 설명만으로 ERD 스키마를 자동 생성합니다.

### 사용 방법

1. **Anthropic API Key** 입력 (키는 브라우저 로컬스토리지에만 저장)
2. **비즈니스 요구사항** 텍스트 입력  
   예: `쇼핑몰 주문 처리 시스템. 고객이 상품을 주문하고 결제하며, 배송 상태를 추적할 수 있어야 합니다.`
3. **적용 방식** 선택: 현재 다이어그램에 추가 / 현재 다이어그램 교체
4. `생성` 버튼 클릭 → Claude가 엔티티·속성·관계를 자동 생성

> 생성된 스키마는 즉시 캔버스에 반영됩니다. 결과가 마음에 들지 않으면 `Ctrl + Z`로 취소할 수 있습니다.

---

## 5. 관계 편집

### 관계 추가

**방법 1 — 메뉴:**  
`파일` → `관계 추가` (단축키 `R`)

**방법 2 — 컨텍스트 메뉴:**  
캔버스 우클릭 → `⟷ 관계 추가`

**방법 3 — 포트 드래그:**  
엔티티 테두리에 마우스를 올리면 나타나는 **파란 포트(●)** 에서 다른 엔티티로 드래그

### 카디널리티 종류

| 표기 | 의미 |
|---|---|
| `1:1` | 일대일 |
| `1:N` | 일대다 |
| `N:M` | 다대다 (⚠ 정규화 진단 대상) |

### 크로우풋 표기법

`보기` → `표기법` → `크로우풋 표기` 체크로 크로우풋(Crow's Foot) 표기법 ON/OFF 전환.

### 관계선 경로 조정

관계선 선분을 드래그하면 중간 벤드 포인트를 추가해 경로를 구부릴 수 있습니다.  
벤드 포인트 더블클릭으로 제거. 원래대로 되돌리려면: 관계선 우클릭 → `↺ 경로 초기화`

### 관계 레이블 위치 조정

관계선의 레이블을 드래그하면 위치를 자유롭게 이동할 수 있습니다.

---

## 6. 캔버스 조작

### 이동 & 줌

| 동작 | 방법 |
|---|---|
| 캔버스 이동 | 빈 곳 드래그 (또는 가운데 클릭) |
| 줌 인/아웃 | 마우스 휠 / 메뉴바 우측 ＋－ 버튼 |
| 전체 맞춤 | `보기` → `전체 맞춤` 또는 단축키 `Home` |
| 뷰 초기화 | `보기` → `뷰 초기화` |

### 엔티티 이동 & 다중 선택

| 동작 | 방법 |
|---|---|
| 단일 이동 | 엔티티 헤더 드래그 |
| 다중 선택 | 빈 곳에서 `Shift + 드래그` (선택 박스) 또는 `Shift + 클릭` |
| 다중 이동 | 선택 후 헤더 드래그 |

### 자동 배치

`보기` → `배치` 그룹에서 선택:

| 옵션 | 설명 |
|---|---|
| `✨ 자동배치` | FK 관계 그래프 기반 스마트 배치 — 계층 흐름·고아 분리·선택 범위·애니메이션·전체 맞춤 |
| `⋹ 계층형 배치` | FK 관계를 따라 부모→자식 상하 배치 |
| `⊞ 격자형 배치` | 균등 격자로 배치 |
| `◯ 원형 배치` | 원형으로 고르게 배치 |
| `⫸ 자동 관계선 최적화` | 겹쳐진 관계선 경로 자동 분리 |
| `⫷ 관계선 최적화 V2` | 개선된 알고리즘으로 관계선 재배치 |

### 정렬

`보기` → `정렬` 그룹:

| 아이콘 | 기능 |
|---|---|
| `◧` | 왼쪽 정렬 |
| `↔` | 수평 중앙 정렬 |
| `◨` | 오른쪽 정렬 |
| `⬒` | 위 정렬 |
| `↕` | 수직 중앙 정렬 |
| `⬓` | 아래 정렬 |
| `⇔` | 수평 균등 배분 |
| `⇕` | 수직 균등 배분 |

### 그리드 스냅

`설정` → `그리드 스냅` 체크로 20px 그리드에 맞춰 이동.  
활성화 시 퀵바의 `⊞` 버튼이 강조됩니다.

### 섹션 모드

`편집` → `섹션 모드` 체크 활성화 후 캔버스를 드래그하면 색상 구역(섹션)이 생성됩니다.  
또는 **`Ctrl + 드래그`** 로 섹션 모드 전환 없이 즉시 섹션을 그릴 수 있습니다.  
섹션은 여러 엔티티를 논리적 그룹으로 묶을 때 사용합니다.  
섹션 더블클릭 → 이름 변경 / 섹션 우클릭 → `섹션 삭제`

### 스티커 메모

캔버스 우클릭 → `📝 메모 추가` → 포스트잇 스타일의 메모가 생성됩니다.  
메모 더블클릭 → Text / Markdown 탭 전환 후 내용 편집 / 색상 변경  
메모 우클릭 → `메모 삭제`

### 엔티티 검색

`도구` → `🔍 엔티티 검색` 또는 `Ctrl + F`  
입력 시 실시간 필터링 (논리명·물리명·ID). 결과 클릭 시 해당 엔티티로 뷰 이동.

---

## 7. 보기 모드

### 논리 / 물리 전환

`보기` → `표기법` 그룹의 `논리 보기` / `물리 보기` 항목으로 전환.  
또는 퀵바의 `논리` / `물리` 버튼 클릭:

| 모드 | 엔티티 표시 | 속성 표시 |
|---|---|---|
| **논리** | 논리명 (한글) | 논리명 |
| **물리** | 물리명 (테이블명) | 물리명 |

### 미니맵

좌하단 `미니맵` 패널의 `+` 버튼으로 펼치기.  
전체 ERD 축소 뷰. 현재 뷰포트 위치가 파란 사각형으로 표시됩니다.  
미니맵 클릭 시 해당 위치로 뷰 이동.

---

## 8. 내보내기 · 가져오기

### 데이터 내보내기

`파일` → 내보내기 그룹:

| 항목 | 단축키 | 설명 |
|---|---|---|
| `💾 JSON 내보내기` | `Ctrl+S` | 현재 다이어그램만 JSON으로 저장 |
| `💾 전체 백업 내보내기` | `Ctrl+Shift+S` | 모든 다이어그램 + 스냅샷을 JSON으로 저장 |
| `🗄 DDL 생성` | — | ERD를 선택한 DB 형식의 DDL로 생성 |
| `🖼 이미지 내보내기 (섹션 포함)` | — | PNG 이미지. 섹션 배경 포함 |
| `🖼 이미지 내보내기 (섹션 제외)` | — | PNG 이미지. 섹션 없이 깔끔하게 |
| `🖼 이미지 내보내기 (고해상도 2x)` | — | PNG 이미지. 2배 해상도 (고품질 출력용) |
| `⬡ SVG 내보내기` | — | 벡터 형식. 확대해도 선명 |
| `📄 Markdown 내보내기` | — | 테이블 형식 Markdown |
| `🌐 HTML 내보내기` | — | 스탠드얼론 HTML 파일 |
| `🖨 인쇄 / PDF 저장` | — | 브라우저 인쇄 다이얼로그 → PDF 저장 |

> **내보내기 폴더 설정**: 처음 내보내기 시 폴더 선택 다이얼로그가 표시됩니다. 이후 같은 폴더에 자동 저장됩니다.  
> 폴더를 바꾸려면 `설정` → `📁 내보내기 폴더 재설정`을 클릭하세요.  
> File System Access API 미지원 브라우저에서는 즉시 다운로드 방식으로 동작합니다.

### 데이터 불러오기

`파일` → 불러오기 그룹:

| 항목 | 설명 |
|---|---|
| `📂 JSON 불러오기` | JSON 파일 가져오기 |
| `📥 전체 백업 불러오기` | 백업 파일 복원 |
| `⬆ DDL 가져오기` | CREATE TABLE SQL을 붙여넣으면 엔티티로 자동 변환 |

### DDL 생성

`파일` → `🗄 DDL 생성`  
현재 ERD를 MySQL / PostgreSQL / Oracle / SQL Server 중 선택한 DB 형식의 DDL로 생성합니다.  
복사 버튼 한 번으로 클립보드에 복사.

---

## 9. 스냅샷 & 타임라인 슬라이더

### 스냅샷이란?

특정 시점의 ERD 전체 상태를 이름 붙여 저장하는 기능입니다.  
최대 20개까지 저장됩니다. (초과 시 오래된 것부터 삭제)

### 스냅샷 저장

`도구` → `스냅샷` → `📷 스냅샷 저장` → 이름 입력 후 저장  
또는 퀵바의 `📷` 버튼 클릭

### 스냅샷 목록 / 복원

`도구` → `스냅샷` → `📋 스냅샷 목록`  
- 저장된 스냅샷 목록 확인
- 각 스냅샷에서 **diff 뷰** 클릭 → 현재 상태와의 차이점 비교
- **복원** 클릭 → 해당 시점으로 되돌리기

### 타임라인 슬라이더 (HUD)

`도구` → `스냅샷` → `⏱ 타임라인 슬라이더`

화면 하단 중앙에 반투명 컨트롤 바가 나타납니다.  
**모달을 닫지 않고** 슬라이더를 움직이면서 ERD 변화를 캔버스에서 직접 확인할 수 있습니다.

| 조작 | 방법 |
|---|---|
| 시점 이동 | 슬라이더 드래그 또는 도트(●) 클릭 |
| 이전/다음 | `←` `→` 키 또는 `↓` `↑` 키 |
| 복원 확정 | `↩ 복원` 버튼 클릭 또는 `Enter` 키 |
| 닫기 (원본 복구) | `✕` 버튼 또는 `Esc` 키 |

> HUD를 닫으면 현재 ERD가 자동으로 복구됩니다. 복원 버튼을 누르지 않는 한 실제 데이터는 변경되지 않습니다.

---

## 10. SQL 실행기

`도구` → `SQL` → `🗄 SQL 실행기`

브라우저 내장 **SQLite (sql.js WASM)** 를 사용해 현재 ERD 스키마를 즉시 테스트할 수 있습니다. 서버가 전혀 필요 없습니다.

### 사용 순서

1. **`📋 스키마 불러오기`** 클릭  
   → 현재 ERD의 엔티티/속성을 SQLite 테이블로 자동 생성  
   → 하단에 `✅ N개 테이블 로드됨` 표시

2. **샘플 버튼** 클릭 (테이블명 버튼들)  
   → 해당 테이블의 `SELECT * LIMIT 20` 쿼리가 자동 입력

3. **쿼리 직접 입력** 후 `▶ 실행` 또는 `Ctrl + Enter`

4. 결과가 아래 표 형식으로 표시됨

### 추가 기능

| 기능 | 설명 |
|---|---|
| `DDL 보기` 체크박스 | 생성된 CREATE TABLE 구문 표시 |
| `JOIN` 버튼 | 첫 번째 관계를 이용한 JOIN 샘플 쿼리 자동 생성 |
| `테이블 목록` 버튼 | `SELECT name FROM sqlite_master WHERE type='table'` |
| `↺ DB 초기화` | DB 닫고 초기화 (스키마 재로드 필요) |

> **참고**: 실행된 INSERT/UPDATE/DELETE는 브라우저 메모리에만 반영되며, ERD나 로컬스토리지에는 영향을 주지 않습니다.

---

## 11. JOIN 경로 탐색기

`도구` → `SQL` → `🔗 JOIN 경로 탐색기`

두 엔티티 사이의 FK 관계 경로를 자동으로 탐색하고 JOIN SQL을 생성합니다.

### 사용 방법

1. **시작 엔티티** 선택
2. **도착 엔티티** 선택
3. **경로 탐색** 버튼 클릭

### 결과

- 두 테이블 사이의 모든 JOIN 경로 표시
- 직접 연결부터 3~4단계 간접 연결까지 탐색
- 각 경로마다 완성된 SQL 생성 및 복사 버튼 제공

---

## 12. 정규화 진단

`도구` → `SQL` → `⚠ 정규화 진단`

현재 ERD를 분석해 잠재적 설계 문제를 감지합니다.

### 감지 항목

| 항목 | 설명 |
|---|---|
| **반복 컬럼 패턴** | `addr1`, `addr2`, `addr3` 처럼 숫자로 끝나는 같은 패턴 컬럼이 2개 이상 있을 경우 → 1NF 위반 가능성 |
| **N:M 직접 연결** | 중간(교차) 테이블 없이 N:M 관계가 설정된 경우 |

### 결과 표시

진단 후 문제가 있는 엔티티 헤더 우측에 **⚠ 주황색 배지**가 표시됩니다.  
배지에 마우스를 올리면 구체적인 경고 내용이 툴팁으로 표시됩니다.

### 배지 제거

`도구` → `SQL` → `✓ 진단 배지 제거`

---

## 13. 포워드 엔지니어링

`도구` → `Remote` → `📤 포워드엔지니어링`  
또는 엔티티 우클릭 → `📤 포워드 엔지니어링`  
또는 **DB 다이어그램 탭의 ⬆ 버튼** (DB 연결 다이어그램에서만 표시)

**ERD → 실제 DB** 방향. 현재 ERD의 DDL을 연결된 운영 DB에 직접 실행합니다.

> **사전 조건**: Node.js 미들웨어(포트 3737)가 실행 중이고 DB 접속 설정이 완료된 상태여야 합니다. ([18장 DB 프로파일 관리](#18-db-프로파일-관리) 참고)

> **DB 다이어그램 주의**: DB 다이어그램의 연결 프로파일과 현재 활성 프로파일이 다를 경우, 실행 전 경고 다이얼로그가 표시됩니다. 포워드 엔지니어링은 현재 **활성 연결 기준**으로 DDL을 실행합니다.

### 사용 순서

1. 엔티티 선택 (전체 또는 개별)
2. DDL 방언(MySQL · PostgreSQL · Oracle · SQL Server) 확인
3. 기존 테이블 충돌 처리 방식 선택 (DROP · RENAME · SKIP)
4. `실행` 버튼 → DDL이 운영 DB에 반영됨

---

## 14. 리버스 엔지니어링

`도구` → `Remote` → `🔄 리버스엔지니어링`  
또는 **새 다이어그램 생성 시 "DB 스키마에서 리버스 엔지니어링" 선택** (DB 연결 다이어그램 생성 시 초기 채움)

**실제 DB → ERD** 방향. 연결된 운영 DB의 스키마를 읽어 ERD를 자동으로 생성합니다.

> **사전 조건**: Node.js 미들웨어(포트 3737)가 실행 중이고 DB 접속 설정이 완료된 상태여야 합니다. ([18장 DB 프로파일 관리](#18-db-프로파일-관리) 참고)

### 사용 순서

1. 불러올 테이블 목록 확인 후 선택
2. `가져오기` 버튼 클릭
3. 선택한 테이블이 엔티티로 변환되어 캔버스에 추가됨

### DB 다이어그램 초기 채움

새 DB 연결 다이어그램 생성 시 초기 채움 옵션을 선택할 수 있습니다:

- **빈 캔버스** — 빈 다이어그램으로 시작합니다.
- **DB 스키마에서 리버스 엔지니어링** — 생성과 동시에 해당 DB 프로파일의 전체 테이블·관계가 캔버스에 채워집니다.
- **기존 DB 다이어그램 열기** — 해당 프로파일 DB에 이미 저장된 다이어그램 목록에서 선택해 로컬 워크스페이스로 불러옵니다. 기존 `diagram_id`가 그대로 유지되므로 같은 DB를 사용하는 다른 사용자와 동기화됩니다.

> **DB 다이어그램 삭제**: DB 연결 다이어그램을 삭제하면 **① 로컬에서만 삭제(DB 원본 보존 — 나중에 "기존 DB 다이어그램 열기"로 다시 불러올 수 있음)** 또는 **② DB 원본까지 삭제(같은 DB를 쓰는 모두에게서 사라짐)** 중 하나를 선택하는 다이얼로그가 표시됩니다. 로컬 다이어그램은 기존처럼 바로 삭제됩니다.

> **보안 주의**: DB 연결 다이어그램을 공유하면 해당 DB 전체에 접근할 수 있습니다. **읽기전용 계정** 사용을 권장합니다. 메타테이블 저장·동기화에는 INSERT/UPDATE 권한이 필요합니다. `UXER_ERD_DIAGRAM` 내부 메타테이블은 스키마 조회 결과에서 자동으로 제외됩니다.

---

## 15. 데이터 볼륨 시각화

엔티티 추가/편집 모달의 **예상 데이터 볼륨** 필드에 예상 행 수를 입력하면, 엔티티 테두리 두께와 배지로 규모를 시각화합니다.

| 행 수 | 테두리 두께 | 배지 |
|---|---|---|
| 없음 | 1.5px (기본) | 없음 |
| 1 ~ 9,999 | 2.5px | 없음 |
| 10,000 ~ 99,999 | 3.5px | `1만+` (노란색) |
| 100,000 ~ 999,999 | 5px | `10만+` (노란색) |
| 1,000,000 이상 | 7px | `100만+` (빨간색) |

한눈에 어느 테이블이 대용량인지 파악할 수 있습니다.

---

## 16. 탭 동기화 (BroadcastChannel)

같은 PC의 **여러 탭**에서 동일한 ERD를 실시간 동기화합니다. (같은 PC 내 탭 간에만 동작)

### 동작 방식

- 같은 URL을 여러 탭에서 열면 자동으로 연결됩니다.
- 한 탭에서 저장할 때마다 16ms 디바운스 후 다른 탭으로 전송됩니다.
- 메뉴바 우측 **`📡 N탭 연결`** 배지로 연결 상태 확인 가능.

### 토글

`공유` → `탭 동기화` 체크 항목

> **활용 사례**: 편집용 탭과 발표용 탭을 동시에 열고, 편집 내용을 발표 탭에 즉시 반영.

---

## 17. P2P 실시간 협업 (WebRTC)

`공유` → `🔗 P2P 실시간 협업`

**PeerJS**를 통한 WebRTC DataChannel로 다른 PC와 ERD를 공동 편집합니다.  
서버 없이 P2P 직접 통신 (PeerJS 클라우드는 연결 중개만 담당).

### 협업 시작 (호스트)

1. `🏠 호스트로 시작` 클릭
2. 생성된 **연결 코드** (예: `abc123`) 를 상대방에게 전달
3. 상대방이 연결하면 `🔗 협업 중` 배지 표시

### 협업 참여 (게스트)

1. `🔑 게스트로 참여` 클릭
2. 호스트로부터 받은 **연결 코드** 입력
3. `연결` 버튼 클릭
4. 호스트의 ERD를 받아 공동 편집 시작

### 데이터 안전 보장 (자동 스냅샷)

> **중요**: 협업 연결이 열리는 순간, 자신의 현재 ERD가 자동으로 스냅샷에 저장됩니다.  
> 스냅샷 이름: `협업 전 자동저장 (HH:MM)`

협업 종료 후 모달에 **`↩ 협업 전 작업으로 복원`** 버튼이 표시됩니다.  
클릭하면 협업 전 나의 ERD로 되돌아갑니다.

### 협업 종료

- `연결 종료` 버튼 클릭
- 또는 상대방이 탭을 닫으면 자동 감지

---

## 18. DB 프로파일 관리

`공유` → `🗂 DB 프로파일 관리`

운영 DB 접속 정보를 여러 개의 **프로파일**로 저장하고 전환할 수 있습니다.  
포워드/리버스 엔지니어링 및 SQL 원격 실행에 사용됩니다.

### 주요 기능

| 기능 | 설명 |
|---|---|
| **프로파일 추가** | DB 종류(MySQL · PostgreSQL · Oracle · SQL Server) 및 접속 정보 저장 |
| **프로파일 전환** | 목록에서 선택하면 해당 DB로 즉시 전환 |
| **프로파일 편집** | 기존 접속 정보 수정 |
| **프로파일 삭제** | 불필요한 접속 정보 제거 |
| **비밀번호 확인** | 저장된 비밀번호를 복호화해 평문으로 확인(토글 표시) |

> 접속 정보는 미들웨어 서버에 암호화되어 저장됩니다. 미들웨어가 실행 중이어야 이 기능을 사용할 수 있습니다.

---

## 19. 공유 URL

`공유` → `🔗 공유 URL 생성`

현재 ERD 전체 상태를 **LZ-String 압축**하여 URL의 `?erd=` 파라미터에 담습니다.  
URL이 클립보드에 자동 복사됩니다.

### 사용 방법

1. 공유 URL 생성 → 복사된 URL을 상대방에게 전달
2. 상대방이 URL로 접속하면 ERD가 자동 복원됨

> **주의**: 엔티티 수가 많으면 URL이 매우 길어집니다. 일부 메신저·이메일에서 길이 제한에 걸릴 수 있습니다.  
> 대용량 ERD는 전체 백업 JSON 파일을 공유하는 것을 권장합니다.

---

## 20. 테마 & 색상

`설정` → `🎨 테마 변경`

### 기본 제공 테마

| 테마 | 배경 색조 |
|---|---|
| **다크 (기본)** | 짙은 남보라 (#1e1e2e) |
| **라이트** | 흰 바탕 |
| **Frappé** | Catppuccin Frappé |
| **Macchiato** | Catppuccin Macchiato |

선택 즉시 적용되며 로컬스토리지에 저장됩니다.

### 엔티티 색상

엔티티 편집 모달 → **헤더 색상** 선택:  
기본 / 파랑 / 초록 / 주황 / 빨강 / 보라 / 노랑 / 하늘

---

## 21. 컬럼 템플릿

자주 쓰는 컬럼 조합을 탬플릿으로 저장해 엔티티에 일괄 삽입합니다.

`도구` → `탬플릿` → `📎 컬럼 탬플릿 관리`

### 기본 제공 탬플릿

| 탬플릿 | 포함 컬럼 |
|---|---|
| **감사 컬럼** | 등록일시, 수정일시, 등록사용자ID, 수정사용자ID |
| **소프트 삭제** | 삭제여부(DEL_YN), 삭제일시(DEL_DT) |
| **사용여부** | 사용여부(USE_YN) |

### 사용 방법

1. 엔티티 편집 모달 하단 `⊞ 탬플릿 삽입` 클릭
2. 삽입할 탬플릿 선택
3. 해당 컬럼들이 속성 목록 맨 아래에 추가됨

---

## 22. 단축키 모음

`Help` → `⌨ 단축키 목록` 에서도 확인 가능합니다.

### 파일 & 편집

| 단축키 | 기능 |
|---|---|
| `N` | 엔티티 추가 (입력 필드 미포커스 상태) |
| `R` | 관계 추가 (입력 필드 미포커스 상태) |
| `Ctrl + S` | JSON 내보내기 (현재 다이어그램) |
| `Ctrl + Shift + S` | 전체 백업 내보내기 (스냅샷 포함) |
| `Ctrl + Z` | 실행취소 (Undo) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | 다시실행 (Redo) |

### 편집 — 복사 & 선택

| 단축키 | 기능 |
|---|---|
| `Ctrl + C` | 선택된 엔티티 복사 |
| `Ctrl + V` | 붙여넣기. 미선택 시 텍스트 → 속성 자동 파싱 후 엔티티 생성 팝업 |
| `Ctrl + D` | 복제 (다중 선택 시 일괄 복제) |
| `Delete` | 선택한 엔티티 / 관계 / 섹션 삭제 |
| `Ctrl + A` | 전체 엔티티 선택 |
| `Shift + 클릭` | 다중 선택 토글 |
| `Shift + 드래그` | 범위 선택 (빈 캔버스에서 박스로 일괄 선택) |

### 캔버스 & 뷰

| 단축키 | 기능 |
|---|---|
| `Home` | 전체 맞춤 (Fit All) |
| `휠 스크롤` | 줌 인/아웃 |
| `방향키` | 선택한 엔티티 1px 이동 |
| `Shift + 방향키` | 선택한 엔티티 10px 이동 |
| `Ctrl + 드래그` | 섹션 그리기 (빈 캔버스에서) |
| `Esc` | 선택 해제 / 모달·검색창 닫기 |

### 검색 & 도구

| 단축키 | 기능 |
|---|---|
| `Ctrl + K` | 명령 팔레트 (메뉴 전체 검색) |
| `Ctrl + F` | 엔티티 검색 |
| `Ctrl + Shift + A` | Agent 패널 토글 (열기/닫기) |

### 마우스 인터랙션

| 동작 | 기능 |
|---|---|
| `더블클릭 (엔티티 헤더)` | 엔티티 접기 / 펼치기 |
| `더블클릭 (엔티티 본문)` | 엔티티 편집 팝업 열기 |
| `더블클릭 (빈 캔버스)` | 엔티티 추가 팝업 열기 |
| `더블클릭 (관계선)` | 관계 편집 팝업 열기 |
| `더블클릭 (관계 중간점)` | 벤드 포인트 제거 |
| `더블클릭 (섹션)` | 섹션 이름 변경 |
| `더블클릭 (메모)` | 메모 인라인 편집 |
| `드래그 (포트)` | 관계 생성 |
| `드래그 (관계 선분)` | 경로 꺾기 (벤드 포인트 추가) |
| `드래그 (관계 레이블)` | 레이블 위치 조정 |

### SQL 실행기 단축키

| 단축키 | 기능 |
|---|---|
| `Ctrl + Enter` | SQL 실행 |

### 타임라인 HUD 단축키

| 단축키 | 기능 |
|---|---|
| `←` `→` / `↓` `↑` | 이전/다음 스냅샷 |
| `Enter` | 현재 시점으로 복원 |
| `Esc` | HUD 닫기 (원본 복구) |

---

## 23. 기술 스택

| 분류 | 기술 |
|---|---|
| **런타임** | 순수 HTML/CSS/JavaScript (번들러 없음) |
| **데이터 저장** | Browser LocalStorage |
| **렌더링** | Canvas 2D API |
| **미니맵** | OffscreenCanvas + Web Worker |
| **압축** | LZ-String (공유 URL용) |
| **SQLite** | sql.js (SQLite compiled to WASM) |
| **P2P 협업** | PeerJS (WebRTC DataChannel) |
| **탭 동기화** | BroadcastChannel API |
| **파일 저장** | File System Access API (폴더 직접 저장) |
| **AI 스키마 생성** | Anthropic Claude API |
| **배포** | GitHub Pages (정적 호스팅) |

### 브라우저 호환성

| 기능 | 필요 브라우저 |
|---|---|
| 기본 ERD 편집 | 모든 모던 브라우저 |
| 탭 동기화 | Chrome 54+ / Firefox 38+ / Edge 79+ |
| P2P 협업 | Chrome 56+ / Firefox 44+ / Edge 79+ |
| 폴더 직접 저장 | Chrome 86+ / Edge 86+ (Safari/Firefox 미지원 → 다운로드 폴백) |
| SQL 실행기 | WebAssembly 지원 브라우저 (모든 모던 브라우저) |

---

## 24. 데스크탑 앱 빌드 (Electron + Python 사이드카)

AgenticERM을 Windows 데스크탑 앱(.exe 설치파일)으로 빌드할 수 있습니다.

### 구조

| 폴더 | 역할 |
|------|------|
| `electron/` | Electron main process. `titleBarStyle:'hidden'` + WCO(Windows Controls Overlay) 방식으로 ERD 프론트엔드를 로드하고 Python 사이드카를 관리. WCO 색상 갱신 IPC(`set-title-bar-overlay`) 처리 |
| `proxy/python/` | FastAPI 기반 DB 미들웨어 사이드카. PyInstaller로 단일 exe 패키징 |

### 사전 요구사항

| 도구 | 버전 | 용도 |
|------|------|------|
| Node.js | 18+ | Electron 빌드 |
| Python | 3.11+ | FastAPI 사이드카 빌드 |
| PyInstaller | 6+ | Python → 단일 exe |

> NSIS 설치파일 빌더와 electron-updater는 각각 electron-builder가 자동 다운로드/`npm install`로 설치되므로 별도 도구 설치가 필요 없습니다.

### 빌드 순서

> **한 번에 빌드** — 프로젝트 루트에서 아래 스크립트를 실행하면 2단계가 순서대로 자동 실행됩니다.
> ```powershell
> .\build-desktop.ps1
> ```

> **버전 관리(단일 원천)** — 버전은 `electron/package.json`의 `version` 한 곳에서만 관리합니다.
> electron-builder(NSIS)가 이 값을 설치파일명·exe 메타데이터·업데이트 메타데이터(`latest.yml`)에 사용하고,
> 사이드카 `/ping` 버전(`proxy/python/build.ps1`이 `_version.py` 생성)도 같은 원천에서 자동 파생됩니다.

**1단계 — Python 사이드카 빌드**

```powershell
cd proxy/python
pip install -r requirements.txt
.\build.ps1
# 결과: proxy\python\dist\uxer-sidecar.exe
```

**2단계 — Electron 앱 + NSIS 설치파일 빌드**

```powershell
cd electron
npm install
npm run build:win   # electron-builder NSIS (로컬은 --publish never)
# 결과: electron\dist\AgenticERM_Desktop_Setup_{버전}.exe (+ latest.yml · .blockmap)
```

> NSIS 빌더는 electron-builder가 자동 다운로드하므로 Inno Setup 설치가 필요 없습니다.
> 설치된 앱의 인앱 업데이트(electron-updater, [도움말 ▸ 소프트웨어 정보]에서 수동)는 §28 참조.

### 포트

| 서버 | 포트 | 설명 |
|------|------|------|
| Node.js 미들웨어 | 3737 | 웹 서비스용 독립 실행형 미들웨어 |
| Python 사이드카 | 3737 | Electron 앱 전용 사이드카 (동시 실행 없음) |

> Python 사이드카는 Electron 앱과 함께 실행·종료되며, 사용자가 별도로 관리할 필요가 없습니다.

---

## 데이터 초기화

`편집` → `⚠ 데이터 초기화` (빨간 항목)

**모든 다이어그램, 관계, 스냅샷이 삭제됩니다.** 되돌릴 수 없으므로 반드시 백업 후 실행하세요.

---

## 25. 프로젝트 아키텍처

AgenticERM은 세 가지 실행 환경을 지원하는 레이어 구조입니다.

```
┌──────────────────────────────────────────────────────────────────┐
│                   프론트엔드 (브라우저 / Electron)                 │
│  index.html  +  js/*.js  +  css/*.css                            │
│  Canvas 2D · LocalStorage · BroadcastChannel · PeerJS · sql.js  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ HTTP (포트 3737)
          ┌────────────────┴─────────────────┐
          │                                  │
┌─────────▼──────────┐          ┌────────────▼──────────┐
│  Node.js 미들웨어   │          │   Python 사이드카      │
│  proxy/nodejs/     │          │   proxy/python/        │
│  포트: 3737         │          │   포트: 3737            │
│  독립 실행형 exe    │          │   Electron 전용 exe    │
│  (pkg 빌드)         │          │   (PyInstaller 빌드)   │
└─────────┬──────────┘          └────────────┬──────────┘
          └────────────────┬─────────────────┘
                           │
          ┌────────────────▼─────────────────┐
          │              운영 DB              │
          │  MySQL · PostgreSQL · Oracle ·   │
          │  SQL Server                      │
          └──────────────────────────────────┘
```

### 프론트엔드 주요 모듈

| 파일 | 역할 |
|------|------|
| `js/state.js` | 전역 상태 관리 (entities, relations, diagrams, undo/redo) |
| `js/canvas.js` | Canvas 2D 렌더링·줌·패닝·드래그 이벤트 |
| `js/entities.js` | 엔티티 CRUD |
| `js/relations.js` | 관계선 CRUD·웨이포인트·크로우풋 |
| `js/ui.js` | 모달·툴바·패널·컨텍스트 메뉴 DOM 제어 |
| `js/explorer.js` | 좌측 Explorer 패널 (VSCode 스타일 다이어그램 CRUD·엔티티 목록) |
| `js/bottom_panel.js` | 하단 패널 (VSCode 스타일 서브탭 · 연결 DB SQL 실행/결과) |
| `js/icons.js` | Lucide 아이콘 초기화 (`vendor/lucide.min.js` 로컬 번들 · `data-lucide` → SVG) |
| `js/agent_panel.js` | 우측 패널 `속성`/`Agent` 탭 전환 · 채팅 UI · 스트림/interrupt 루프 |
| `js/agent_tools.js` | Agent 클라이언트 툴 **68종**(엔티티·관계·속성 CRUD, 선택·뷰·하이라이트, 일괄·관계자동화·논리물리명 일괄변경·컬럼 논리명 한글화, 분석·검증·통계, 섹션·메모, 다이어그램·스냅샷·다이어그램간 엔티티 복사·리버스 엔지니어링(DB→ERD), 테이블정의서·데이터사전·ERD명세서 산출물·콘텐츠 파일저장, 표준용어 점검·준수수정, DB 코멘트 일괄 적용, 테마·단축키·메뉴·컬럼템플릿 정보 등) · 드래프트 커밋·원자적 undo · 표준용어사전 연동 · async 툴 지원. 서버 측 DB 툴은 `agent/tools_proxy.py`(24종, 접속정보·프로파일관리·introspection·데이터분석·포워드엔지니어링). v1·v2·v3 공유 |
| `js/layout.js` | 계층형·격자형·원형 자동 배치 알고리즘 |
| `js/export.js` | PNG·SVG·Markdown·HTML·DDL 내보내기 |
| `js/import.js` | JSON·DDL 가져오기 및 파싱 |
| `js/diagrams.js` | 다이어그램 목록 CRUD·LocalStorage 영속성 |
| `js/timeline.js` | 스냅샷 저장·복원·타임라인 HUD |
| `js/sql_runner.js` | sql.js WASM 인터페이스·쿼리 실행 |
| `js/std_dict.js` | 표준사전(단어·도메인·용어) 관리 — 사이드카(`/stddict`) HTTP CRUD·검색·엑셀 업로드·시드 복원 (Electron 전용) |
| `js/join_explorer.js` | FK 그래프 탐색·JOIN SQL 생성 |
| `js/normalize.js` | 정규화 위반 감지 (1NF·N:M) |
| `js/share.js` | LZ-String 압축 공유 URL 생성·복원 |
| `js/webrtc.js` | PeerJS WebRTC DataChannel P2P 협업 |
| `js/broadcast.js` | BroadcastChannel 탭 동기화 |
| `js/shortcuts.js` | 전역 단축키 바인딩 |
| `js/minimap_worker.js` | OffscreenCanvas Web Worker 미니맵 |
| `js/db_connect.js` | 미들웨어 HTTP 통신 (DB 연결 UI) |
| `js/reverse_engineer.js` | 운영 DB 스키마 역공학 |
| `js/forward_engineer.js` | DDL 생성 (Forward Engineering) |
| `js/profile_manager.js` | DB 접속 프로파일 관리 |
| `js/erd_db_store.js` | DB 저장·공유 다이어그램 클라이언트 — `/erd-store/*` API 래퍼(init·list·load·save·delete), 1.5s 디바운스 자동저장(`erdDbScheduleSave`), 8s 폴링(M4 타인 변경 감지), 낙관적 잠금(409 충돌 재로드). 데스크탑 전용(웹은 graceful 비활성화) |
| `js/pc_store.js` | PC앱(Electron) 워크스페이스 영속화 — Ctrl+S로 모든 다이어그램+스냅샷을 사이드카 단일 파일에 저장/복원 (웹은 미사용) |
| `js/splash.js` · `css/splash.css` | 시작 화면(스플래시) — 시작 시 **두 모드 중 무작위**: ① lite(브랜드 경량 재현: 로고·회전 캡션·'112 컬럼 표준화' 카운터) ② promo(원본 홍보영상 `splash/promo/promo.html` iframe). 모든 데이터 로드 완료 시 '시작하기'(닫기) 활성. promo 로드 실패 시 lite 폴백. `localStorage`(`aerm_splash_disabled`)로 영구 비활성 — 소프트웨어 정보(About) 모달 토글·'다음에 표시 안 함' 체크 |
| `splash/promo/` | 원본 홍보영상 번들(promo 모드) — `promo.html`(iframe 호스트) + `animations.js`·`promo-scenes.js`(JSX 사전 트랜스파일·IIFE) + `*.jsx` 소스. 로컬 React(`vendor/react*.min.js`)로 오프라인 재생, CDN/Babel 런타임 불필요. 빌드법은 `splash/promo/README.md` |
| `vendor/react.production.min.js` · `vendor/react-dom.production.min.js` | 홍보영상(promo 모드) 전용 로컬 React UMD. 메인 앱(`index.html`)에는 로드되지 않음 — promo iframe 안에서만 사용 |
| `js/main.js` | 앱 진입점 초기화 (상태 복원·렌더 부트스트랩 · 로드 완료 시 `splashMarkDataLoaded()`) |

### Agent v2 품질 검증·자동 최적화 (eval)

`proxy/python/agent/v2/eval/` — 자연어 ERD 에이전트(v2)의 **의도 분석·계획 품질을 측정하고 자동으로 개선**하는 도구입니다.

- **목적**: "v2가 질의를 올바르게 이해·계획하는가"를 사람 눈대중이 아니라 **재현 가능한 점수**로 정의합니다. 픽스처(질의→기대값)를 `analyze→plan`까지만 **dry-run**(실제 ERD/DB 무변경)으로 돌려 채점하고, 이 점수를 잣대로 프롬프트를 자동 수렴시킵니다.
- **기본 사용** (스코어카드 확인):
  ```bash
  cd proxy/python
  python -m agent.v2.eval.runner --reps 5
  ```
- **자동 최적화**: 하드 게이트(`gate.py` — v1 무손상·테스트자산 동결 강제)와 loop-until-pass Workflow로, 새 테스트 케이스를 추가하면 v2 프롬프트를 목표 통과율까지 자동 개선합니다.
- 픽스처 작성 규칙·CLI 옵션·채점 지표·**자동 최적화 단계별 런북**(새 케이스로 재최적화하는 8단계)은 → **[`proxy/python/agent/v2/eval/README.md`](proxy/python/agent/v2/eval/README.md)** 참조.

---

## 26. 전체 파일 구조

```
SimJaeSugn.github.io/
│
├── index.html                     ← 앱 진입점
├── js/                            ← 프론트엔드 JS 모듈 (30개 + v2·v3 각 3개)
│   ├── state.js                   ← 전역 상태
│   ├── canvas.js                  ← 렌더링 엔진
│   ├── entities.js
│   ├── relations.js
│   ├── ui.js
│   ├── explorer.js                ← 좌측 Explorer 패널 (다이어그램·엔티티 목록)
│   ├── bottom_panel.js            ← 하단 패널 (서브탭 · 연결 DB SQL 실행)
│   ├── icons.js                   ← Lucide 아이콘 초기화 (data-lucide → SVG)
│   ├── agent_panel.js             ← v1 에이전트 채팅 UI·스트림/interrupt 루프 (우측 도크 #panelViewAgent — Agent 탭은 제거, v3 플로팅 진입으로 대체·코드는 보존)
│   ├── agent_tools.js             ← Agent 클라이언트 툴(엔티티·관계·레이아웃) + 드래프트 커밋
│   ├── agent_settings.js          ← Agent 설정 모달
│   ├── agent_v2/                  ← v2 격리 채널 (panel_v2 · client_v2 · observe_v2)
│   ├── agent_v3/                  ← v3 격리 채널 (ReAct 하이브리드 — panel_v3 · client_v3 · observe_v3)
│   ├── layout.js
│   ├── export.js
│   ├── import.js
│   ├── diagrams.js
│   ├── timeline.js
│   ├── sql_runner.js
│   ├── std_dict.js                ← 표준사전 관리 (사이드카 /stddict HTTP CRUD·엑셀 업로드)
│   ├── join_explorer.js
│   ├── normalize.js
│   ├── share.js
│   ├── webrtc.js
│   ├── broadcast.js
│   ├── shortcuts.js
│   ├── minimap_worker.js
│   ├── erd_db_store.js            ← DB 저장·공유 다이어그램 (erd-store API, 디바운스 저장, 폴링)
│   ├── pc_store.js                ← PC앱 워크스페이스 영속화 (Ctrl+S 단일 파일 저장+스냅샷)
│   ├── main.js
│   ├── config.js
│   ├── db_connect.js
│   ├── profile_manager.js
│   ├── forward_engineer.js
│   └── reverse_engineer.js
│
├── css/                           ← 스타일시트 (5개)
│   ├── base.css                   ← 변수·리셋·테마
│   ├── components.css
│   ├── modal.css
│   ├── panel.css
│   └── toolbar.css
│
├── vendor/                        ← 로컬 번들 서드파티 (오프라인 동작용, CDN 미사용)
│   ├── lucide.min.js              ← Lucide 아이콘 (ISC)
│   ├── marked.min.js              ← Markdown 파서
│   ├── lz-string.min.js           ← 공유 URL 압축
│   ├── sql-wasm.js                ← sql.js (SQLite WASM 로더)
│   ├── sql-wasm.wasm              ← sql.js WASM 바이너리
│   ├── peerjs.min.js              ← PeerJS (WebRTC P2P)
│   └── std.sqlite                 ← 표준사전 시드 DB (word 4,284 / domain 177 / term 15,368행, ~5.2MB)
│
├── proxy/
│   ├── nodejs/                    ← Node.js 독립 실행형 미들웨어 (포트 3737)
│   │   ├── src/
│   │   │   ├── index.js           ← Express 서버 진입점
│   │   │   ├── db/
│   │   │   │   ├── connector.js
│   │   │   │   └── adapters/      ← mysql / postgres / oracle / mssql
│   │   │   ├── routes/            ← config / execute / health / schema / erd_store (DB 저장·공유)
│   │   │   ├── tray.js            ← 시스템 트레이 아이콘·메뉴
│   │   │   ├── tray_win_bin.js    ← Windows 트레이 헬퍼 바이너리 (base64 내장)
│   │   │   └── utils/             ← crypto / keystore / auditLogger
│   │   └── package.json
│   │
│   └── python/                    ← Python FastAPI 사이드카 (포트 3737, Electron 전용)
│       ├── main.py                ← FastAPI 진입점
│       ├── requirements.txt
│       ├── build.ps1              ← PyInstaller 빌드
│       ├── routers/               ← config / execute / health / schema / erd_store (DB 저장·공유) · agent · stddict (표준사전) · workspace (PC앱 저장) · v2/agent (v2 격리 미러) · v3/agent (v3 ReAct 격리 미러)
│       ├── agent/                 ← LangGraph 에이전트 (graph · nodes / · common / · db_docs · tools_proxy · v2/ · v3/) — 자연어 ERD 제어
│       ├── db/                    ← connector(외부 DB 라우팅) · system_db(내부 시스템 DB aerm_storage) · adapters/(postgres/mysql/mssql/oracle)
│       └── utils/                 ← crypto / keystore / audit_logger
│
├── electron/                      ← Electron 데스크탑 앱 패키저
│   ├── main.js                    ← BrowserWindow·사이드카 프로세스 관리
│   ├── preload.js                 ← 컨텍스트 브릿지 (IPC)
│   ├── package.json               ← electron-builder 설정
│   ├── installer.iss              ← Inno Setup 스크립트 (설치 마법사 + 광고 이미지)
│   └── resources/
│       ├── icon.ico               ← 앱 아이콘
│       ├── ad.bmp(164x314) · ad_small.bmp(55x58) · ad_banner.bmp(600x120)  ← 설치창 광고(좌측대형/우상단/내부페이지 하단배너)
│       └── make_ad.py             ← 광고 이미지 placeholder 생성기
│
├── tools/                         ← 개발 전용 스크립트 (배포 제외)
│   ├── build_std_sqlite.py        ← xlsx → vendor/std.sqlite 변환 (openpyxl 필요)
│   └── promote_v2_to_v1.py        ← Agent v2→v1 승격 자동화 (REPLACE 복사+MERGE 블록치환)
│
└── .github/workflows/pages.yml   ← GitHub Pages 자동 배포
```

---

## 27. 개발환경 설정

### 사전 요구사항

| 도구 | 버전 | 용도 |
|------|------|------|
| Node.js | 18+ | Node.js 미들웨어, Electron 빌드 |
| Python | 3.11+ | FastAPI 사이드카 |
| PyInstaller | 6+ | Python → 단일 exe |
| electron-builder | 24+ | Electron → NSIS 설치파일 (`npm install`로 자동 설치, NSIS 바이너리 자동 다운로드) |
| electron-updater | 6+ | 설치본 인앱 업데이트 — 수동 확인·다운로드·설치 (GitHub Releases, `npm install`로 자동 설치) |
| openpyxl | 3+ | 사이드카 표준사전 엑셀 업로드(`/stddict/import-excel`) 및 시드 재생성(`tools/build_std_sqlite.py`) |

### 프론트엔드

번들러 없이 파일을 직접 수정하면 즉시 반영됩니다.

```powershell
# 방법 1: VS Code Live Server 확장으로 index.html 열기
# 방법 2: Python 내장 서버
python -m http.server 8080
# http://localhost:8080 접속
```

> `file://`로 직접 열어도 대부분 기능 동작. Web Worker(미니맵)는 HTTP 서버 필요.

### 표준사전 시드 재생성 (선택)

`vendor/std.sqlite`가 이미 커밋되어 있으므로 일반 개발에서는 불필요합니다.
엑셀 데이터(`docs/std-all-*.xlsx`)가 변경된 경우에만 아래 명령으로 재생성합니다.

```powershell
# 실행 위치: 프로젝트 루트
pip install openpyxl          # 최초 1회
python tools/build_std_sqlite.py
# → vendor/std.sqlite (갱신)
```

> `tools/build_std_sqlite.py`는 개발 전용 스크립트로, Electron 배포 패키지에 포함되지 않습니다.

### Node.js 미들웨어

```powershell
# 실행 위치: 프로젝트 루트
cd proxy/nodejs
npm install
npm start           # 포트 3737 기동
```

### Python 사이드카

```powershell
# 실행 위치: 프로젝트 루트
cd proxy/python
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 개발 서버 실행
python main.py --port 3737

# 단일 exe 빌드
.\build.ps1         # → proxy\python\dist\uxer-sidecar.exe
```

### Electron 앱

```powershell
# 실행 위치: 프로젝트 루트
cd electron
npm install
npm start           # 개발 모드 실행
```

> 개발 모드에서는 Python 사이드카를 별도 터미널에서 먼저 실행하세요.

---

## 28. 배포 방법

### 1. GitHub Pages (웹 앱)

`main` 브랜치에 push하면 GitHub Actions가 자동 배포합니다.

- 워크플로: `.github/workflows/pages.yml`
- 배포 소스: 저장소 루트 전체 (index.html 루트 위치 필수)
- 배포 URL: `https://<계정>.github.io/<저장소명>/`

**초기 설정:** `Settings` → `Pages` → `Source`: **GitHub Actions** 선택

> **표준사전 관련 배포 참고:**
> - `vendor/std.sqlite` (~5.2MB)는 배포에 포함됩니다 (시드 — 최초/복원 시 시스템 DB `~/.uxermanager/aerm_storage.db`의 표준사전 테이블로 주입됨).
> - 표준사전 CRUD·검색·엑셀 업로드는 Python 사이드카(`/stddict`)가 시스템 DB `aerm_storage`를 직접 소유하므로 **Electron 데스크탑 환경 전용**입니다(github.io 순수 브라우저에서는 사이드카가 없어 동작하지 않음). 이 시스템 DB는 내부 sqlite 기능이 공유하는 고정 DB로 외부 DB 접속 프로파일에 노출되지 않습니다.
> - `tools/build_std_sqlite.py`는 개발 전용 스크립트로 배포에 포함되지 않습니다.
> - `docs/std-all-*.xlsx` 원본 파일도 배포 필요 없습니다.

### 2. Electron 설치파일 (Windows)

> **프록시 포함 단독 실행** — Python 프록시 서버(포트 3737)가 앱에 내장되어 있어 별도 미들웨어 설치 없이 AgenticERM.exe 하나만 실행하면 DB 연결까지 모두 동작합니다.

> **개발·테스트** — 변경사항 확인 시 빌드·재설치 없이 바로 실행 가능합니다.
> ```powershell
> cd electron
> npm start
> ```

> **한 번에 빌드** — 프로젝트 루트에서 아래 스크립트를 실행하면 2단계(사이드카 → Electron/NSIS)가 순서대로 자동 실행됩니다.
> ```powershell
> .\build-desktop.ps1
> # → electron\dist\AgenticERM_Desktop_Setup_{버전}.exe
> ```

> **버전 관리(단일 원천)** — 버전은 `electron/package.json`의 `version` 한 곳에서만 관리합니다.
> electron-builder(NSIS)가 설치파일명·exe 메타데이터·업데이트 메타데이터(`latest.yml`)에 사용하고, 사이드카 `/ping` 버전도 같은 원천에서 자동 파생됩니다.

**1단계 — Python 사이드카 빌드** (실행 위치: `proxy/python/`)

```powershell
cd proxy/python
.\build.ps1
# → proxy\python\dist\uxer-sidecar.exe
```

**2단계 — Electron 앱 + NSIS 설치파일 빌드** (실행 위치: `electron/`)

```powershell
cd electron
npm install
npm run build:win   # electron-builder NSIS (로컬은 --publish never)
# → electron\dist\AgenticERM_Desktop_Setup_{버전}.exe (+ latest.yml · .blockmap)
```

> **패키지 포함 여부:** `electron/package.json`의 `extraFiles`에 `vendor/` 전체가 포함되므로
> `vendor/std.sqlite`는 자동으로 배포 패키지에 포함됩니다. `tools/` 디렉토리는
> `extraFiles` 목록에 없으므로 배포 패키지에서 자동 제외됩니다. electron-updater는
> `dependencies`라 `files`(`node_modules/**/*`)에 따라 app.asar에 자동 번들됩니다.

| 산출물 | 설명 |
|--------|------|
| `proxy/python/dist/uxer-sidecar.exe` | Python 사이드카 (단일 exe) |
| `electron/dist/win-unpacked/` | 압축 해제형 앱 (테스트용) |
| `electron/dist/AgenticERM_Desktop_Setup_{버전}.exe` | NSIS 설치파일 |
| `electron/dist/latest.yml` · `*.blockmap` | electron-updater 자동 업데이트 메타데이터(릴리스에 함께 게시) |

> 설치 시 UAC 관리자 권한 요청이 표시됩니다(`perMachine`). 승인하면 `C:\Program Files\AgenticERM`에 설치되고 바탕화면 바로가기가 생성됩니다.

### 2-1. GitHub Release 자동 배포 + 인앱 업데이트(수동)

`v*` 태그를 push하면 GitHub Actions가 `windows-latest`에서 NSIS 설치파일과 업데이트 메타데이터를 빌드해 Release에 게시합니다. 설치된 앱은 **electron-updater**로 이 릴리스를 감지하되, **자동이 아니라 [도움말 ▸ 소프트웨어 정보] 모달에서 사용자가 수동으로** 확인·다운로드·설치합니다. 버전은 `electron/package.json` 단일 원천을 따르며, 태그가 이 버전과 일치해야 합니다.

- 워크플로: `.github/workflows/release.yml`
- 빌드: 사이드카(`build.ps1`) → Electron NSIS(`npm run release` = `electron-builder --publish always`)
- 게시 자산: `AgenticERM_Desktop_Setup_{버전}.exe` · `latest.yml` · `.blockmap` (publish 설정 `releaseType: "release"` → 즉시 정식 게시)
- 인증: 워크플로의 `GH_TOKEN`(`secrets.GITHUB_TOKEN`)
- 업데이트 동작(**수동·인앱**): 자동 확인/다운로드는 **사용하지 않습니다**(`autoDownload=false`, 시작 시 자동 체크 없음). 사용자가 **[도움말 ▸ 소프트웨어 정보]** 모달에서 "업데이트 확인" → (발견 시) "다운로드"(진행률 실시간 표시) → "재시작하여 설치"를 직접 트리거합니다. 차등(blockmap) 다운로드 지원. (구현: `electron/main.js` IPC `updater:check|download|install`, 렌더러 `js/ui.js` About 모달)

**릴리스 절차:**

```powershell
# 1) electron/package.json 의 version 을 올린다 (예: 1.4.0 → 1.5.0)
# 2) 커밋·푸시
git commit -am "v1.5.0"
git push
# 3) 동일 버전 태그 push → 워크플로 실행
git tag v1.5.0
git push origin v1.5.0
```

> 태그와 `electron/package.json` 버전이 다르면 워크플로가 명시적으로 실패합니다(단일 원천 강제).
> 인앱 업데이트 확인은 **공개 릴리스(draft/prerelease 아님)** 만 감지하므로 `releaseType: "release"`로 게시합니다. 저장소가 공개이므로 클라이언트는 토큰 없이 업데이트를 확인합니다.

### 2-2. 로컬에서 직접 릴리스 (`release-desktop.ps1`)

CI(태그 push)를 거치지 않고 **내 PC에서 빌드해 GitHub Release로 바로 게시**하는 경로입니다. `build-desktop.ps1`(로컬 산출물만, 미게시)에 "게시"를 더한 것으로, 사이드카 빌드 → NSIS 빌드 → `electron-builder --publish always`를 한 번에 실행합니다.

```powershell
# 1) electron/package.json 의 version 을 직접 올린다 (예: "version": "1.6.0")
# 2) 루트에서 실행 (사이드카 빌드 + NSIS 빌드 + GitHub Release 게시)
.\release-desktop.ps1
# → GitHub Release v1.6.0 에 exe·latest.yml·blockmap 게시 → 설치본이 [도움말 ▸ 소프트웨어 정보]에서 수동 업데이트
```

- **게시 토큰**: `GH_TOKEN`(또는 `GITHUB_TOKEN`) 환경변수를 사용합니다. 미설정 시 스크립트가 `gh auth token`(로그인된 gh CLI 토큰, `repo` 권한)을 자동 재활용합니다.
- **태그 불필요**: electron-builder가 `package.json` 버전으로 릴리스(태그 `v<버전>` 포함)를 직접 생성합니다. 다만 저장소와 릴리스 정합을 위해 버전 올린 `package.json`은 커밋·push를 권장합니다.
- CI 경로(`v*` 태그 push → `.github/workflows/release.yml`)와 결과물·동작은 동일하며, **빌드 위치만 내 PC ↔ GitHub 러너**로 다릅니다.

### 3. Node.js 미들웨어 단독 배포

> **웹 서비스용 프록시** — 브라우저에서 AgenticERM 웹 앱(`https://simjaesugn.github.io`)을 사용할 때 운영 DB에 연결하려면 이 미들웨어를 설치해야 합니다. DB에 접근 가능한 로컬 PC 또는 내부 서버에 설치하면 웹 앱과 운영 DB를 중계합니다. Electron 데스크탑 앱 사용자는 Python 사이드카가 자동으로 실행되므로 별도 설치 불필요합니다.

운영 DB에 접근 가능한 서버에 백그라운드 트레이 앱으로 설치됩니다.

**동작 방식:**
- 설치 후 시스템 트레이(우측 하단)에 아이콘으로 상주
- 창 없이 백그라운드 실행 (`start.vbs`로 콘솔 숨김)
- 트레이 아이콘 우클릭 → 포트 확인 / 종료 메뉴

#### 단순 실행파일만 빌드 (실행 위치: `proxy/nodejs/`)

```powershell
cd proxy/nodejs
npm install
npm run build:win     # Windows  → dist/uxermanager.exe
npm run build:linux   # Linux    → dist/uxermanager-linux
npm run build:mac     # macOS    → dist/uxermanager-mac
```

#### 설치파일(.exe) 빌드 — 권장 (실행 위치: `proxy/nodejs/`)

```powershell
cd proxy/nodejs
npm install
npm run build:installer
# → dist/UXERManager_web_proxy_Setup_1.0.0.exe
```

`build:installer`는 내부적으로 다음 두 단계를 순서대로 실행합니다:
1. `npm run build:win` — `@yao-pkg/pkg`로 단일 exe 빌드
2. `node scripts/run-iscc.js` — Inno Setup으로 설치파일 생성

또는 직접 두 단계로 실행할 수도 있습니다:

```powershell
npm run build:win
iscc installer.iss
```

| 산출물 | 설명 |
|--------|------|
| `dist/uxermanager.exe` | 단일 실행파일 (설치 없이 직접 실행) |
| `dist/UXERManager_web_proxy_Setup_1.0.0.exe` | 설치파일 (시작 메뉴 등록 + 자동 실행) |

**설치파일 구성:**

| 파일 | 역할 |
|------|------|
| `uxermanager.exe` | 미들웨어 본체 (포트 3737, 트레이 아이콘) |
| `start.vbs` | 콘솔 창 없이 백그라운드로 실행하는 런처 |

> 설치 후 시작 메뉴 → `UXERManager 시작`을 클릭하면 트레이에 등록됩니다.
> 미들웨어는 내부 네트워크에서만 사용하고 외부 인터넷에 직접 노출하지 마세요.
