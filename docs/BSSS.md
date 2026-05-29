# BSSS

## 프롬프트 (TB_PRMPT)
> 사용자 정의 프롬프트

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 사용자프롬프트일련번호 | USER_PRMPT_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 사용자ID | USER_ID | VARCHAR(50) | FK | ✓ |  |  |  |
| 프롬프트일련번호 | PRMPT_SN | INTEGER | FK | ✓ |  |  | 프롬프트중 사용자가 재정의한 프롬프트의 일련번호 |
| 프롬프트내용 | PRMPT_CN | TEXT |  | ✓ |  |  | 프롬프트내용 |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 벡터DB설정 (TB_VCTR_CFG)
> 사용자별 벡터DB설정

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 백터설정일련번호 | VCTR_CFG_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 사용자ID | USER_ID | VARCHAR(50) | FK | ✓ |  |  |  |
| 호스트IP주소 | HST_IP_ADDR | VARCHAR(20) |  | ✓ |  | 0.0.0.1 |  |
| 서버포트번호 | SRVR_PORT_NO | INTEGER |  | ✓ |  |  |  |
| 컬렉션명 |  | VARCHAR(100) |  |  |  |  |  |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 공통프롬프트 (TB_CMM_PRMPT)
> 서비스가 공통으로 제공하는 프롬프트

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 프롬프트일련번호 | PRMPT_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 프롬프트명 | PRMPT_NM | VARCHAR(100) |  | ✓ |  | 기본 프롬프트명 | 예) 응답생성 LLM 시스템 프롬프트 |
| 프롬프트내용 | PRMPT_CN | TEXT |  | ✓ |  |  |  |
| 사용여부 | USE_YN | CHAR(1) |  | ✓ |  | N | Y,N |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## API키정보 (TB_API_KEY)
> API 키 관리

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| API키일련번호 | APIKEY_SN | INTEGER | PK | ✓ | ✓ |  | API키일련번호 |
| 밴더일련번호 | VNDR_SN | INTEGER | FK | ✓ |  |  |  |
| 사용자ID | USER_ID | VARCHAR(50) | FK | ✓ |  |  |  |
| 키유형코드 | KEY_TYPE_CD | VARCHAR(10) |  | ✓ |  |  | KEY,ORG,ETC |
| API키값 | API_KEY_VAL | VARCHAR(255) |  | ✓ |  |  | 암호화 저장 |
| 활성여부 | ACTVTN_YN | CHAR(1) |  | ✓ |  | N | Y,N ( USER_ID , VNDR_ID 별로 하나만 활성화 가능 ) |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 사용자별활성모델 (TB_ACTV_MDL)
> 사용자가 선택한 활성 모델

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 활성모델일련번호 | ACTV_MDL_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 모델일련번호 | MDL_SN | INTEGER | FK | ✓ |  |  |  |
| 사용자ID | TB_USER_ID | VARCHAR(50) | FK | ✓ |  |  | 사용자 참조 |
| 모델유형코드 | MDL_TYPE_CD | VARCHAR(100) |  | ✓ |  | LLM | 모델 유형코드 ( LLM / EMBEDDING ) |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 공통모델 (TB_CMM_MDL)
> AI 모델 정보

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 모델일련번호 | MDL_SN | INTEGER | PK | ✓ | ✓ |  | 모델일련번호 |
| 밴더일련번호 | VNDR_SN | INTEGER | FK | ✓ |  |  | 밴더아이디 |
| 모델명 | MDL_NM | VARCHAR(100) |  | ✓ |  |  | 모델명 (표시용) |
| 모델코드 | MDL_CD | VARCHAR(100) |  | ✓ |  |  | API 호출 코드 (예: gpt-4.1-mini) |
| 모델유형코드 | MDL_TYPE_CD | VARCHAR(100) |  | ✓ |  | LLM | 모델 유형코드 ( LLM / EMBEDDING ) |
| 설명 | EXPLN | TEXT |  |  |  |  | 모델 설명 |
| 사용여부 | USE_YN | CHAR(1) |  | ✓ |  | Y | 사용여부 Y,N |
| 연결유형코드 | LNKG_TYPE_CD | VARCHAR(20) |  | ✓ |  | 외부API | 로컬 , 외부API |
| 지원언어코드 | SPRT_LANG_CD | VARCHAR(20) |  | ✓ |  | 다국어 | 다국어 , 한국어 |
| 벡터차원수 | VCTR_DIM_CNT | INTEGER |  | ✓ |  | 1024 | 768 , 512 , 1024 등 벡터 차원수 |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  | 등록일시 |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  | 수정일시 |

