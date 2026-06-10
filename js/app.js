/* ═══════════════════════════════
   CONSTANTS & CONFIGURATION
═══════════════════════════════ */
const STORAGE_KEY          = 'ebv_transactions';
const CATEGORY_STORAGE_KEY = 'ebv_categories'; // ELEMEN BARU: Kunci untuk menyimpan kategori kustom
const DEFAULT_CATEGORIES   = ['Food', 'Transport', 'Fun']; // Kategori bawaan awal aplikasi
const MAX_AMOUNT           = 999_999_999.99;
const MIN_AMOUNT           = 0.01;
const MAX_NAME_LEN         = 100;

// ELEMEN BARU: Palet warna dasar untuk grafik Chart.js
const CATEGORY_COLORS = { 
  Food: '#E07B54', 
  Transport: '#4A90D9', 
  Fun: '#6DBF67' 
};

/* ═══════════════════════════════
   STATE
═══════════════════════════════ */
const state = {
  transactions: [], // ordered oldest → newest
  categories: []    // ELEMEN BARU: Menyimpan daftar kategori aktif (bawaan + kustom)
};

/* ═══════════════════════════════
   LOCALSTORAGE
═══════════════════════════════ */

/**
 * Reads and validates transactions from LocalStorage.
 * Returns an empty array on any failure (parse error, missing key, malformed records).
 * Side-effect: shows a toast warning when data is corrupt or unavailable.
 * @returns {Transaction[]}
 */
function loadFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    // Key not present — fresh start, no toast needed
    if (raw === null) {
      return [];
    }

    const parsed = JSON.parse(raw);

    // Filter out any records that fail the runtime schema guard
    return parsed.filter(t => isValidTransaction(t));
  } catch (err) {
    showToast('Could not load saved transactions. Starting fresh.', 'warning');
    return [];
  }
}

/**
 * Serialises the transactions array to LocalStorage.
 * Throws and re-throws on QuotaExceededError so the caller can handle it.
 * @param {Transaction[]} transactions
 */
function saveToStorage(transactions) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (err) {
    // Re-throw both QuotaExceededError and any other storage errors
    // so callers (addTransaction / deleteTransaction) can show a toast.
    throw err;
  }
}

/**
 * Membaca daftar kategori dari LocalStorage.
 * Jika kosong atau eror, akan mengembalikan 3 kategori default bawaan.
 * @returns {string[]}
 */
