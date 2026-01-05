const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// --- 1. KUNCI PORT (Agar Sinkron dengan Railway) ---
const PORT = process.env.PORT || 8080;

// --- 2. SOLUSI CORS (BAGIAN TERPENTING) ---
// Kita ganti '*' dengan domain spesifik Anda.
// Ini syarat mutlak jika credentials: true.
app.use(cors({
    origin: [
        'https://alistiqomahcibiru.my.id',  // Domain Production (Website Asli)
        'http://localhost:3000'             // Domain Local (Untuk Testing di Laptop)
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// --- 3. CONFIG UPLOAD FOLDER ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

// --- 4. KONEKSI DATABASE ---
const db = mysql.createPool({
    host: 'mysql.railway.internal',
    user: 'root',
    password: 'VeKAZcGNiFSEHRsrKPRPMQwAIvTmLsbZ',
    database: 'railway',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Cek koneksi DB saat start
db.getConnection((err, conn) => {
    if (err) {
        console.error("❌ DB ERROR:", err.message);
    } else {
        console.log("✅ DB CONNECTED!");
        conn.release();
    }
});

// --- 5. SETUP MULTER (UPLOAD) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- 6. API ROUTES ---

app.get('/', (req, res) => {
    res.send(`Backend Voting App Berjalan Aman di Port ${PORT}`);
});

// Get Candidates
app.get('/api/candidates', (req, res) => {
    db.query('SELECT * FROM kandidat ORDER BY no_urut ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// POST Candidate (Simpan Data)
app.post('/api/candidates', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color } = req.body;
    const foto = req.file ? req.file.filename : null;

    const query = 'INSERT INTO kandidat (no_urut, nama, visi, color, foto, votes) VALUES (?, ?, ?, ?, ?, 0)';
    db.query(query, [no_urut, nama, visi, color, foto], (err) => {
        if (err) {
            console.error("Gagal Simpan Kandidat:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
    });
});

// Update Candidate
app.put('/api/candidates/:id', upload.single('foto'), (req, res) => {
    const { no_urut, nama, visi, color, foto_lama } = req.body;
    const foto = req.file ? req.file.filename : foto_lama;

    const query = 'UPDATE kandidat SET no_urut=?, nama=?, visi=?, color=?, foto=? WHERE id=?';
    db.query(query, [no_urut, nama, visi, color, foto, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Delete Candidate
app.delete('/api/candidates/:id', (req, res) => {
    db.query('DELETE FROM kandidat WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Check Quota
app.post('/api/check-quota', (req, res) => {
    const { alamat } = req.body;
    db.query('SELECT COUNT(*) as count FROM pemilih WHERE alamat = ?', [alamat], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0] || { count: 0 }); 
    });
});

// Vote
app.post('/api/vote', (req, res) => {
    const { candidateId, nama, alamat, kk } = req.body;
    
    // Transaksi sederhana: Update Vote dulu, baru Simpan Pemilih
    db.query('UPDATE kandidat SET votes = votes + 1 WHERE id = ?', [candidateId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query('INSERT INTO pemilih (nama_pemilih, alamat, kepala_keluarga) VALUES (?, ?, ?)', [nama, alamat, kk], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// Get Voters
app.get('/api/voters', (req, res) => {
    db.query('SELECT * FROM pemilih ORDER BY waktu_vote DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Delete Voter
app.delete('/api/voters/:id', (req, res) => {
    db.query('DELETE FROM pemilih WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Logs
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

// Reset System
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
app.listen(PORT, () => {
    console.log(`Server Backend Berjalan di Port ${PORT}`);
});