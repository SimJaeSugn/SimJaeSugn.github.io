# proxy/python/agent/v2/eval/__init__.py
#
# v2 검증 오라클 패키지 마커.
# 저장소 컨벤션상 모든 __init__.py 는 .gitignore(**/__init__.py)로 미추적이며,
# 다른 v2 서브패키지(nodes·common)와 동일하게 내용 없는 마커로 둔다.
#
# 사용처는 모두 서브모듈을 직접 import 한다 (패키지 레벨 재export에 의존하지 않음):
#   from agent.v2.eval.runner import run_fixtures, DEFAULT_FIXTURES
#   from agent.v2.eval.scorer import score_case, aggregate
