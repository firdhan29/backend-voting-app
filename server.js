const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

// --- 1. MIDDLEWARE ---
app.use(cors({
    origin: 'https://alistiqomahcibiru.my.id', // Pastikan pakai HTTPS dan nama domain Anda
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// --- 2. FOLDER UPLOADS ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// --- 3. KONEKSI DATABASE ---
const db = mysql.createPool({
    host: 'mysql.railway.internal',
    user: 'root',       // Default XAMPP
    password: 'VeKAZcGNiFSEHRsrKPRPMQwAIvTmLsbZ',       // Default XAMPP (kosong)
    database: 'railway', // Pastikan database ini sudah dibuat di phpMyAdmin
    port: 3306,                                   // Copy dari MYSQLPORT (Hapus tanda kutip jika angka)
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- 4. AUTO-SETUP DATABASE (FITUR BARU) ---
// Fungsi ini akan otomatis membuat tabel jika belum ada
const initDatabase = () => {
    const tableKandidat = `
        CREATE TABLE IF NOT EXISTS kandidat (
            id INT AUTO_INCREMENT PRIMARY KEY,
            no_urut INT NOT NULL,
            nama VARCHAR(255) NOT NULL,
            visi TEXT,
            color VARCHAR(50),
            foto VARCHAR(255),
            votes INT DEFAULT 0
        )
    `;
    
    const tablePemilih = `
        CREATE TABLE IF NOT EXISTS pemilih (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nama_pemilih VARCHAR(255) NOT NULL,
            alamat VARCHAR(255) NOT NULL,
            kepala_keluarga VARCHAR(255),
            waktu_vote TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    const tableLogs = `
        CREATE TABLE IF NOT EXISTS admin_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            action VARCHAR(255) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.query(tableKandidat, (err) => {
        if (err) console.error('Gagal buat tabel kandidat:', err);
        else console.log('✅ Tabel Kandidat Siap');
    });
    db.query(tablePemilih, (err) => {
        if (err) console.error('Gagal buat tabel pemilih:', err);
        else console.log('✅ Tabel Pemilih Siap');
    });
    db.query(tableLogs, (err) => {
        if (err) console.error('Gagal buat tabel logs:', err);
        else console.log('✅ Tabel Logs Siap');
    });
};

// Jalankan setup database saat server nyala
initDatabase();

// --- 5. MULTER CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- 6. API ROUTES ---

// GET KANDIDAT
app.get('/api/candidates', (req, res) => {
    db.query('SELECT * FROM kandidat ORDER BY no_urut ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// TAMBAH KANDIDAT
app.post('/api/candidates', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color } = req.body;
    const foto = req.file ? req.file.filename : null;
    db.query('INSERT INTO kandidat (no_urut, nama, visi, color, foto, votes) VALUES (?, ?, ?, ?, ?, 0)', 
    [no_urut, nama, visi, color, foto], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// EDIT KANDIDAT
app.put('/api/candidates/:id', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color, foto_lama } = req.body;
    const foto = req.file ? req.file.filename : foto_lama;
    db.query('UPDATE kandidat SET no_urut=?, nama=?, visi=?, color=?, foto=? WHERE id=?', 
    [no_urut, nama, visi, color, foto, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// HAPUS KANDIDAT
app.delete('/api/candidates/:id', (req, res) => {
    db.query('DELETE FROM kandidat WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// CEK KUOTA PEMILIH
app.post('/api/check-quota', (req, res) => {
    const { alamat } = req.body;
    db.query('SELECT COUNT(*) as count FROM pemilih WHERE alamat = ?', [alamat], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || { count: 0 }); 
    });
});

// AMBIL DATA PEMILIH
app.get('/api/voters', (req, res) => {
    db.query('SELECT * FROM pemilih ORDER BY waktu_vote DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// PROSES VOTE
app.post('/api/vote', (req, res) => {
    const { candidateId, nama, alamat, kk } = req.body;
    // 1. Tambah vote kandidat
    db.query('UPDATE kandidat SET votes = votes + 1 WHERE id = ?', [candidateId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        // 2. Simpan data pemilih
        db.query('INSERT INTO pemilih (nama_pemilih, alamat, kepala_keluarga) VALUES (?, ?, ?)', 
        [nama, alamat, kk], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// HAPUS PEMILIH
app.delete('/api/voters/:id', (req, res) => {
    db.query('DELETE FROM pemilih WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// LOGS
app.get('/api/admin-logs', (req, res) => {
    db.query('SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT 50', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results); // Pastikan selalu array, jika error db akan masuk catch client
    });
});

app.post('/api/admin-logs', (req, res) => {
    const { action } = req.body;
    db.query('INSERT INTO admin_logs (action) VALUES (?)', [action], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/reset-system', (req, res) => {
    db.query('UPDATE kandidat SET votes = 0', (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('TRUNCATE TABLE pemilih', (err) => {
            if (err) return res.status(500).json({ error: err.message });
            db.query("INSERT INTO admin_logs (action) VALUES ('SYSTEM RESET')", () => {
                res.json({ success: true });
            });
        });
    });
});

// --- JALANKAN SERVER ---
app.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`🚀 Server Backend Berjalan di Port ${PORT}`);
    console.log(`==========================================`);
});