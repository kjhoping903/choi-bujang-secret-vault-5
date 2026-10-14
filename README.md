# choi-bujang-secret-vault-5

## 6단계 판정기

초기 커밋에는 판정기 파일이 없어 격리 환경에서 실행할 수 없었습니다.
`src/decider.mjs`는 엔진이 로그인과 사용자·기기 연결을 확인한 요청만 받습니다.
`deviceRegistered === true`이고 유효한 주체·기기 ID가 있으며,
notes 서비스의 GET /notes 또는 GET /notes/:id 경로일 때만 허용합니다.
미등록·등록 값 누락·문자열 등록 값·쓰기·다른 경로는 거부합니다.
응답 5개 항목과 decide(request) 계약은 docs/DECIDER_REQUEST.md를 따릅니다.
RULE_IDS에는 구현한 device_registered와 notes_read_scope만 기록합니다.

Node.js 22 이상에서 저장소 폴더의 터미널로 `npm run decider:test`를 실행합니다.
PowerShell 실행 정책이 npm을 막으면 `npm.cmd run decider:test`를 사용합니다.
의존성 설치는 필요하지 않습니다. 화면에서 누를 시험 버튼은 없습니다.
정상 결과는 등록 기기의 목록·단건 읽기 allow이며, 거부 결과는 미등록 및 허용 범위 밖 요청 deny입니다.
시험은 가상 요청 연습이며 실제 엔진 연결이나 심판 통과를 증명하지 않습니다.
웹앱은 public/, 인증·자료 API는 api/에 복원했습니다. Vercel은 vercel.json의
`npm run build`로 public/을 배포합니다. aleph.config.json의 repoUrl은 이 저장소에 맞췄고,
기존 로그인 발급자·허용 경로·원본 API 주소·judgeIssuer를 보존했습니다.
로컬 확인은 `npm ci` 후 `npm run build -- --local`, 웹 시험은 `npm run test:web`입니다.
Vercel의 Deployments에서 새 커밋 배포를 연 뒤 Visit을 누르고 서버 상태 확인을 누릅니다.
정상 결과는 자료실 로그인 화면과 서버 상태 정상 표시입니다. 비로그인 /api/notes 요청은 401이어야 합니다.
로그인과 DB는 기존 Vercel 환경변수 설정이 필요합니다. 서버 전용 키는 공식 설정 화면의
비밀 입력란에 직접 입력하며 Git에 넣지 않습니다. 실제 배포 화면·DB 접속은 별도로 확인해야 합니다.
운영 측 judgeIssuer를 생성하거나 변경하지 않습니다.