function loadCategoriesFromStorage() {
  try {
    const raw = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
    if (raw === null) {
      return [...DEFAULT_CATEGORIES];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [...DEFAULT_CATEGORIES];
  } catch (err) {
    return [...DEFAULT_CATEGORIES];
  }
}

/**
 * Menyimpan daftar kategori terbaru ke dalam LocalStorage.
 * @param {string[]} categories
 */
function saveCategoriesToStorage(categories) {
  try {
    window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
  } catch (err) {
    console.error('Failed to save categories:', err);
  }
}

/* ═══════════════════════════════
   VALIDATION
═══════════════════════════════ */

/**
 * Validates Input_Form values before a Transaction is created.
 *
 * Rules:
 *  - name must not be empty or whitespace-only          → errors.name
 *  - name.trim() must be ≤ MAX_NAME_LEN (100) chars     → errors.name
 *  - rawAmount must not be an empty string              → errors.amount
 *  - rawAmount must parse to a finite number            → errors.amount
 *  - parsed amount must be within [MIN_AMOUNT, MAX_AMOUNT] → errors.amount
 *
 * @param {string} name       - Raw value from the Item Name field.
 * @param {string} rawAmount  - Raw value from the Amount field (always a string).
 * @returns {{ valid: boolean, errors: { name?: string, amount?: string } }}
 */
function validateForm(name, rawAmount) {
  const errors = {};

  // ── Name checks ──────────────────────────────────────────────────────────
  if (!name || name.trim().length === 0) {
    errors.name = 'Item name is required.';
  } else if (name.trim().length > MAX_NAME_LEN) {
    errors.name = 'Item name must be 100 characters or fewer.';
  }

  // ── Amount checks ─────────────────────────────────────────────────────────
  if (rawAmount === '') {
    errors.amount = 'Amount is required.';
  } else {
    const parsed = parseFloat(rawAmount);

    if (isNaN(parsed) || !isFinite(parsed)) {
      errors.amount = 'Please enter a valid number.';
    } else if (parsed < MIN_AMOUNT || parsed > MAX_AMOUNT) {
      errors.amount = 'Amount must be between 0.01 and 999,999,999.99.';
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Runtime guard for records read from LocalStorage.
 * Rejects anything missing required fields or with wrong types/ranges.
 * @param {unknown} t
 * @returns {boolean}
 */
function isValidTransaction(t) {
  if (t === null || typeof t !== 'object') {
    return false;
  }

  if (typeof t.id !== 'string' || t.id.length === 0) {
    return false;
  }

  if (
    typeof t.name !== 'string' ||
    t.name.trim().length === 0 ||
    t.name.length > MAX_NAME_LEN
  ) {
    return false;
  }

  if (
    typeof t.amount !== 'number' ||
    !isFinite(t.amount) ||
    t.amount < MIN_AMOUNT ||
    t.amount > MAX_AMOUNT
  ) {
    return false;
  }

  // Memeriksa apakah kategori transaksi ada di dalam daftar kategori state yang aktif
  if (!state.categories.includes(t.category)) {
    return false;
  }

  if (typeof t.createdAt !== 'number' || !isFinite(t.createdAt)) {
    return false;
  }

  return true;
}

/* ═══════════════════════════════
   RENDER — Chart
═══════════════════════════════ */

/**
 * Aggregates amounts per category from the transactions array.
 * @param {Transaction[]} transactions
 * @returns {{ labels: string[], data: number[], colors: string[] }}
 */
function aggregateByCategory(transactions) {
  const totals = {};
  for (const txn of transactions) {
    totals[txn.category] = (totals[txn.category] || 0) + txn.amount;
  }
  const labels = Object.keys(totals);
  const data   = labels.map(l => +totals[l].toFixed(2));
  const colors = labels.map(l => CATEGORY_COLORS[l]);
  return { labels, data, colors };
}

/** chartInstance will be added in task 6.6 */
let chartInstance = null;

/* ═══════════════════════════════
   STATE MUTATIONS
═══════════════════════════════ */

/**
 * Membuat transaksi baru, memasukkannya ke dalam state, menyimpannya ke LocalStorage,
 * lalu memicu fungsi render untuk memperbarui tampilan UI.
 * * @param {string} name - Nama transaksi (sudah tervalidasi)
 * @param {number} amount - Nilai nominal uang dalam bentuk float angka
 * @param {string} category - Kategori ('Food', 'Transport', atau 'Fun')
 */
function addTransaction(name, amount, category) {
  // 1. Membuat objek transaksi baru sesuai skema data model
  const newTransaction = {
    id: crypto.randomUUID(), // Menghasilkan UUID v4 unik secara native
    name: name.trim(),
    amount: parseFloat(amount),
    category: category,
    createdAt: Date.now() // Timestamp untuk mencatat waktu pembuatan
  };

  // 2. Simpan cadangan state lama untuk mekanisme rollback jika LocalStorage error
  const previousTransactions = [...state.transactions];

  try {
    // 3. Masukkan transaksi baru ke dalam array state (oldest -> newest)
    state.transactions.push(newTransaction);

    // 4. Coba simpan ke LocalStorage
    saveToStorage(state.transactions);

    // 5. Jalankan fungsi render global untuk memperbarui UI (akan dibuat di Fase 3)
    render(state.transactions);
    
    // 6. Tampilkan notifikasi sukses kepada pengguna
    showToast('Transaction added successfully!', 'success');
  } catch (err) {
    // MECHANISM ROLLBACK: Jika penyimpanan gagal (misal: QuotaExceededError)
    // Kembalikan state ke kondisi sebelum transaksi ditambahkan agar data memori tetap sinkron
    state.transactions = previousTransactions;
    
    // Tampilkan pesan eror non-blocking yang informatif
    showToast('Failed to save transaction. Storage might be full.', 'error');
    console.error('Storage error during add:', err);
  }
}

/**
 * Menghapus transaksi berdasarkan ID dari state, menyimpannya kembali ke LocalStorage,
 * lalu memicu fungsi render untuk memperbarui tampilan UI.
 * * @param {string} id - UUID dari transaksi yang ingin dihapus
 * @returns {boolean} - Mengembalikan true jika sukses, false jika gagal disimpan
 */
function deleteTransaction(id) {
  // 1. Cari indeks posisi transaksi di dalam array berdasarkan ID
  const index = state.transactions.findIndex(txn => txn.id === id);
  
  // Jika transaksi tidak ditemukan, batalkan operasi
  if (index === -1) return false;

  // 2. Simpan cadangan state lama untuk mekanisme rollback jika LocalStorage error
  const previousTransactions = [...state.transactions];

  try {
    // 3. Hapus 1 elemen pada indeks yang ditemukan
    state.transactions.splice(index, 1);

    // 4. Coba simpan perubahan terbaru ke LocalStorage
    saveToStorage(state.transactions);

    // 5. Jalankan fungsi render global untuk memperbarui UI (akan dibuat di Fase 3)
    render(state.transactions);

    // 6. Tampilkan notifikasi sukses penghapusan
    showToast('Transaction deleted.', 'info');
    return true;
  } catch (err) {
    // MECHANISM ROLLBACK: Jika penyimpanan gagal saat menghapus
    // Kembalikan baris transaksi ke tempatnya agar data di layar tidak menipu pengguna
    state.transactions = previousTransactions;
    
    // Tampilkan pesan kesalahan di layar
    showToast('Could not complete deletion due to a storage error.', 'error');
    console.error('Storage error during delete:', err);
    return false;
  }
}

/* ═══════════════════════════════
   RENDER — Balance
═══════════════════════════════ */

/**
 * Menghitung total pengeluaran dan memperbarui tampilan teks Angka Balance.
 * Menggunakan format mata uang USD ($) sesuai instruksi [Requirements 3.1, 3.2].
 * @param {Transaction[]} transactions
 */
function renderBalance(transactions) {
  const balanceDisplay = document.getElementById('balance-display');
  if (!balanceDisplay) return;

  // 1. Hitung total penjumlahan dari semua nominal transaksi
  const total = transactions.reduce((sum, txn) => sum + txn.amount, 0);

  // 2. Format angka menjadi mata uang USD ($0.00) menggunakan Intl.NumberFormat native
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  });

  // 3. Masukkan hasil format ke dalam elemen DOM HTML
  balanceDisplay.textContent = formatter.format(total);
}


/* ═══════════════════════════════
   RENDER — Transaction List
═══════════════════════════════ */

/**
 * Mengonversi satu objek data transaksi menjadi elemen baris HTML (<li>) [Requirement 2.1].
 * @param {Transaction} txn
 * @returns {HTMLLIElement}
 */
function createListItem(txn) {
  const li = document.createElement('li');
  li.className = 'txn-item';
  li.setAttribute('data-id', txn.id); // Menyimpan ID di elemen HTML untuk mempermudah penghapusan

  // Format nominal per baris ke dua angka desimal (.toFixed(2))
  const formattedAmount = '$' + txn.amount.toFixed(2);

  // Menyusun struktur dalam baris transaksi lengkap dengan kelas warna kategori
  // Tombol hapus menggunakan aria-label agar ramah pembaca layar (accessibility)
  li.innerHTML = `
    <div class="txn-info">
      <span class="txn-name">${escapeHTML(txn.name)}</span>
      <span class="txn-category txn-category--${txn.category.toLowerCase()}">${txn.category}</span>
    </div>
    <span class="txn-amount">${formattedAmount}</span>
    <button class="btn--delete" aria-label="Delete transaction ${escapeHTML(txn.name)} costing ${formattedAmount}" type="button">✕</button>
  `;

  return li;
}

/**
 * Merender ulang seluruh daftar transaksi di layar dengan menerapkan fungsi sortir/pengurutan [Requirement 2.5].
 * @param {Transaction[]} transactions
 */
function renderList(transactions) {
  const txnList = document.getElementById('transaction-list');
  const listEmpty = document.getElementById('list-empty');
  const sortSelect = document.getElementById('sort-select');
  if (!txnList || !listEmpty) return;

  // 1. Bersihkan isi daftar lama agar tidak terjadi duplikasi visual
  txnList.innerHTML = '';

  // 2. Jika tidak ada transaksi sama sekali, tampilkan tulisan "No transactions recorded yet"
  if (transactions.length === 0) {
    listEmpty.classList.remove('hidden');
    txnList.classList.add('hidden');
    return;
  }

  // 3. Jika ada data, sembunyikan pesan kosong
  listEmpty.classList.add('hidden');
  txnList.classList.remove('hidden');

  // 4. BUAT SALINAN DATA UNTUK DISORTIR (agar tidak merusak urutan asli di state memori)
  const sortedTransactions = [...transactions];
  const sortValue = sortSelect ? sortSelect.value : 'date-desc';

  // Logika pengurutan berdasarkan nilai dropdown yang dipilih pengguna
  sortedTransactions.sort((a, b) => {
    switch (sortValue) {
      case 'date-desc': // Terbaru (Timestamp besar ke kecil)
        return b.createdAt - a.createdAt;
      case 'date-asc': // Terlama (Timestamp kecil ke besar)
        return a.createdAt - b.createdAt;
      case 'amount-desc': // Nominal Tertinggi ke Terendah
        return b.amount - a.amount;
      case 'amount-asc': // Nominal Terendah ke Tertinggi
        return a.amount - b.amount;
      case 'category-asc': // Kategori Berdasarkan Abjad A-Z
        return a.category.localeCompare(b.category);
      default:
        return b.createdAt - a.createdAt;
    }
  });

  // 5. Gambar baris-baris transaksi dari hasil data yang sudah terurut
  sortedTransactions.forEach(txn => {
    const itemNode = createListItem(txn);
    txnList.appendChild(itemNode);
  });
}

/**
 * Mengelompokkan transaksi berdasarkan bulan & tahun, menghitung total pengeluaran,
 * dan merender hasilnya ke dalam tabel ringkasan bulanan [Requirement 2.2].
 * @param {Transaction[]} transactions
 */
function renderMonthlySummary(transactions) {
  const tableBody = document.getElementById('summary-table-body');
  const tableEl = document.getElementById('summary-table');
  const emptyMessage = document.getElementById('summary-empty');
  if (!tableBody || !tableEl || !emptyMessage) return;

  // 1. Bersihkan isi baris tabel lama
  tableBody.innerHTML = '';

  // 2. Jika tidak ada transaksi, sembunyikan tabel dan tampilkan pesan kosong
  if (transactions.length === 0) {
    tableEl.classList.add('hidden');
    emptyMessage.classList.remove('hidden');
    return;
  }

  // Tampilkan tabel dan sembunyikan pesan kosong
  tableEl.classList.remove('hidden');
  emptyMessage.classList.add('hidden');

  // 3. LOGIKA PENGELOMPOKAN (Grouping per Bulan dan Tahun)
  // Objek ini akan berbentuk seperti: { "June 2026": 150000, "May 2026": 75000 }
  const monthlyData = {};

  // Gunakan array salinan agar urutan asli memori tidak terganggu
  const sortedForSummary = [...transactions].sort((a, b) => b.createdAt - a.createdAt);

  sortedForSummary.forEach(txn => {
    const date = new Date(txn.createdAt);
    
    // Ambil nama bulan dalam bahasa Inggris (e.g., "June", "January") dan tahunnya
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    const year = date.getFullYear();
    const monthYearKey = `${monthName} ${year}`;

    // Akumulasikan nominal transaksi ke bulan yang sesuai
    if (!monthlyData[monthYearKey]) {
      monthlyData[monthYearKey] = 0;
    }
    monthlyData[monthYearKey] += txn.amount;
  });

  // 4. GAMBAR BARIS TABEL DI LAYAR
  // Lakukan perulangan untuk setiap bulan yang berhasil dikelompokkan
  for (const [monthYear, totalSpent] of Object.entries(monthlyData)) {
    const row = document.createElement('tr');

    // Kolom 1: Nama Bulan & Tahun
    const monthCell = document.createElement('td');
    monthCell.textContent = monthYear;
    row.appendChild(monthCell);

    // Kolom 2: Total Pengeluaran (Diformat dengan mata uang dolar $)
    const amountCell = document.createElement('td');
    amountCell.textContent = `$${totalSpent.toFixed(2)}`;
    row.appendChild(amountCell);

    // Masukkan baris ke dalam badan tabel
    tableBody.appendChild(row);
  }
}

/**
 * Fungsi pembantu untuk mencegah serangan XSS (keamanan input teks dari user)
 */
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}


/* ═══════════════════════════════
   RENDER — Chart
═══════════════════════════════ */

/**
 * Menginisialisasi atau memperbarui diagram Pie Chart dari library Chart.js [Requirement 4.1, 4.2].
 * @param {Transaction[]} transactions
 */
function renderChart(transactions) {
  const chartCanvas = document.getElementById('spending-chart');
  const chartEmpty = document.getElementById('chart-empty');
  if (!chartCanvas || !chartEmpty) return;

  // GUARD CONDITION: Jika CDN Chart.js gagal dimuat atau diblokir internet [Requirement 5.4 / Error Handling]
  if (typeof Chart === 'undefined') {
    chartCanvas.classList.add('hidden');
    chartEmpty.textContent = 'Chart visualizer is currently unavailable (CDN Offline).';
    chartEmpty.classList.remove('hidden');
    return;
  }

  // 1. Jika data kosong, sembunyikan Canvas grafik dan tampilkan pesan placeholder kosong
  if (transactions.length === 0) {
    chartCanvas.classList.add('hidden');
    chartEmpty.classList.remove('hidden');
    return;
  }

  // 2. Jika ada data, tampilkan canvas dan hitung agregasi datanya
  chartEmpty.classList.add('hidden');
  chartCanvas.classList.remove('hidden');

  const { labels, data, colors } = aggregateByCategory(transactions);

  // 3. LIVE UPDATE STRATEGY: Gunakan satu instance secara kontinu agar tidak terjadi tabrakan canvas
  if (chartInstance === null) {
    // Pembuatan objek Chart.js pertama kali saat aplikasi dibuka
    chartInstance = new Chart(chartCanvas, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { size: 14 } }
          },
          tooltip: {
            callbacks: {
              // Menghitung persentase porsi kategori secara dinamis di dalam tooltip saat diarahkan mouse
              label(context) {
                const totalAmount = context.dataset.data.reduce((a, b) => a + b, 0);
                const currentVal = context.parsed;
                const percentage = totalAmount > 0 ? ((currentVal / totalAmount) * 100).toFixed(1) : '0.0';
                return ` ${context.label}: ${percentage}%`;
              }
            }
          }
        }
      }
    });
  } else {
    // Mutasi data secara langsung (in-place) jika grafik sudah ada di layar, lalu picu .update()
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
  }
}

