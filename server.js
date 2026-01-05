const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// --- PENTING: PORT CONFIGURATION (HANYA SEKALI DEKLARASI) ---
// Ini akan menggunakan Port dari Railway (process.env.PORT)
// Jika di lokal/tidak ada env, akan pakai 8080
const PORT = process.env.PORT || 8080;

// --- 1. MIDDLEWARE ---
app.use(cors({
    origin: '*', // Izinkan semua akses sementara
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// --- 2. FOLDER UPLOADS ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// --- 3. KONEKSI DATABASE ---
const db = mysql.createPool({
    host: 'mysql.railway.internal',       // Host Internal Railway
    user: 'root',                         // User default
    password: 'VeKAZcGNiFSEHRsrKPRPMQwAIvTmLsbZ', // PASSWORD ANDA
    database: 'railway',                  // Nama DB
    port: 3306,                           // Port
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Cek Koneksi saat server nyala
db.getConnection((err, conn) => {
    if (err) {
        console.error("❌ KONEKSI DATABASE GAGAL:", err.message);
    } else {
        console.log("✅ BERHASIL TERHUBUNG KE DATABASE RAILWAY!");
        conn.release();
    }
});

// --- 4. AUTO-SETUP TABLE ---
const initDatabase = () => {
    const tableKandidat = `CREATE TABLE IF NOT EXISTS kandidat (id INT AUTO_INCREMENT PRIMARY KEY, no_urut INT, nama VARCHAR(255), visi TEXT, color VARCHAR(50), foto VARCHAR(255), votes INT DEFAULT 0)`;
    const tablePemilih = `CREATE TABLE IF NOT EXISTS pemilih (id INT AUTO_INCREMENT PRIMARY KEY, nama_pemilih VARCHAR(255), alamat VARCHAR(255), kepala_keluarga VARCHAR(255), waktu_vote TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    const tableLogs = `CREATE TABLE IF NOT EXISTS admin_logs (id INT AUTO_INCREMENT PRIMARY KEY, action VARCHAR(255), timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;

    db.query(tableKandidat, (e) => { if(e) console.log("Err Kandidat:", e.message); else console.log("Tabel Kandidat Aman"); });
    db.query(tablePemilih, (e) => { if(e) console.log("Err Pemilih:", e.message); else console.log("Tabel Pemilih Aman"); });
    db.query(tableLogs, (e) => { if(e) console.log("Err Logs:", e.message); else console.log("Tabel Logs Aman"); });
};
initDatabase();

// --- 5. MULTER CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- 6. API ROUTES ---

// Route Cek Server
app.get('/', (req, res) => {
    res.send(`Backend E-Voting Siap di Port ${PORT}! Database Status: Connected`);
});

app.get('/api/candidates', (req, res) => {
    db.query('SELECT * FROM kandidat ORDER BY no_urut ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/candidates', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color } = req.body;
    const foto = req.file ? req.file.filename : null;
    db.query('INSERT INTO kandidat (no_urut, nama, visi, color, foto, votes) VALUES (?, ?, ?, ?, ?, 0)', [no_urut, nama, visi, color, foto], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/candidates/:id', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color, foto_lama } = req.body;
    const foto = req.file ? req.file.filename : foto_lama;
    db.query('UPDATE kandidat SET no_urut=?, nama=?, visi=?, color=?, foto=? WHERE id=?', [no_urut, nama, visi, color, foto, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/candidates/:id', (req, res) => {
    db.query('DELETE FROM kandidat WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/check-quota', (req, res) => {
    const { alamat } = req.body;
    db.query('SELECT COUNT(*) as count FROM pemilih WHERE alamat = ?', [alamat], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || { count: 0 }); 
    });
});

app.get('/api/voters', (req, res) => {
    db.query('SELECT * FROM pemilih ORDER BY waktu_vote DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/vote', (req, res) => {
    const { candidateId, nama, alamat, kk } = req.body;
    db.query('UPDATE kandidat SET votes = votes + 1 WHERE id = ?', [candidateId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('INSERT INTO pemilih (nama_pemilih, alamat, kepala_keluarga) VALUES (?, ?, ?)', [nama, alamat, kk], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.delete('/api/voters/:id', (req, res) => {
    db.query('DELETE FROM pemilih WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/api/admin-logs', (req, res) => {
    db.query('SELECT * FROM admin_logs ORDER BY timestamp DESC LIMIT 50', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
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

// --- 7. START SERVER ---
// Menggunakan variabel PORT yang sudah dideklarasikan di baris paling atas
app.listen(PORT, () => {
    console.log(`Server Backend Berjalan di Port ${PORT}`);
});