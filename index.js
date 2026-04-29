const express = require('express');
const cors = require('cors');
const path = require('path');
const downloadRouter = require('./routes/download');
const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/analyze', analyzeRouter);
app.use('/api/download', downloadRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎬 Video Downloader chạy tại http://localhost:${PORT}`);
});