/**
 * Memperbarui isi pilihan (options) pada elemen dropdown select kategori di dalam form [Requirement 1.1].
 * Diambil secara dinamis dari data kategori yang sedang aktif di dalam state.
 * @param {string[]} categories
 */
function renderCategoryOptions(categories) {
  const categorySelect = document.getElementById('category');
  if (!categorySelect) return;

  // Simpan nilai yang sedang dipilih saat ini agar tidak ter-reset secara tidak sengaja
  const currentValue = categorySelect.value;

  // Bersihkan isi dropdown lama
  categorySelect.innerHTML = '';

  // Buat ulang elemen <option> untuk setiap kategori yang terdaftar
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categorySelect.appendChild(option);
  });

  // Kembalikan pilihan ke nilai sebelumnya jika nilai tersebut masih ada di daftar baru
  if (categories.includes(currentValue)) {
    categorySelect.value = currentValue;
  } else {
    categorySelect.value = categories[0] || 'Food';
  }
}

/* ═══════════════════════════════
   RENDER — Orchestrator
═══════════════════════════════ */

/**
 * Konduktor tunggal yang mengatur sinkronisasi seluruh UI secara bersamaan setiap kali state berubah.
 * Memastikan semua perubahan selesai serentak dalam waktu < 100ms [Requirement 7.2].
 * @param {Transaction[]} transactions
 */
