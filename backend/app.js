const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount all API endpoints
app.use('/api', apiRoutes);

// Fallback for unmatched routes (Express 5 compatible)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
