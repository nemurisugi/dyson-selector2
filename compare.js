// =============================================================
// データ
// =============================================================
let models = [];

// =============================================================
// ユーティリティ
// =============================================================

/** スコア数値（1〜3）を●○○形式の文字列に変換する */
function scoreToCircles(n) {
  const filled = "●".repeat(n);
  const empty  = "○".repeat(3 - n);
  return `<span class="compare-score">${filled}${empty}</span>`;
}

/** 画面幅に応じた表示列数を返す */
function getColCount() {
  if (window.innerWidth >= 768) return 4;
  if (window.innerWidth >= 480) return 3;
  return 2;
}

// =============================================================
// 比較行の定義
// =============================================================
const rows = [
  { label: "価格",           fn: m => m.price },
  { label: "重量",           fn: m => `${m.weight}kg` },
  { label: "バッテリー",     fn: m => `最長${m.batteryMin}分` },
  { label: "吸引力",         fn: m => scoreToCircles(m.power) },
  { label: "ペット対応",     fn: m => scoreToCircles(m.petScore) },
  { label: "フローリング",   fn: m => scoreToCircles(m.hardFloorScore) },
  { label: "カーペット",     fn: m => scoreToCircles(m.carpetScore) },
  { label: "収納のしやすさ", fn: m => scoreToCircles(m.storageScore) },
  { label: "発売日",         fn: m => m.releaseDate ?? "—" },
];

// =============================================================
// HTML生成
// =============================================================

/**
 * 比較テーブル全体のHTML生成
 * ドロップダウンは thead の行として組み込み、列の幅を自動的に揃える
 * @param {string[]} selectedIds - 選択中のモデルIDの配列
 */
function buildTableHTML(selectedIds) {
  const selectedModels = selectedIds.map(id => models.find(m => m.id === id) ?? models[0]);

  // ドロップダウン行（thead）
  const selectCells = selectedIds.map((selectedId, i) => `
    <th class="compare-select-cell">
      <select class="compare-selector" onchange="onSelectChange()" id="sel-${i}">
        ${models.map(m =>
          `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${m.name}</option>`
        ).join("")}
      </select>
    </th>
  `).join("");

  // 画像行
  const imageRow = `
    <tr class="image-row">
      <td class="row-label"></td>
      ${selectedModels.map(m => `
        <td>
          ${m.imageUrl
            ? `<img class="compare-image" src="${m.imageUrl}" alt="${m.name}" width="80" height="80" loading="lazy" />`
            : ""}
          <div class="compare-modelno">${m.modelNo ?? ""}</div>
        </td>
      `).join("")}
    </tr>
  `;

  // スペック行
  const specRows = rows.map(row => `
    <tr>
      <td class="row-label">${row.label}</td>
      ${selectedModels.map(m => `<td>${row.fn(m)}</td>`).join("")}
    </tr>
  `).join("");

  // リンク行
  const linkRow = `
    <tr>
      <td class="row-label">購入リンク</td>
      ${selectedModels.map(m => `
        <td>
          <div class="compare-links">
            ${m.amazonUrl ? `<a class="btn-amazon compare-btn" href="${m.amazonUrl}" target="_blank" rel="noopener" aria-label="${m.name}をAmazonで見る（新しいタブ）">Amazon</a>` : ""}
            ${m.url ? `<a class="btn-official compare-btn" href="${m.url}" target="_blank" rel="noopener" aria-label="${m.name}の公式サイト（新しいタブ）">公式</a>` : ""}
          </div>
        </td>
      `).join("")}
    </tr>
  `;

  return `
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th class="row-label"></th>
            ${selectCells}
          </tr>
        </thead>
        <tbody>
          ${imageRow}
          ${specRows}
          ${linkRow}
        </tbody>
      </table>
    </div>
  `;
}

// =============================================================
// 描画・イベント
// =============================================================

/** ドロップダウン変更時: 現在の選択値を保持しつつテーブルを再描画 */
function onSelectChange() {
  const colCount = getColCount();
  const currentIds = Array.from({ length: colCount }, (_, i) => {
    const sel = document.getElementById(`sel-${i}`);
    return sel?.value ?? models[i % models.length].id;
  });
  document.getElementById("compareRoot").innerHTML = buildTableHTML(currentIds);
}

/** 全体を描画（初回・リサイズ時） */
function render() {
  const colCount   = getColCount();
  const defaultIds = models.slice(0, colCount).map(m => m.id);
  document.getElementById("compareRoot").innerHTML = buildTableHTML(defaultIds);
}

// =============================================================
// 初期化
// =============================================================
fetch("models.json")
  .then(res => { if (!res.ok) throw new Error(`models.json: HTTP ${res.status}`); return res.json(); })
  .then(data => {
    models = data;
    render();
    window.addEventListener("resize", render);
  })
  .catch(err => {
    console.error("データの読み込みに失敗しました:", err);
    document.getElementById("compareRoot").innerHTML = `
      <div style="text-align:center; padding: 40px 0; color: #666;">
        <div style="font-size: 32px; margin-bottom: 16px;">⚠️</div>
        <div style="font-weight: 700; margin-bottom: 8px;">データの読み込みに失敗しました</div>
        <div style="font-size: 13px;">ローカルで開く場合は <code>python -m http.server</code> などでサーバーを起動してください</div>
      </div>
    `;
  });