function render(transactions) {
  renderBalance(transactions);
  renderList(transactions);
  renderChart(transactions);
  renderMonthlySummary(transactions);
}

/* ═══════════════════════════════
   EVENT HANDLERS
═══════════════════════════════ */

/**
 * Menangani aksi submit pada form tambah transaksi [Requirement 1.2].
 * @param {SubmitEvent} e
 */
function handleFormSubmit(e) {
  e.preventDefault(); // Mencegah halaman melakukan reload otomatis

  // 1. Ambil elemen input dari DOM
  const itemNameInput = document.getElementById('item-name');
  const amountInput = document.getElementById('amount');
  const categorySelect = document.getElementById('category');
  const errorNameSpan = document.getElementById('error-item-name');
  const errorAmountSpan = document.getElementById('error-amount');

  if (!itemNameInput || !amountInput || !categorySelect) return;

  // 2. Bersihkan pesan kesalahan inline yang lama sebelum validasi baru dimulai
  errorNameSpan.textContent = '';
  errorAmountSpan.textContent = '';

  const rawName = itemNameInput.value;
  const rawAmount = amountInput.value;
  const selectedCategory = categorySelect.value;

  // 3. Jalankan fungsi Validator core [Requirement 1.4, 1.5, 1.6]
  const validation = validateForm(rawName, rawAmount);

  if (!validation.valid) {
    // Jika data tidak valid, petakan pesan eror ke elemen HTML masing-masing
    if (validation.errors.name) {
      errorNameSpan.textContent = validation.errors.name;
    }
    if (validation.errors.amount) {
      errorAmountSpan.textContent = validation.errors.amount;
    }
    return; // Batalkan proses pembuatan transaksi jika ada eror
  }

  // 4. Jika validasi lolos, panggil fungsi mutasi state untuk menyimpan data
  addTransaction(rawName, rawAmount, selectedCategory);

  // 5. Reset form kembali ke kondisi default setelah sukses [Requirement 1.3]
  itemNameInput.value = '';
  amountInput.value = '';
  categorySelect.value = 'Food';
}