## 에이전트설정 (TB_AIAGT_CFG)
> RAG 에이전트 검색 설정

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 에이전트설정순번 | AIAGT_CFG_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 사용자ID | USER_ID | VARCHAR(50) | FK | ✓ |  |  |  |
| 청크토큰수 | CHUNK_TKN_CNT | INTEGER |  | ✓ |  | 500 | 검색 후보 수 |
| 청크오버랩 | CHUNK_OVLP | INTEGER |  | ✓ |  | 100 | 리랭킹 결과 수 |
| 최소청크크기 | MIN_CHUNK_SZ | INTEGER |  | ✓ |  | 50 | 이 값 미만의 청크는 인접 청크에 병합. |
| 리랭킹여부 | RERNK_YN | CHAR(1) |  | ✓ |  | Y | 리랭커 적용 여부 |
| 유사도임계값 | SIML_THRS_VL | NUMERIC |  | ✓ |  | 0.5 | 유사도 검색시 Threshold 값 (0.0~1.0) |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 공통벡터DB설정 (TB_CMM_VCTR_CFG)
> 유시스 공통 벡터DB설정

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 백터설정일련번호 | VCTR_CFG_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 호스트IP주소 | HST_IP_ADDR | VARCHAR(20) |  | ✓ |  | 0.0.0.1 |  |
| 서버포트번호 | SRVR_PORT_NO | INTEGER |  | ✓ |  |  |  |
| 컬렉션명 |  | VARCHAR(100) |  |  |  |  |  |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 하이퍼파라미터 (TB_HYPR_PRMTR)
> LLM 파라미터 설정

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 파라미터일련번호 | PRMTR_SN | INTEGER | PK | ✓ | ✓ |  |  |
| 사용자ID | USER_ID | VARCHAR(50) | FK | ✓ | ✓ |  |  |
| 온도 | TEMP | NUMERIC |  | ✓ |  | 1 | 0~2 |
| Top-P | TOP_P | INTEGER |  | ✓ |  | 0 | 0~1 |
| Top-K | TOP_K | INTEGER |  | ✓ |  | 20 | 0~2 |
| 최대토큰 | MAX_TKN | INTEGER |  | ✓ |  | 500 |  |
| 제한컨텍스트수 | LMT_CTX_CNT | INTEGER |  | ✓ |  | 10 | LLM에 전달할 최근 턴수 |
| 타임아웃분 | TMOUT_MI | INTEGER |  | ✓ |  | 30 | 분단위 |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 공통밴더 (TB_CNN_VNDR)
> 밴더 정보

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 밴더일련번호 | VNDR_SN | INTEGER | PK | ✓ | ✓ |  | 밴더 고유 식별자 |
| 밴더명 | VNDR_NM | VARCHAR(100) |  | ✓ |  |  | AI 모델 제공자 명칭 |
| 설명 | EXPLN | TEXT |  |  |  |  |  |
| 사용여부 | USE_YN | CHAR(1) |  | ✓ |  | Y | Y/N |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

## 사용자 (TB_USER)
> 시스템 사용자 계정

| 논리명 | 물리명 | 타입 | 종류 | NN | UQ | 기본값 | 설명 |
|--------|--------|------|------|:--:|:--:|--------|------|
| 사용자ID | USER_ID | VARCHAR(50) | PK | ✓ | ✓ |  |  |
| 사용자명 | USER_NM | VARCHAR(100) |  | ✓ |  | USER |  |
| 비밀번호 | PSWD | VARCHAR(255) |  | ✓ |  |  | 해시 저장 |
| 사용여부 | USE_YN | CHAR(1) |  | ✓ |  | Y |  |
| 등록일시 | REG_DT | TIMESTAMP |  |  |  |  |  |
| 수정일시 | MDF_DT | TIMESTAMP |  |  |  |  |  |

**인덱스**

| 인덱스명 | 컬럼 | UNIQUE |
|----------|------|:------:|
| TB_USER_INDEX | USER_ID |  |
