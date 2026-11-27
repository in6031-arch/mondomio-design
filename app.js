const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static('public'));

// 파일에서 기존 문의/방명록 데이터 불러오기
function readMemos() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw || '[]');
}

// 파일에 데이터 영구 저장하기
function writeMemos(memos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(memos, null, 2), 'utf-8');
}

// 1. 저장된 글 목록 조회
app.get('/memos', (req, res) => {
  res.json(readMemos());
});

// 2. 새 글 등록 (data.json 파일에 자동 저장)
app.post('/memos', (req, res) => {
  const { username, memo } = req.body;
  const memos = readMemos();
  memos.unshift({
    id: Date.now(),
    username,
    memo,
    time: new Date().toLocaleString('ko-KR')
  });
  writeMemos(memos);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`서버가 켜졌습니다: http://localhost:${PORT}`);
});