/**
 * Mengambil teks dari input kategori kustom, memvalidasinya, menyimpannya ke state & LocalStorage,
 * serta memperbarui tampilan dropdown pilihan kategori secara real-time.
 */
function handleCreateCategory() {
  const newCatInput = document.getElementById('new-category-name');
  const errorCustomSpan = document.getElementById('error-custom-category');
  if (!newCatInput || !errorCustomSpan) return;

  // 1. Bersihkan pesan kesalahan lama
  errorCustomSpan.textContent = '';

  const rawName = newCatInput.value.trim();

  // 2. VALIDASI INPUT KATEGORI KUSTOM
  if (rawName.length === 0) {
    errorCustomSpan.textContent = 'Category name cannot be empty.';
    return;
  }
  
  if (rawName.length > 20) {
    errorCustomSpan.textContent = 'Category name must be 20 characters or fewer.';
    return;
  }

  // Format agar huruf pertamanya kapital (misal: "laundry" menjadi "Laundry")
  const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  // Periksa apakah kategori tersebut sudah pernah terdaftar sebelumnya
  if (state.categories.includes(formattedName)) {
    errorCustomSpan.textContent = 'This category already exists.';
    return;
  }

  // 3. MUTASI DATA STATE & SIMPAN KE LOCALSTORAGE
  state.categories.push(formattedName);
  saveCategoriesToStorage(state.categories);

  // 4. UPDATE TAMPILAN DROPDOWN FORM
  renderCategoryOptions(state.categories);

  // 5. Kosongkan kembali kolom inputan teks dan beri notifikasi sukses
  newCatInput.value = '';
  showToast(`Category "${formattedName}" added!`, 'success');
}

