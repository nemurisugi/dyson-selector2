// =============================================================
// 状態管理
// =============================================================
let questions        = [];     // questions.json から読み込む
let models           = [];     // models.json から読み込む
let answers          = {};
let currentQ         = 0;
let editingFromResult = false; // 結果画面から特定の質問を編集中かどうか

// =============================================================
// スコアリング
// =============================================================

/**
 * ユーザーの回答をもとに各機種をスコアリングする
 * @param {Object} model
 * @returns {number}
 */
function scoreModel(model) {
  let score = 0;

  // 重さの優先度
  if (answers.weight === "light") {
    if (model.weight <= 1.5)      score += 3;
    else if (model.weight <= 2.2) score += 2;
    else                          score -= 1;
  } else if (answers.weight === "balanced") {
    if (model.weight >= 2.0 && model.weight <= 2.5) score += 2;
    else                                             score += 1;
  } else if (answers.weight === "power") {
    score += model.power;
  }

  // 床の種類
  if (answers.floor === "hard")        score += model.hardFloorScore;
  else if (answers.floor === "carpet") score += model.carpetScore;
  else                                 score += (model.hardFloorScore + model.carpetScore) / 2;

  // ペット
  if (answers.pet === "yes")         score += model.petScore * 1.5;
  else if (answers.pet === "little") score += 0.5;

  // 住まいの広さ
  if (answers.home === "small") {
    score += model.storageScore;
    if (model.weight <= 2.2) score += 1;
  } else if (answers.home === "large") {
    score += model.power;
  } else if (answers.home === "flat") {
    // マンション・フラット：段差が少ないのでコンパクトなモデルが有利
    score += model.storageScore;
  }

  // バッテリー（連続使用時間）
  if (answers.battery === "short") {
    // 30分以内で十分：軽量PencilVac系も十分に対応
    if (model.batteryMin <= 30) score += 2;
  } else if (answers.battery === "medium") {
    // 40〜60分：V8・Digital Slim・V12が有利
    if (model.batteryMin >= 40) score += 2;
    else                        score -= 1;
  } else if (answers.battery === "long") {
    // 60分以上：V12（60分）・Digital Slim（2バッテリーで80分）が有利
    if (model.batteryMin >= 60)      score += 3;
    else if (model.batteryMin >= 40) score += 1;
    else                             score -= 2;
  }

  // 価格への意識
  if (answers.budget === "value") {
    // コスパ重視：安いモデルを強く優遇
    if (model.budgetLevel === "low")  score += 4;
    if (model.budgetLevel === "mid")  score -= 3;
  } else if (answers.budget === "balanced") {
    // バランス：midをやや優遇、lowも許容、highはペナルティなし
    if (model.budgetLevel === "low")  score += 1;
    if (model.budgetLevel === "mid")  score += 3;
  }
  // premium（気にしない）：加点なし・ペナルティなし

  // 最新モデルへのこだわり
  if (answers.newness === "new") {
    const year = model.releaseDate ? parseInt(model.releaseDate) : 2020;
    if (year >= 2025)      score += 4;
    else if (year >= 2024) score += 2;
    else if (year >= 2023) score += 0;
    else                   score -= 2;
  }
  // any（こだわらない）：加点なし

  return score;
}

/**
 * 結果画面に表示する推薦理由テキストを生成する
 * @param {Object} model
 * @returns {string}
 */
function getReasonText(model) {
  const reasons = [];

  if (answers.weight === "light" && model.weight <= 2.2)
    reasons.push(`重量${model.weight}kgと軽量で、長時間の使用でも疲れにくいです`);
  if (answers.weight === "power" && model.power === 3)
    reasons.push("トップクラスの吸引力で、しっかり汚れを吸い取ります");
  if (answers.pet === "yes" && model.petScore >= 2)
    reasons.push("毛絡み防止ツールやペット対応ヘッドが付属しています");
  if (answers.pet === "yes" && model.petScore === 3)
    reasons.push("ペットの毛・アレルゲンに完全対応した専用ツールが揃っています");
  if (answers.floor === "hard" && model.id === "pencilvac_fluffy")
    reasons.push("超スリムなボディで家具の下まで、フローリングを隅々まで掃除できます");
  if (answers.floor === "hard" && model.id === "v12")
    reasons.push("Fluffy Optic™ LEDでフローリングの見えないほこりを可視化して徹底清掃できます");
  if (answers.battery === "long" && model.batteryMin >= 60)
    reasons.push(`最長${model.batteryMin}分の大容量バッテリーで、広い家も一気に掃除できます`);
  if (answers.battery === "medium" && model.batteryMin >= 40)
    reasons.push(`最長${model.batteryMin}分連続使用でき、一通りの掃除を余裕でこなせます`);
  if (answers.home === "small" && model.storageScore === 3)
    reasons.push("コンパクトで省スペースに収納できます");
  if (answers.home === "large" && model.power === 3)
    reasons.push("広い家でも十分なパワーで一気に掃除できます");
  if (model.id === "v12")
    reasons.push("ピエゾセンサーがゴミの量を検知して吸引力を自動調整します");
  if (answers.budget === "value" && model.budgetLevel === "low")
    reasons.push(`¥${parseInt(model.price.replace(/[^0-9]/g, "")).toLocaleString()}とリーズナブルで、コストパフォーマンスに優れています`);
  if (answers.newness === "new" && model.releaseDate && parseInt(model.releaseDate) >= 2025)
    reasons.push(`${model.releaseDate}発売の最新モデルで、ダイソンの最新技術を搭載しています`);

  if (reasons.length === 0)
    reasons.push("あなたの条件に総合的にバランスよくマッチしたモデルです");

  return reasons.join("。") + "。";
}

