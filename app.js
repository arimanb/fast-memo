const STORAGE_KEY = 'fast-memo-notes';

const noteText = document.getElementById('noteText');
const statusEl = document.getElementById('status');
const micBtn = document.getElementById('micBtn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const listToggleBtn = document.getElementById('listToggleBtn');
const newNoteBtn = document.getElementById('newNoteBtn');
const editorView = document.getElementById('editorView');
const listView = document.getElementById('listView');
const noteList = document.getElementById('noteList');

let currentNoteId = null;
let isRecording = false;
let shouldKeepListening = false;
let baseText = '';

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function setStatus(text) {
  statusEl.textContent = text;
}

function showEditor() {
  editorView.hidden = false;
  listView.hidden = true;
}

function showList() {
  renderNoteList();
  editorView.hidden = true;
  listView.hidden = false;
}

function renderNoteList() {
  const notes = loadNotes().sort((a, b) => b.updatedAt - a.updatedAt);
  noteList.innerHTML = '';

  if (notes.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.textContent = 'メモがまだありません';
    noteList.appendChild(hint);
    return;
  }

  for (const note of notes) {
    const li = document.createElement('li');
    li.className = 'note-item';

    const preview = document.createElement('div');
    preview.className = 'note-preview';
    preview.textContent = note.text.slice(0, 40) || '(空のメモ)';

    const meta = document.createElement('div');
    meta.className = 'note-meta';

    const date = document.createElement('span');
    date.className = 'note-date';
    date.textContent = new Date(note.updatedAt).toLocaleString('ja-JP');

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const remaining = loadNotes().filter((n) => n.id !== note.id);
      saveNotes(remaining);
      renderNoteList();
    });

    meta.appendChild(date);
    meta.appendChild(delBtn);
    li.appendChild(preview);
    li.appendChild(meta);

    li.addEventListener('click', () => {
      currentNoteId = note.id;
      noteText.value = note.text;
      showEditor();
    });

    noteList.appendChild(li);
  }
}

function saveCurrentNote() {
  const text = noteText.value.trim();
  if (!text) return;

  const notes = loadNotes();
  const now = Date.now();

  if (currentNoteId) {
    const idx = notes.findIndex((n) => n.id === currentNoteId);
    if (idx !== -1) {
      notes[idx].text = text;
      notes[idx].updatedAt = now;
      saveNotes(notes);
      setStatus('保存しました');
      return;
    }
  }

  const newNote = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, text, updatedAt: now };
  notes.push(newNote);
  saveNotes(notes);
  currentNoteId = newNote.id;
  setStatus('保存しました');
}

clearBtn.addEventListener('click', () => {
  noteText.value = '';
  currentNoteId = null;
  setStatus('待機中');
});

saveBtn.addEventListener('click', saveCurrentNote);

listToggleBtn.addEventListener('click', showList);

newNoteBtn.addEventListener('click', () => {
  noteText.value = '';
  currentNoteId = null;
  showEditor();
  setStatus('待機中');
});

// --- 音声認識 ---

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let restartTimer = null;

if (SpeechRecognitionImpl) {
  recognition = new SpeechRecognitionImpl();
  recognition.lang = 'ja-JP';
  // continuous:false だと発話ごとにOSの開始音が鳴ってしまうため、
  // continuous:true で長時間の認識を維持しつつ、
  // 予期せず停止した場合のみ自動リスタートする。
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '';
    let finalChunk = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalChunk += transcript;
      } else {
        interim += transcript;
      }
    }

    if (finalChunk) {
      baseText += finalChunk;
    }

    noteText.value = baseText + interim;
    noteText.scrollTop = noteText.scrollHeight;
  };

  recognition.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    setStatus(`エラー: ${event.error}`);
  };

  recognition.onend = () => {
    if (shouldKeepListening) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        if (!shouldKeepListening) return;
        try {
          recognition.start();
        } catch {
          // すでに開始中の場合は無視
        }
      }, 200);
    } else {
      isRecording = false;
      micBtn.classList.remove('recording');
      setStatus('待機中');
    }
  };

  micBtn.addEventListener('click', () => {
    if (!isRecording) {
      baseText = noteText.value;
      shouldKeepListening = true;
      isRecording = true;
      micBtn.classList.add('recording');
      setStatus('聞き取り中…');
      try {
        recognition.start();
      } catch {
        // 既に開始している場合は無視
      }
    } else {
      shouldKeepListening = false;
      clearTimeout(restartTimer);
      recognition.stop();
      setStatus('待機中');
    }
  });
} else {
  micBtn.disabled = true;
  setStatus('この端末・ブラウザは音声入力に対応していません');
}

// --- PWA登録 ---

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

showEditor();