/**
 * Menangani delegasi klik di dalam area daftar transaksi (misalnya untuk aksi hapus).
 * @param {Event} e
 */
function handleListClick(e) {
  // 1. Deteksi klik: cari elemen terdekat yang memiliki kelas btn--delete ATAU tombol itu sendiri
  const deleteBtn = e.target.closest('.btn--delete') || e.target.classList.contains('btn--delete') ? e.target.closest('.btn--delete') : null;
  
  // Taktik cadangan jika closest bawaan browser sedang macet: periksa via properti tagName
  const backupBtn = e.target.tagName === 'BUTTON' && e.target.classList.contains('btn--delete') ? e.target : e.target.parentElement;

  const finalBtn = deleteBtn || (backupBtn && backupBtn.classList.contains('btn--delete') ? backupBtn : null);

  if (!finalBtn) return;

  // 2. Ambil ID unik transaksi dari tombol yang valid
  const txnId = finalBtn.getAttribute('data-id') || finalBtn.parentElement.getAttribute('data-id');
  if (!txnId) return;

  // 3. Tambahkan konfirmasi pop-up agar tidak sengaja terhapus
  const yakinHapus = confirm("Are you sure you want to delete this transaction?");
  if (!yakinHapus) {
    return; // Batalkan jika menekan Cancel
  }

  // 4. Jalankan fungsi hapus transaksi
  const success = deleteTransaction(txnId);

  // 5. Jika berhasil dihapus, render ulang UI dan munculkan notifikasi info
  if (success) {
    render(state.transactions);
    showToast('Transaction deleted successfully', 'info');
  } else {
    showToast('Failed to delete transaction', 'error');
  }
}