// =============================================================
// HTML生成ヘルパー
// =============================================================

/**
 * 質問IDと選択値から、選択肢のラベル文字列（アイコン＋タイトル）を返す
 * @param {string} questionId
 * @param {string} value
 * @returns {string}
 */
function getAnswerLabel(questionId, value) {
  const q   = questions.find(q => q.id === questionId);
  const opt = q?.options.find(o => o.value === value);
  return opt ? `${opt.icon} ${opt.title}` : value;
}

/**
 * 結果画面下部に表示する「あなたの回答」サマリーのHTMLを生成する
 * @returns {string}
 */
function buildAnswerSummaryHTML() {
  const rows = questions.map((q, i) => `
    <div class="answer-row">
      <div class="answer-row-left">
        <span class="answer-q-num">${q.num}</span>
        <span class="answer-q-text">${q.text}</span>
      </div>
      <div class="answer-row-right">
        <span class="answer-value">${getAnswerLabel(q.id, answers[q.id])}</span>
        <button class="answer-edit-btn" onclick="editAnswer(${i})">変更</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="answer-summary">
      <div class="answer-summary-title">あなたの回答</div>
      ${rows}
    </div>
  `;
}

/**
 * モデルカードのHTMLを生成する
 * @param {Object} model
 * @param {boolean} isTop - BEST MATCHかどうか
 * @param {number} matchPct - おすすめ度（0〜100）
 * @returns {string}
 */
function buildModelCardHTML(model, isTop, matchPct = 100) {
  const highlightLabels = {
    weight: `軽量 ${model.weight}kg`,
    pet:    "ペット対応",
    power:  "最高吸引力",
    hard:   "フローリング特化",
  };
  const highlightKeywords = {
    weight: "重量", pet: "ペット", power: "吸引", hard: "フローリング",
  };

  const highlightChips = model.highlights
    .map(h => `<span class="spec-chip highlight">${highlightLabels[h] ?? ""}</span>`)
    .join("");

  const normalChips = model.specs
    .filter(spec => !model.highlights.some(h => spec.includes(highlightKeywords[h] ?? "__")))
    .map(spec => `<span class="spec-chip">${spec}</span>`)
    .join("");

  return `
    <div class="model-card ${isTop ? "top-pick" : ""}">
      <div class="model-card-header">
        <div class="model-card-header-left">
          <span class="model-badge ${isTop ? "badge-top" : "badge-also"}">
            ${isTop ? "BEST MATCH" : "こちらも◎"}
          </span>
          <div class="model-name">${model.name}</div>
          <div class="model-meta">
            <span class="model-modelno">${model.modelNo ?? ""}</span>
            ${model.releaseDate ? `<span class="model-release">${model.releaseDate}発売</span>` : ""}
          </div>
          <div class="model-price">${model.price}</div>
        </div>
        ${model.imageUrl ? `<img class="model-image" src="${model.imageUrl}" alt="${model.name}" width="110" height="110" loading="lazy" />` : ""}
      </div>
      <div class="model-card-body">
        <div class="match-bar-row">
          <span class="match-bar-label">おすすめ度</span>
          <div class="match-bar-track">
            <div class="match-bar-fill" style="width:${matchPct}%"></div>
          </div>
          <span class="match-bar-pct">${matchPct}%</span>
        </div>
        <div class="model-reason">${getReasonText(model)}</div>
        <div class="model-specs">${highlightChips}${normalChips}</div>
        <div class="model-links">
          ${model.amazonUrl ? `<a class="btn-amazon" href="${model.amazonUrl}" target="_blank" rel="noopener" aria-label="${model.name}をAmazonで見る（新しいタブ）">Amazonで見る</a>` : ""}
          ${model.url ? `<a class="btn-official" href="${model.url}" target="_blank" rel="noopener" aria-label="${model.name}の公式サイト（新しいタブ）">公式サイト</a>` : ""}
        </div>
      </div>
    </div>
  `;
}

// =============================================================
// 画面描画
// =============================================================

/** プログレスバーと進捗テキストを更新する */
function updateProgress() {
  const total = questions.length;
  const pct   = Math.round((currentQ / total) * 100);

  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressPct").textContent  = pct + "%";
  document.getElementById("progressBar").setAttribute("aria-valuenow", pct);
  document.getElementById("progressText").textContent =
    currentQ < total ? `質問 ${currentQ + 1} / ${total}` : "診断完了";
}

/** 現在の質問カードを描画する */
function renderQuestion() {
  const q    = questions[currentQ];
  const card = document.getElementById("questionCard");

  const optionsHTML = q.options.map(opt => `
    <button class="option-btn" aria-label="${opt.title}" onclick="selectOption('${q.id}', '${opt.value}')">
      <div class="option-icon">${opt.icon}</div>
      <div class="option-content">
        <span class="option-title">${opt.title}</span>
        ${opt.desc ? `<span class="option-desc">${opt.desc}</span>` : ""}
      </div>
    </button>
  `).join("");

  const backHTML = editingFromResult
    ? `<button class="back-btn" onclick="cancelEdit()">← 変更せずに結果に戻る</button>`
    : currentQ > 0
      ? `<button class="back-btn" onclick="goBack()">← 前の質問に戻る</button>`
      : "";

  card.innerHTML = `
    <div class="question-num">${q.num}</div>
    <div class="question-text">${q.text}</div>
    <div class="question-hint">${q.hint}</div>
    <div class="options">${optionsHTML}</div>
    ${backHTML}
  `;
}

/** 診断結果画面を描画する */
function renderResult() {
  const scored = models
    .map(m => ({ model: m, score: scoreModel(m) }))
    .sort((a, b) => b.score - a.score);

  const topScore = Math.max(scored[0].score, 1);
  const toMatchPct = score => Math.min(100, Math.max(10, Math.round((score / topScore) * 100)));

  const top      = scored[0].model;
  const alsoGood = scored.slice(1, 3)
    .filter(s => s.score >= scored[0].score - 3)
    .map(s => ({ model: s.model, pct: toMatchPct(s.score) }));

  document.getElementById("progressBar").style.display = "none";
  document.getElementById("questionCard").innerHTML = `
    <div class="result-header">
      <div class="tag">診断結果</div>
      <h2>あなたへのおすすめはこちらです</h2>
      <p>回答内容をもとにスコアリングしました</p>
    </div>
    ${buildModelCardHTML(top, true, 100)}
    ${alsoGood.map(({ model, pct }) => buildModelCardHTML(model, false, pct)).join("")}
    ${buildAnswerSummaryHTML()}
    <button class="restart-btn" onclick="restart()">もう一度診断する</button>
  `;
}

// =============================================================
// イベントハンドラ
// =============================================================

/** 選択肢が選ばれたときの処理 */
function selectOption(qId, value) {
  answers[qId] = value;
  currentQ++;
  updateProgress();

  // 編集モード中、かつ残りの質問がすべて回答済みなら結果に戻る
  const allRemainingAnswered = questions.slice(currentQ).every(q => answers[q.id] !== undefined);
  if (currentQ >= questions.length || (editingFromResult && allRemainingAnswered)) {
    editingFromResult = false;
    currentQ = questions.length;
    updateProgress();
    renderResult();
  } else {
    renderQuestion();
  }
}

/** 1つ前の質問に戻る */
function goBack() {
  if (currentQ > 0) {
    currentQ--;
    updateProgress();
    renderQuestion();
  }
}

/** 結果画面から特定の質問を編集する */
function editAnswer(index) {
  editingFromResult = true;
  currentQ = index;
  document.getElementById("progressBar").style.display = "";
  updateProgress();
  renderQuestion();
}

/** 編集をキャンセルして結果画面に戻る */
function cancelEdit() {
  editingFromResult = false;
  currentQ = questions.length;
  updateProgress();
  renderResult();
}

/** 最初からやり直す */
function restart() {
  answers           = {};
  currentQ          = 0;
  editingFromResult = false;
  document.getElementById("progressBar").style.display = "";
  updateProgress();
  renderQuestion();
}

// =============================================================
// 初期化 — questions.json と models.json を並行読み込みしてからスタート
// =============================================================

Promise.all([
  fetch("questions.json").then(res => { if (!res.ok) throw new Error(`questions.json: HTTP ${res.status}`); return res.json(); }),
  fetch("models.json").then(res =>    { if (!res.ok) throw new Error(`models.json: HTTP ${res.status}`);    return res.json(); }),
])
  .then(([questionsData, modelsData]) => {
    questions = questionsData;
    models    = modelsData;
    updateProgress();
    renderQuestion();
  })
  .catch(err => {
    console.error("データの読み込みに失敗しました:", err);
    document.getElementById("questionCard").innerHTML = `
      <div style="text-align:center; padding: 40px 0; color: #666;">
        <div style="font-size: 32px; margin-bottom: 16px;">⚠️</div>
        <div style="font-weight: 700; margin-bottom: 8px;">データの読み込みに失敗しました</div>
        <div style="font-size: 13px;">ローカルで開く場合は <code>python -m http.server</code> などでサーバーを起動してください</div>
      </div>
    `;
  });
