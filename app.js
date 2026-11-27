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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. 문의·방명록 전체 조회 (최신순)
app.get('/memos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('memos')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    const formatted = data.map((row) => ({
      id: row.id,
      username: row.username,
      memo: row.memo,
      time: row.created_at
        ? new Date(row.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        : '',
    }));

    res.json(formatted);
  } catch (err) {
    console.error('GET /memos 오류:', err.message);
    res.status(500).json({ error: '데이터를 불러오는 중 오류가 발생했습니다.' });
  }
});

// 2. 새 문의·방명록 등록 (.single() 사용으로 단일 객체 반환)
app.post('/memos', async (req, res) => {
  try {
    const { username, memo } = req.body;
    if (!username || !memo) {
      return res.status(400).json({ error: '이름과 내용을 모두 입력해 주세요.' });
    }

    const { data, error } = await supabase
      .from('memos')
      .insert({ username, memo })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: data.id,
      username: data.username,
      memo: data.memo,
      time: data.created_at
        ? new Date(data.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
        : '',
    });
  } catch (err) {
    console.error('POST /memos 오류:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. 관리자 비밀번호 인증 후 문의·방명록 삭제
app.delete('/memos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const inputPassword = req.headers['x-admin-password'];

    if (!inputPassword || inputPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: '관리자 비밀번호가 일치하지 않습니다.' });
    }

    const { error } = await supabase
      .from('memos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: '정상적으로 삭제되었습니다.' });
  } catch (err) {
    console.error('DELETE /memos 오류:', err.message);
    res.status(500).json({ error: '데이터를 삭제하는 중 오류가 발생했습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