/**
 * Memasang pendengar event (Event Listeners) untuk membersihkan eror secara real-time saat user mengetik kembali
 */
function setupInputListeners() {
  const itemNameInput = document.getElementById('item-name');
  const amountInput = document.getElementById('amount');
  
  if (itemNameInput) {
    itemNameInput.addEventListener('input', () => {
      document.getElementById('error-item-name').textContent = '';
    });
  }
  if (amountInput) {
    amountInput.addEventListener('input', () => {
      document.getElementById('error-amount').textContent = '';
    });
  }
}


/* ═══════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════ */

let toastTimeoutId = null;

/**
 * Menampilkan pesan melayang (non-blocking notification) di pojok layar dengan warna dinamis [Requirement 2.4, 5.4].
 * @param {string} message - Isi pesan yang ingin disampaikan
 * @param {'info'|'success'|'error'|'warning'} type - Tipe warna toast
 * @param {number} duration - Durasi pemunculan dalam milidetik (default 4000ms)
 */
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  // 1. Bersihkan timeout lama jika ada toast lain yang sedang berjalan
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toast.className = 'toast'; // Reset kelas modifier
  }

  // 2. Pasang pesan dan kelas warna yang sesuai (sukses = hijau, error = merah)
  toast.textContent = message;
  toast.classList.add(`toast--${type}`);
  toast.classList.add('toast--show');

  // 3. Atur mekanisme auto-dismiss (menghilang otomatis setelah durasi habis)
  toastTimeoutId = setTimeout(() => {
    toast.classList.remove('toast--show');
    toastTimeoutId = null;
  }, duration);
}


/* ═══════════════════════════════
   BOOTSTRAP
═══════════════════════════════ */

/**
 * Pintu masuk utama aplikasi yang dijalankan saat struktur HTML selesai dimuat [Requirement 5.3].
 */
function init() {
  // 1. ELEMEN BARU: Ambil daftar kategori aktif (bawaan + kustom) dari LocalStorage
  state.categories = loadCategoriesFromStorage();
  
  // 2. ELEMEN BARU: Gambar pilihan dropdown kategori di form utama secara dinamis
  renderCategoryOptions(state.categories);

  // 3. Ambil data transaksi lama yang tersimpan dari LocalStorage
  state.transactions = loadFromStorage();

  // 4. Jalankan rendering awal agar grafik dan tabel langsung muncul di layar browser [Requirement 5.3]
  render(state.transactions);

  // 5. Hubungkan form pengisian dengan fungsi handler submit
  const transactionForm = document.getElementById('transaction-form');
  if (transactionForm) {
    transactionForm.addEventListener('submit', handleFormSubmit);
  }

  // 6. Hubungkan area list dengan handler klik (menggunakan delegasi klik)
  const transactionList = document.getElementById('transaction-list');
  if (transactionList) {
    transactionList.addEventListener('click', handleListClick);
  }

  // 7. Hubungkan Dropdown Sortir agar langsung merender ulang list saat diganti
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      renderList(state.transactions);
    });
  }

  // 8. ELEMEN BARU: Hubungkan tombol "Add" kategori kustom dengan fungsi handlernya
  const btnAddCategory = document.getElementById('btn-add-category');
  if (btnAddCategory) {
    btnAddCategory.addEventListener('click', handleCreateCategory);
  }

  // 9. Jalankan pemantau ketikan untuk membersihkan pesan kesalahan secara instan
  setupInputListeners();
}

// Menunggu dokumen HTML siap sebelum mengeksekusi fungsi init
document.addEventListener('DOMContentLoaded', init);