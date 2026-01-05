const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// --- PERBAIKAN PENTING: PORT ---
// Railway akan otomatis mengisi process.env.PORT. 
// Jika di laptop, dia pakai 5000.
const PORT = process.env.PORT || 5000;

// --- 1. MIDDLEWARE ---
app.use(cors({
    origin: '*', // Tips: Pakai '*' dulu agar tidak kena blokir CORS saat testing
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
    // Menggunakan Environment Variables agar aman & otomatis deteksi di Railway
    host: process.env.MYSQLHOST || 'mysql.railway.internal',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'VeKAZcGNiFSEHRsrKPRPMQwAIvTmLsbZ',
    database: process.env.MYSQLDATABASE || 'railway',
    port: process.env.MYSQLPORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- 4. AUTO-SETUP DATABASE ---
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

    db.getConnection((err, conn) => {
        if (err) {
            console.error("❌ Gagal koneksi database:", err.message);
            return;
        }
        console.log("✅ Terhubung ke Database!");
        
        conn.query(tableKandidat, (e) => { if(e) console.log(e); else console.log("Tabel Kandidat OK"); });
        conn.query(tablePemilih, (e) => { if(e) console.log(e); else console.log("Tabel Pemilih OK"); });
        conn.query(tableLogs, (e) => { if(e) console.log(e); else console.log("Tabel Logs OK"); });
        
        conn.release();
    });
};

initDatabase();

// --- 5. MULTER CONFIG ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- 6. API ROUTES ---

// Cek status server
app.get('/', (req, res) => {
    res.send("Backend E-Voting Berjalan Normal!");
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
    db.query('INSERT INTO kandidat (no_urut, nama, visi, color, foto, votes) VALUES (?, ?, ?, ?, ?, 0)', 
    [no_urut, nama, visi, color, foto], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/candidates/:id', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color, foto_lama } = req.body;
    const foto = req.file ? req.file.filename : foto_lama;
    db.query('UPDATE kandidat SET no_urut=?, nama=?, visi=?, color=?, foto=? WHERE id=?', 
    [no_urut, nama, visi, color, foto, req.params.id], (err) => {
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
        db.query('INSERT INTO pemilih (nama_pemilih, alamat, kepala_keluarga) VALUES (?, ?, ?)', 
        [nama, alamat, kk], (err) => {
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

// --- JALANKAN SERVER ---
app.listen(PORT, () => {
    console.log(`Server Backend Berjalan di Port ${PORT}`);
});