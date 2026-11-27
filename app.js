require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mondomio1234';
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function parseMemoRow(raw) {
  const str = String(raw || '');
  const prefix = '[[META:';
  const suffix = ']]';
  if (str.startsWith(prefix)) {
    const endIdx = str.indexOf(suffix);
    if (endIdx > prefix.length) {
      try {
        const jsonPart = str.slice(prefix.length, endIdx);
        const textPart = str.slice(endIdx + suffix.length);
        const meta = JSON.parse(jsonPart);
        return {
          completed: Boolean(meta.completed),
          secret: Boolean(meta.secret),
          pw: meta.pw || '',
          img: meta.img || '',
          text: textPart,
        };
      } catch (e) {}
    }
  }
  const legacyCompleted = str.startsWith('[상담완료] ');
  return {
    completed: legacyCompleted,
    secret: false,
    pw: '',
    img: '',
    text: legacyCompleted ? str.replace(/^\[상담완료\]\s*/, '') : str,
  };
}

function buildMemoRaw({ completed, secret, pw, img, text }) {
  const meta = {
    completed: Boolean(completed),
    secret: Boolean(secret),
    pw: secret ? String(pw || '') : '',
    img: img || '',
  };
  return `[[META:${JSON.stringify(meta)}]]${text}`;
}

app.post('/admin/verify', (req, res) => {
  const inputPassword = req.headers['x-admin-password'];
  if (!inputPassword || inputPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: '관리자 비밀번호가 일치하지 않습니다.' });
  }
  res.json({ success: true });
});

app.get('/memos', async (req, res) => {
  try {
    const adminPw = req.headers['x-admin-password'];
    const isAdmin = Boolean(adminPw && adminPw === ADMIN_PASSWORD);

    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;

    const formatted = data.map((row) => {
      const parsed = parseMemoRow(row.memo);
      const canView = !parsed.secret || isAdmin;

      return {
        id: row.id,
        username: row.username,
        completed: parsed.completed,
        secret: parsed.secret,
        hasImage: Boolean(parsed.img),
        memo: canView ? parsed.text : '🔒 비밀글입니다. 작성자 비밀번호 또는 관리자 인증 후 열람할 수 있습니다.',
        img: canView ? parsed.img : '',
        unlocked: canView,
        time: row.created_at
          ? new Date(row.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
          : '',
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: '데이터를 불러오는 중 오류가 발생했습니다.' });
  }
});
app.post('/memos', async (req, res) => {
  try {
    const { username, memo, isSecret, postPassword, imageData } = req.body;

    if (!username || !memo) {
      return res.status(400).json({ error: '성함과 문의 내용을 모두 입력해 주세요.' });
    }
    if (isSecret && (!postPassword || String(postPassword).trim().length < 4)) {
      return res.status(400).json({ error: '비밀글 설정 시 4자리 이상의 비밀번호를 입력해 주세요.' });
    }
    if (imageData && !String(imageData).startsWith('data:image/')) {
      return res.status(400).json({ error: '첨부 파일 오류: 올바른 이미지 형식(JPG, PNG, WEBP)만 첨부 가능합니다.' });
    }

    const packedMemo = buildMemoRaw({
      completed: false,
      secret: Boolean(isSecret),
      pw: isSecret ? String(postPassword).trim() : '',
      img: imageData || '',
      text: String(memo).trim(),
    });

    const { data, error } = await supabase
      .from('memos')
      .insert({ username: String(username).trim(), memo: packedMemo })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ id: data.id, success: true });
  } catch (err) {
    res.status(500).json({ error: '등록 중 서버 오류가 발생했습니다: ' + err.message });
  }
});

app.post('/memos/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const adminPw = req.headers['x-admin-password'];

    const { data: row, error } = await supabase
      .from('memos')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;

    const parsed = parseMemoRow(row.memo);
    const isAdmin = Boolean(adminPw && adminPw === ADMIN_PASSWORD);
    const isAuthor = Boolean(password && parsed.pw && String(password).trim() === parsed.pw);

    if (!isAdmin && !isAuthor) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }

    res.json({
      success: true,
      id: row.id,
      username: row.username,
      memo: parsed.text,
      img: parsed.img,
      completed: parsed.completed,
      secret: parsed.secret,
    });
  } catch (err) {
    res.status(500).json({ error: '비밀글 인증 중 오류가 발생했습니다.' });
  }
});

app.put('/memos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password, memo, imageData, removeImage } = req.body;
    const adminPw = req.headers['x-admin-password'];

    if (!memo || !String(memo).trim()) {
      return res.status(400).json({ error: '수정할 내용을 입력해 주세요.' });
    }

    const { data: row, error: fetchErr } = await supabase
      .from('memos')
      .select('memo')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const parsed = parseMemoRow(row.memo);
    const isAdmin = Boolean(adminPw && adminPw === ADMIN_PASSWORD);
    const isAuthor = Boolean(password && parsed.pw && String(password).trim() === parsed.pw);

    if (!isAdmin && !isAuthor) {
      return res.status(401).json({ error: '수정 권한이 없습니다. 글 비밀번호를 확인해 주세요.' });
    }

    let nextImg = parsed.img;
    if (removeImage) {
      nextImg = '';
    } else if (imageData) {
      if (!String(imageData).startsWith('data:image/')) {
        return res.status(400).json({ error: '첨부 파일 오류: 이미지 형식만 가능합니다.' });
      }
      nextImg = imageData;
    }

    const updatedRaw = buildMemoRaw({
      completed: parsed.completed,
      secret: parsed.secret,
      pw: parsed.pw,
      img: nextImg,
      text: String(memo).trim(),
    });

    const { error: updateErr } = await supabase
      .from('memos')
      .update({ memo: updatedRaw })
      .eq('id', id);
    if (updateErr) throw updateErr;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '글 수정 중 오류가 발생했습니다.' });
  }
});

app.patch('/memos/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const inputPassword = req.headers['x-admin-password'];
    if (!inputPassword || inputPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: '관리자 비밀번호가 일치하지 않습니다.' });
    }

    const { data: row, error: fetchErr } = await supabase
      .from('memos')
      .select('memo')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    const parsed = parseMemoRow(row.memo);
    const updatedRaw = buildMemoRaw({
      ...parsed,
      completed: !parsed.completed,
    });

    const { error: updateErr } = await supabase
      .from('memos')
      .update({ memo: updatedRaw })
      .eq('id', id);
    if (updateErr) throw updateErr;

    res.json({ success: true, completed: !parsed.completed });
  } catch (err) {
    res.status(500).json({ error: '상태 변경 중 오류가 발생했습니다.' });
  }
});

app.delete('/memos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const inputPassword = req.headers['x-admin-password'];
    if (!inputPassword || inputPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: '관리자 비밀번호가 일치하지 않습니다.' });
    }
    const { error } = await supabase.from('memos').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
