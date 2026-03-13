const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

const state = {
  questions: [],
  exam: {
    started: false,
    finished: false,
    currentQuestionIndex: -1,
    currentQuestionStartAt: null,
    currentQuestionEndAt: null,
  },
  participants: new Map(),
  questionTimers: [],
};

function sanitizeQuestion(question, index) {
  const base = {
    id: question.id || `q-${index + 1}`,
    title: String(question.title || '').trim(),
    type: question.type,
    durationSec: Number(question.durationSec),
  };

  if (!base.title) {
    throw new Error(`第 ${index + 1} 题题干不能为空`);
  }

  if (!['truefalse', 'single'].includes(base.type)) {
    throw new Error(`第 ${index + 1} 题类型错误`);
  }

  if (!Number.isFinite(base.durationSec) || base.durationSec < 10 || base.durationSec > 30) {
    throw new Error(`第 ${index + 1} 题限时必须在 10-30 秒`);
  }

  if (base.type === 'truefalse') {
    base.options = ['正确', '错误'];
    base.correctAnswer = question.correctAnswer;
    if (!['正确', '错误'].includes(base.correctAnswer)) {
      throw new Error(`第 ${index + 1} 题判断题答案必须是“正确”或“错误”`);
    }
  } else {
    const options = Array.isArray(question.options)
      ? question.options.map((v) => String(v || '').trim()).filter(Boolean)
      : [];

    if (options.length < 2 || options.length > 6) {
      throw new Error(`第 ${index + 1} 题选择题选项数量需在 2-6 个`);
    }

    if (!options.includes(question.correctAnswer)) {
      throw new Error(`第 ${index + 1} 题正确答案必须在选项中`);
    }

    base.options = options;
    base.correctAnswer = question.correctAnswer;
  }

  return base;
}

function publicQuestion(question) {
  return {
    id: question.id,
    title: question.title,
    type: question.type,
    options: question.options,
    durationSec: question.durationSec,
  };
}

function resetExamProgress() {
  state.exam.started = false;
  state.exam.finished = false;
  state.exam.currentQuestionIndex = -1;
  state.exam.currentQuestionStartAt = null;
  state.exam.currentQuestionEndAt = null;
  state.participants.clear();
  state.questionTimers.forEach((timer) => clearTimeout(timer));
  state.questionTimers = [];
}

function emitExamState() {
  const current = state.questions[state.exam.currentQuestionIndex] || null;
  io.emit('exam_state', {
    started: state.exam.started,
    finished: state.exam.finished,
    currentQuestionIndex: state.exam.currentQuestionIndex,
    currentQuestion: current ? publicQuestion(current) : null,
    questionStartAt: state.exam.currentQuestionStartAt,
    questionEndAt: state.exam.currentQuestionEndAt,
    totalQuestions: state.questions.length,
  });
}

function scheduleQuestion(index) {
  if (index >= state.questions.length) {
    state.exam.finished = true;
    state.exam.currentQuestionIndex = -1;
    state.exam.currentQuestionStartAt = null;
    state.exam.currentQuestionEndAt = null;
    emitExamState();
    io.emit('exam_finished');
    return;
  }

  const question = state.questions[index];
  const now = Date.now();

  state.exam.currentQuestionIndex = index;
  state.exam.currentQuestionStartAt = now;
  state.exam.currentQuestionEndAt = now + question.durationSec * 1000;

  emitExamState();

  const timer = setTimeout(() => scheduleQuestion(index + 1), question.durationSec * 1000);
  state.questionTimers.push(timer);
}

app.get('/api/state', (_req, res) => {
  const current = state.questions[state.exam.currentQuestionIndex] || null;
  res.json({
    questionsCount: state.questions.length,
    started: state.exam.started,
    finished: state.exam.finished,
    currentQuestionIndex: state.exam.currentQuestionIndex,
    currentQuestion: current ? publicQuestion(current) : null,
    questionStartAt: state.exam.currentQuestionStartAt,
    questionEndAt: state.exam.currentQuestionEndAt,
  });
});

app.post('/api/questions', (req, res) => {
  if (state.exam.started && !state.exam.finished) {
    return res.status(400).json({ message: '考试进行中，不能修改题目' });
  }

  const rawQuestions = req.body.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return res.status(400).json({ message: '请至少提交 1 道题' });
  }

  try {
    const sanitized = rawQuestions.map((q, idx) => sanitizeQuestion(q, idx));
    resetExamProgress();
    state.questions = sanitized;
    io.emit('questions_updated', { count: state.questions.length });
    return res.json({ message: '题目已保存', count: state.questions.length });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post('/api/exam/start', (_req, res) => {
  if (state.questions.length === 0) {
    return res.status(400).json({ message: '请先在出题页设置题目' });
  }

  resetExamProgress();
  state.exam.started = true;
  state.exam.finished = false;

  scheduleQuestion(0);
  return res.json({ message: '考试已开始' });
});

app.post('/api/submit', (req, res) => {
  const { participantName, questionId, answer } = req.body;

  if (!state.exam.started || state.exam.finished) {
    return res.status(400).json({ message: '当前不在答题时间内' });
  }

  const trimmedName = String(participantName || '').trim();
  if (!trimmedName) {
    return res.status(400).json({ message: '请填写姓名' });
  }

  const activeQuestion = state.questions[state.exam.currentQuestionIndex];
  if (!activeQuestion || activeQuestion.id !== questionId) {
    return res.status(400).json({ message: '题目已切换，请按当前题作答' });
  }

  if (!activeQuestion.options.includes(answer)) {
    return res.status(400).json({ message: '答案无效' });
  }

  const key = trimmedName.toLowerCase();
  if (!state.participants.has(key)) {
    state.participants.set(key, {
      name: trimmedName,
      answers: {},
      submitAt: Date.now(),
    });
  }

  const participant = state.participants.get(key);
  participant.name = trimmedName;
  participant.answers[questionId] = answer;
  participant.submitAt = Date.now();

  return res.json({ message: '提交成功' });
});

app.get('/api/stats', (_req, res) => {
  const stats = Array.from(state.participants.values()).map((participant) => {
    let score = 0;

    state.questions.forEach((q) => {
      if (participant.answers[q.id] && participant.answers[q.id] === q.correctAnswer) {
        score += 1;
      }
    });

    return {
      name: participant.name,
      score,
      total: state.questions.length,
      accuracy: state.questions.length > 0 ? `${Math.round((score / state.questions.length) * 100)}%` : '0%',
      answers: participant.answers,
    };
  });

  stats.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  res.json({
    started: state.exam.started,
    finished: state.exam.finished,
    questionsCount: state.questions.length,
    participantsCount: stats.length,
    ranking: stats,
  });
});

io.on('connection', (socket) => {
  socket.emit('connected', { ok: true });
  emitExamState();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`在线考试服务已启动: http://localhost:${PORT}`);
});
